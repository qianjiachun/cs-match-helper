use crate::counter_strafing::types::{
    BindingRole, CounterStrafingKeyMap, CounterStrafingSettings, CounterStrafingSnapshot, FireSampleKind,
    InputBinding, InputEvent, InputSource, ShootingErrorReason, ShootingErrorRecord,
};
use std::time::{SystemTime, UNIX_EPOCH};

const MICRO_SPEED_RATIO: f64 = 1.5;
const STARTUP_GRACE_MAX_SPEED_RATIO: f64 = 2.0;
const TIME_EPS: f64 = 1e-6;
/// 单次按住最长时长；超过则强制结束开火采样，防止漏 UP 时无限连发。
const MAX_FIRE_HOLD_SECS: f64 = 30.0;
/// 连发采样次数上限（默认 100ms 间隔下约 30 秒）。
const MAX_AUTO_FIRE_SAMPLES: u32 = 300;

pub struct CounterStrafingEngine {
    settings: CounterStrafingSettings,
    movement: MovementEstimator,
    movement_pressed: [bool; 4],
    crouch_pressed: bool,
    fire_pressed: bool,
    fire_scheduler: FireScheduler,
    last_crouch_release_time: Option<f64>,
    last_movement_input_time: Option<f64>,
    /// 各移动方向最近按下时间：[forward, back, left, right]
    movement_press_times: [Option<f64>; 4],
    shot_records: Vec<ShootingErrorRecord>,
    last_tick_time: f64,
    session_start_time: f64,
}

struct FireScheduler {
    active: bool,
    down_time: f64,
    first_due_time: f64,
    first_sample_emitted: bool,
    last_sample_time: f64,
    sequence_index: u32,
}

impl FireScheduler {
    fn new() -> Self {
        Self {
            active: false,
            down_time: 0.0,
            first_due_time: 0.0,
            first_sample_emitted: false,
            last_sample_time: -1.0,
            sequence_index: 0,
        }
    }

    fn reset(&mut self) {
        *self = Self::new();
    }

    fn on_fire_down(&mut self, time: f64, delay_ms: f64) {
        self.active = true;
        self.down_time = time;
        self.first_due_time = time + delay_ms / 1000.0;
        self.first_sample_emitted = false;
        self.last_sample_time = -1.0;
        self.sequence_index = 0;
    }

    fn on_fire_up(&mut self) {
        self.active = false;
    }

    fn exceeds_guard(&self, now: f64) -> bool {
        if !self.active {
            return false;
        }
        if self.first_sample_emitted && self.sequence_index >= MAX_AUTO_FIRE_SAMPLES {
            return true;
        }
        now - self.down_time >= MAX_FIRE_HOLD_SECS
    }

    fn force_release(&mut self) {
        self.active = false;
        self.first_sample_emitted = true;
    }

    fn mark_first_sample(&mut self, time: f64) {
        self.first_sample_emitted = true;
        self.last_sample_time = time;
        self.sequence_index = 1;
    }

    fn mark_auto_sample(&mut self, time: f64) {
        self.last_sample_time = time;
        self.sequence_index += 1;
    }

    fn needs_tap_finalize(&self) -> bool {
        self.active && !self.first_sample_emitted
    }

    fn is_pending_first_sample(&self) -> bool {
        self.active && !self.first_sample_emitted
    }

    fn finalize_tap(&mut self, sample_time: f64) {
        self.first_sample_emitted = true;
        self.last_sample_time = sample_time;
        self.sequence_index = 1;
        self.active = false;
    }

    fn sequence_index(&self) -> u32 {
        self.sequence_index
    }

    fn first_due_time(&self) -> f64 {
        self.first_due_time
    }

    fn next_sample_due_time(&self, tap_max_ms: f64, auto_interval_ms: f64) -> Option<f64> {
        if !self.active {
            return None;
        }
        if !self.first_sample_emitted {
            return Some(self.first_due_time);
        }
        let tap_deadline = self.down_time + tap_max_ms / 1000.0;
        let interval = auto_interval_ms / 1000.0;
        let next_auto = self.last_sample_time + interval;
        Some(next_auto.max(tap_deadline))
    }
}

struct MovementEstimator {
    vel_x: f64,
    vel_y: f64,
    last_time: f64,
    stop_success_time: Option<f64>,
    counter_strafe_active: bool,
    axis_conflict: bool,
}

impl MovementEstimator {
    fn new() -> Self {
        Self {
            vel_x: 0.0,
            vel_y: 0.0,
            last_time: -1.0,
            stop_success_time: None,
            counter_strafe_active: false,
            axis_conflict: false,
        }
    }

    fn advance_to(
        &mut self,
        time: f64,
        movement_pressed: &[bool; 4],
        movement_press_times: &[Option<f64>; 4],
        settings: &CounterStrafingSettings,
    ) {
        if self.last_time < 0.0 {
            self.last_time = time;
            return;
        }
        let dt = (time - self.last_time).max(0.0);
        if dt <= 0.0 {
            return;
        }

        let previous_speed = self.speed();
        let threshold = accuracy_threshold(settings);
        let (input_x, conflict_x) = resolve_axis_input(
            movement_pressed[2],
            movement_pressed[3],
            movement_press_times[2],
            movement_press_times[3],
        );
        let (input_y, conflict_y) = resolve_axis_input(
            movement_pressed[0],
            movement_pressed[1],
            movement_press_times[0],
            movement_press_times[1],
        );
        self.axis_conflict = conflict_x || conflict_y;

        let x_advance = advance_axis(
            &mut self.vel_x,
            input_x,
            dt,
            settings.max_move_speed,
            settings.accel_per_sec,
            settings.natural_decel_per_sec,
            settings.counter_strafe_accel_per_sec,
            threshold,
        );
        let y_advance = advance_axis(
            &mut self.vel_y,
            input_y,
            dt,
            settings.max_move_speed,
            settings.accel_per_sec,
            settings.natural_decel_per_sec,
            settings.counter_strafe_accel_per_sec,
            threshold,
        );
        self.counter_strafe_active = x_advance.counter || y_advance.counter;

        let speed = self.speed();
        if speed > threshold {
            self.stop_success_time = None;
        } else if previous_speed > threshold {
            let cross_dt = earliest_dt(x_advance.threshold_cross_dt, y_advance.threshold_cross_dt)
                .unwrap_or_else(|| interpolate_threshold_cross_dt(previous_speed, speed, threshold, dt));
            self.stop_success_time = Some(self.last_time + cross_dt.clamp(0.0, dt));
        } else if self.stop_success_time.is_none() {
            self.stop_success_time = Some(time);
        }

        self.last_time = time;
    }

    fn speed(&self) -> f64 {
        (self.vel_x * self.vel_x + self.vel_y * self.vel_y).sqrt()
    }
}

/// 同轴输入：双键重叠时取最近按下的方向作为有效输入（模拟 CS2 反向急停制动）。
fn resolve_axis_input(
    neg_pressed: bool,
    pos_pressed: bool,
    neg_press_time: Option<f64>,
    pos_press_time: Option<f64>,
) -> (i8, bool) {
    match (neg_pressed, pos_pressed) {
        (false, false) => (0, false),
        (true, false) => (-1, false),
        (false, true) => (1, false),
        (true, true) => {
            let input = match (neg_press_time, pos_press_time) {
                (Some(nt), Some(pt)) if pt >= nt => 1,
                (Some(_), Some(_)) => -1,
                (Some(_), None) => -1,
                (None, Some(_)) => 1,
                (None, None) => 0,
            };
            (input, true)
        }
    }
}

fn apply_natural_decel(vel: &mut f64, dt: f64, decel: f64) {
    if vel.abs() <= decel * dt {
        *vel = 0.0;
    } else {
        *vel -= vel.signum() * decel * dt;
    }
}

struct AxisAdvance {
    counter: bool,
    threshold_cross_dt: Option<f64>,
}

fn advance_axis(
    vel: &mut f64,
    input: i8,
    dt: f64,
    max_speed: f64,
    accel: f64,
    natural_decel: f64,
    counter_accel: f64,
    threshold: f64,
) -> AxisAdvance {
    if input == 0 {
        let threshold_cross_dt = decel_threshold_cross_dt(vel.abs(), threshold, natural_decel, dt);
        apply_natural_decel(vel, dt, natural_decel);
        return AxisAdvance {
            counter: false,
            threshold_cross_dt,
        };
    }

    let input_f = input as f64;
    let start = *vel;
    let counter = start.abs() > 0.001 && input_f * start < 0.0;
    if !counter {
        *vel += input_f * accel * dt;
        *vel = vel.clamp(-max_speed, max_speed);
        return AxisAdvance {
            counter: false,
            threshold_cross_dt: None,
        };
    }

    let threshold_cross_dt = decel_threshold_cross_dt(start.abs(), threshold, counter_accel, dt);
    let time_to_zero = if counter_accel > 0.0 {
        start.abs() / counter_accel
    } else {
        f64::INFINITY
    };

    if time_to_zero >= dt {
        *vel += input_f * counter_accel * dt;
        if start.signum() != vel.signum() {
            *vel = 0.0;
        }
    } else {
        let remaining_dt = dt - time_to_zero;
        *vel = input_f * accel * remaining_dt;
    }

    *vel = vel.clamp(-max_speed, max_speed);
    AxisAdvance {
        counter,
        threshold_cross_dt,
    }
}

fn decel_threshold_cross_dt(
    start_speed: f64,
    threshold: f64,
    decel: f64,
    max_dt: f64,
) -> Option<f64> {
    if start_speed <= threshold || decel <= 0.0 {
        return None;
    }
    let dt = (start_speed - threshold) / decel;
    (dt <= max_dt).then_some(dt)
}

fn earliest_dt(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    match (a, b) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

fn interpolate_threshold_cross_dt(
    previous_speed: f64,
    speed: f64,
    threshold: f64,
    dt: f64,
) -> f64 {
    if previous_speed <= threshold || previous_speed <= speed {
        return dt;
    }
    let ratio = (previous_speed - threshold) / (previous_speed - speed);
    dt * ratio.clamp(0.0, 1.0)
}

fn accuracy_threshold(settings: &CounterStrafingSettings) -> f64 {
    settings.max_move_speed * settings.clean_shot_speed_ratio
}

impl CounterStrafingEngine {
    pub fn new(settings: CounterStrafingSettings) -> Self {
        Self {
            settings,
            movement: MovementEstimator::new(),
            movement_pressed: [false; 4],
            crouch_pressed: false,
            fire_pressed: false,
            fire_scheduler: FireScheduler::new(),
            last_crouch_release_time: None,
            last_movement_input_time: None,
            movement_press_times: [None; 4],
            shot_records: Vec::new(),
            last_tick_time: 0.0,
            session_start_time: 0.0,
        }
    }

    pub fn update_settings(&mut self, settings: CounterStrafingSettings) {
        self.settings = settings;
        let limit = self.settings.history_limit;
        if self.shot_records.len() > limit {
            self.shot_records.drain(0..self.shot_records.len() - limit);
        }
    }

    pub fn clear_records(&mut self) {
        self.shot_records.clear();
        self.fire_scheduler.reset();
        self.last_tick_time = 0.0;
    }

    pub fn snapshot(
        &self,
        active: bool,
        listening: bool,
        hud_visible: bool,
        capturing_binding: Option<crate::counter_strafing::types::BindingRole>,
    ) -> CounterStrafingSnapshot {
        let stats = compute_stats(&self.shot_records);
        CounterStrafingSnapshot {
            active,
            listening,
            hud_visible,
            hud_locked: false,
            hud_show_stable_bars: true,
            hud_show_tap_markers: true,
            shot_records: self.shot_records.clone(),
            avg_error: stats.avg_error,
            stable_rate: stats.stable_rate,
            last_shot: self.shot_records.last().cloned(),
            capturing_binding,
            fire_active: self.fire_pressed,
            assessment_hud_visible: false,
            assessment_hud_locked: false,
        }
    }

    /// Single-sample tick; prefer [`Self::drain_due_samples`] when multiple samples may be due.
    #[allow(dead_code)]
    pub fn tick(&mut self, time: f64) -> Option<ShootingErrorRecord> {
        let mut drained = Vec::new();
        self.drain_due_samples(time, &mut drained);
        drained.into_iter().next()
    }

    /// Flush every fire sample whose due time is `<= now` into `out`.
    pub fn drain_due_samples(&mut self, now: f64, out: &mut Vec<ShootingErrorRecord>) {
        if now + TIME_EPS < self.last_tick_time {
            return;
        }
        self.last_tick_time = now;
        if self.fire_scheduler.exceeds_guard(now) {
            if self.fire_pressed {
                self.fire_scheduler
                    .on_fire_down(now, self.settings.fire_sample_delay_ms);
            } else {
                self.fire_scheduler.force_release();
                self.advance_movement(now);
                return;
            }
        }
        while let Some(record) = self.process_fire_scheduler(now) {
            out.push(record);
        }
        self.advance_movement(now);
    }

    /// 返回下一次待处理的开火采样时间（秒），供 runtime 动态等待。
    pub fn next_sample_due_time(&self) -> Option<f64> {
        self.fire_scheduler.next_sample_due_time(
            self.settings.tap_max_hold_ms,
            self.settings.auto_fire_interval_ms,
        )
    }

    pub fn handle_event(&mut self, event: InputEvent) -> Option<ShootingErrorRecord> {
        if self.session_start_time == 0.0 {
            self.session_start_time = event.time_secs;
        }

        let role = self.resolve_role(&event.source)?;
        let mut fire_up_edge = false;

        match role {
            BindingRole::Fire if event.is_down => {
                if !self.fire_pressed {
                    self.fire_pressed = true;
                    self.fire_scheduler
                        .on_fire_down(event.time_secs, self.settings.fire_sample_delay_ms);
                } else if !self.fire_scheduler.is_pending_first_sample() {
                    // 已采样或调度空闲时的重复 DOWN：视为新一轮开火（连发/测试里未配对的 UP）
                    self.fire_scheduler
                        .on_fire_down(event.time_secs, self.settings.fire_sample_delay_ms);
                }
            }
            BindingRole::Fire => {
                if self.fire_pressed {
                    self.fire_pressed = false;
                    fire_up_edge = true;
                }
            }
            BindingRole::Crouch => {
                if self.crouch_pressed && !event.is_down {
                    self.last_crouch_release_time = Some(event.time_secs);
                }
                if event.is_down {
                    self.last_crouch_release_time = None;
                }
                self.crouch_pressed = event.is_down;
            }
            role if role_is_movement(role) => {
                let idx = movement_index(role);
                if event.is_down != self.movement_pressed[idx] {
                    self.last_movement_input_time = Some(event.time_secs);
                }
                if event.is_down && !self.movement_pressed[idx] {
                    self.movement_press_times[idx] = Some(event.time_secs);
                }
                if !event.is_down {
                    self.movement_press_times[idx] = None;
                }
                self.movement_pressed[idx] = event.is_down;
                if !event.is_down {
                    self.refresh_axis_intent_after_release(idx, event.time_secs);
                }
            }
            _ => {}
        }

        self.advance_movement(event.time_secs);

        match role {
            BindingRole::Fire if !event.is_down => {
                if !fire_up_edge {
                    return self.process_fire_scheduler(event.time_secs);
                }
                let record = if self.fire_scheduler.needs_tap_finalize() {
                    let sample_time = self.fire_scheduler.first_due_time();
                    self.advance_movement(sample_time);
                    let rec = self.emit_fire_sample(
                        sample_time,
                        FireSampleKind::FireDown,
                        true,
                    );
                    self.fire_scheduler.finalize_tap(sample_time);
                    rec
                } else {
                    self.fire_scheduler.on_fire_up();
                    None
                };
                return record.or_else(|| self.process_fire_scheduler(event.time_secs));
            }
            BindingRole::Fire => return self.process_fire_scheduler(event.time_secs),
            _ => self.process_fire_scheduler(event.time_secs),
        }
    }

    fn process_fire_scheduler(&mut self, now: f64) -> Option<ShootingErrorRecord> {
        if self.fire_scheduler.exceeds_guard(now) {
            if self.fire_pressed {
                self.fire_scheduler
                    .on_fire_down(now, self.settings.fire_sample_delay_ms);
            } else {
                self.fire_scheduler.force_release();
                return None;
            }
        }

        let due = self.fire_scheduler.next_sample_due_time(
            self.settings.tap_max_hold_ms,
            self.settings.auto_fire_interval_ms,
        )?;
        if now + TIME_EPS < due {
            return None;
        }

        let sample_time = due;
        self.advance_movement(sample_time);

        if !self.fire_scheduler.first_sample_emitted {
            self.fire_scheduler.mark_first_sample(sample_time);
            return self.emit_fire_sample(sample_time, FireSampleKind::FireDown, true);
        }

        self.fire_scheduler.mark_auto_sample(sample_time);
        self.emit_fire_sample(sample_time, FireSampleKind::FireHeld, false)
    }

    fn advance_movement(&mut self, time: f64) {
        self.movement.advance_to(
            time,
            &self.movement_pressed,
            &self.movement_press_times,
            &self.settings,
        );
    }

    fn refresh_axis_intent_after_release(&mut self, released_idx: usize, time: f64) {
        let Some(other_idx) = opposite_movement_index(released_idx) else {
            return;
        };
        if self.movement_pressed[other_idx] {
            self.movement_press_times[other_idx] = Some(time);
        }
    }

    fn crouch_grace_active(&self, time: f64) -> bool {
        if self.crouch_pressed {
            return false;
        }
        self.last_crouch_release_time
            .map(|t| (time - t) * 1000.0 <= self.settings.crouch_release_grace_ms)
            .unwrap_or(false)
    }

    fn crouch_exit_blend(&self, time: f64) -> f64 {
        if self.crouch_pressed || self.crouch_grace_active(time) {
            return 0.0;
        }
        let Some(release) = self.last_crouch_release_time else {
            return 1.0;
        };
        let age_ms = (time - release) * 1000.0;
        let grace = self.settings.crouch_release_grace_ms;
        let ramp = self.settings.crouch_exit_ramp_ms;
        if age_ms <= grace {
            0.0
        } else if age_ms >= grace + ramp {
            1.0
        } else {
            (age_ms - grace) / ramp
        }
    }

    fn evaluate_sample(&self, time: f64) -> SampleEval {
        let movement_keys_down = self.movement_keys_down();
        let crouching = self.crouch_pressed;
        let crouch_grace = self.crouch_grace_active(time);
        let exit_blend = self.crouch_exit_blend(time);
        let speed = self.movement.speed();
        let threshold = accuracy_threshold(&self.settings);
        let mut speed_ratio = if threshold > 0.0 {
            speed / threshold
        } else {
            0.0
        };
        let axis_conflict = self.movement.axis_conflict;
        let counter_strafe_active = self.movement.counter_strafe_active;
        let stop_success_age_ms = self
            .movement
            .stop_success_time
            .map(|t| ((time - t).max(0.0) * 1000.0 * 10.0).round() / 10.0)
            .unwrap_or(0.0);
        let timing_diff_ms = self
            .movement
            .stop_success_time
            .map(|t| ((time - t) * 1000.0 * 10.0).round() / 10.0)
            .unwrap_or(-((speed_ratio - 1.0).max(0.0) * 100.0));

        if crouch_grace {
            return SampleEval {
                error: 0.0,
                reason: ShootingErrorReason::CrouchGrace,
                score_label: "稳定".to_string(),
                movement_keys_down,
                crouching,
                last_stop_age_ms: stop_success_age_ms,
                timing_diff_ms,
                estimated_speed: round3(speed),
                accuracy_threshold: round3(threshold),
                speed_ratio: round3(0.0),
                stop_success_age_ms,
                counter_strafe_active,
                axis_conflict,
                crouch_grace_active: true,
            };
        }

        if crouching {
            return SampleEval {
                error: 0.0,
                reason: ShootingErrorReason::Crouching,
                score_label: "蹲射".to_string(),
                movement_keys_down,
                crouching: true,
                last_stop_age_ms: stop_success_age_ms,
                timing_diff_ms,
                estimated_speed: round3(speed),
                accuracy_threshold: round3(threshold),
                speed_ratio: round3(0.0),
                stop_success_age_ms,
                counter_strafe_active,
                axis_conflict,
                crouch_grace_active: false,
            };
        }

        if exit_blend < 1.0 && speed_ratio > 1.0 {
            speed_ratio = 1.0 + (speed_ratio - 1.0) * exit_blend;
        }

        if self.movement_press_in_window(time)
            && movement_keys_down > 0
            && !axis_conflict
            && speed_ratio > 1.0
            && speed_ratio <= STARTUP_GRACE_MAX_SPEED_RATIO
        {
            speed_ratio = 1.0;
        }

        if speed_ratio <= 1.0 {
            let (reason, score_label) =
                self.stable_reason_label(time, movement_keys_down, axis_conflict);
            return SampleEval {
                error: 0.0,
                reason,
                score_label,
                movement_keys_down,
                crouching,
                last_stop_age_ms: stop_success_age_ms,
                timing_diff_ms,
                estimated_speed: round3(speed),
                accuracy_threshold: round3(threshold),
                speed_ratio: round3(speed_ratio),
                stop_success_age_ms,
                counter_strafe_active,
                axis_conflict,
                crouch_grace_active: false,
            };
        }

        if axis_conflict {
            let error = error_from_speed_ratio(speed_ratio);
            return SampleEval {
                error,
                reason: ShootingErrorReason::AxisConflict,
                score_label: if speed_ratio <= MICRO_SPEED_RATIO {
                    "微动".to_string()
                } else {
                    "跑打".to_string()
                },
                movement_keys_down,
                crouching,
                last_stop_age_ms: stop_success_age_ms,
                timing_diff_ms,
                estimated_speed: round3(speed),
                accuracy_threshold: round3(threshold),
                speed_ratio: round3(speed_ratio),
                stop_success_age_ms,
                counter_strafe_active,
                axis_conflict,
                crouch_grace_active: false,
            };
        }

        if movement_keys_down > 0 && speed_ratio > 1.0 && !counter_strafe_active {
            let error = error_from_speed_ratio(speed_ratio);
            return SampleEval {
                error,
                reason: ShootingErrorReason::SingleDirectionHeld,
                score_label: if speed_ratio <= MICRO_SPEED_RATIO {
                    "微动".to_string()
                } else {
                    "跑打".to_string()
                },
                movement_keys_down,
                crouching,
                last_stop_age_ms: stop_success_age_ms,
                timing_diff_ms,
                estimated_speed: round3(speed),
                accuracy_threshold: round3(threshold),
                speed_ratio: round3(speed_ratio),
                stop_success_age_ms,
                counter_strafe_active,
                axis_conflict,
                crouch_grace_active: false,
            };
        }

        if counter_strafe_active && speed_ratio > 1.0 {
            let error = error_from_speed_ratio(speed_ratio);
            return SampleEval {
                error,
                reason: ShootingErrorReason::CounterStrafeBraking,
                score_label: if speed_ratio <= MICRO_SPEED_RATIO {
                    "微动".to_string()
                } else {
                    "跑打".to_string()
                },
                movement_keys_down,
                crouching,
                last_stop_age_ms: stop_success_age_ms,
                timing_diff_ms,
                estimated_speed: round3(speed),
                accuracy_threshold: round3(threshold),
                speed_ratio: round3(speed_ratio),
                stop_success_age_ms,
                counter_strafe_active,
                axis_conflict,
                crouch_grace_active: false,
            };
        }

        if speed_ratio > 1.0 {
            let error = error_from_speed_ratio(speed_ratio);
            let reason = if counter_strafe_active {
                ShootingErrorReason::CounterStrafeBraking
            } else {
                ShootingErrorReason::NaturalDeceleration
            };
            let score_label = if speed_ratio <= MICRO_SPEED_RATIO {
                "微动".to_string()
            } else {
                "跑打".to_string()
            };
            return SampleEval {
                error,
                reason,
                score_label,
                movement_keys_down,
                crouching,
                last_stop_age_ms: stop_success_age_ms,
                timing_diff_ms,
                estimated_speed: round3(speed),
                accuracy_threshold: round3(threshold),
                speed_ratio: round3(speed_ratio),
                stop_success_age_ms,
                counter_strafe_active,
                axis_conflict,
                crouch_grace_active: false,
            };
        }

        SampleEval {
            error: 0.0,
            reason: ShootingErrorReason::NoMovement,
            score_label: "稳定".to_string(),
            movement_keys_down,
            crouching,
            last_stop_age_ms: stop_success_age_ms,
            timing_diff_ms,
            estimated_speed: round3(speed),
            accuracy_threshold: round3(threshold),
            speed_ratio: round3(speed_ratio),
            stop_success_age_ms,
            counter_strafe_active,
            axis_conflict,
            crouch_grace_active: false,
        }
    }

    fn movement_in_start_window(&self, time: f64) -> bool {
        self.last_movement_input_time
            .map(|t| (time - t) * 1000.0 <= self.settings.low_speed_movement_window_ms)
            .unwrap_or(false)
    }

    fn movement_press_in_window(&self, time: f64) -> bool {
        let window = self.settings.low_speed_movement_window_ms;
        self.movement_pressed
            .iter()
            .enumerate()
            .filter(|(_, pressed)| **pressed)
            .any(|(i, _)| {
                self.movement_press_times[i]
                    .map(|t| (time - t) * 1000.0 <= window)
                    .unwrap_or(false)
            })
    }

    fn stable_reason_label(
        &self,
        time: f64,
        movement_keys_down: u8,
        axis_conflict: bool,
    ) -> (ShootingErrorReason, String) {
        if movement_keys_down == 0 {
            if self.movement_in_start_window(time) {
                return (
                    ShootingErrorReason::LowSpeedMovement,
                    "低速摆动".to_string(),
                );
            }
            return (ShootingErrorReason::NoMovement, "稳定".to_string());
        }
        if self.movement_in_start_window(time) {
            return (
                ShootingErrorReason::LowSpeedMovement,
                "起步低速".to_string(),
            );
        }
        if axis_conflict {
            return (
                ShootingErrorReason::LowSpeedMovement,
                "低速摆动".to_string(),
            );
        }
        (
            ShootingErrorReason::LowSpeedMovement,
            "低速准星".to_string(),
        )
    }

    fn emit_fire_sample(
        &mut self,
        time: f64,
        kind: FireSampleKind,
        fire_sample_delayed: bool,
    ) -> Option<ShootingErrorRecord> {
        let eval = self.evaluate_sample(time);
        let is_stable = eval.speed_ratio <= 1.0
            && eval.error <= self.settings.success_error_threshold
            && !eval.crouch_grace_active;
        let fire_held = kind == FireSampleKind::FireHeld;
        let shot_sequence_index = if self.fire_scheduler.sequence_index() > 0 {
            self.fire_scheduler.sequence_index()
        } else {
            1
        };
        let record = ShootingErrorRecord {
            error: round3(eval.error),
            score_label: eval.score_label,
            reason: eval.reason,
            movement_keys_down: eval.movement_keys_down,
            crouching: eval.crouching,
            last_stop_age_ms: eval.last_stop_age_ms,
            timing_diff_ms: eval.timing_diff_ms,
            fire_held,
            sample_kind: kind,
            is_stable,
            timestamp_ms: now_ms(),
            estimated_speed: eval.estimated_speed,
            accuracy_threshold: eval.accuracy_threshold,
            speed_ratio: eval.speed_ratio,
            stop_success_age_ms: eval.stop_success_age_ms,
            counter_strafe_active: eval.counter_strafe_active,
            axis_conflict: eval.axis_conflict,
            fire_sample_delayed,
            crouch_grace_active: eval.crouch_grace_active,
            shot_sequence_index,
        };

        self.shot_records.push(record.clone());
        let limit = self.settings.history_limit;
        if self.shot_records.len() > limit {
            self.shot_records.drain(0..self.shot_records.len() - limit);
        }

        Some(record)
    }

    fn movement_keys_down(&self) -> u8 {
        self.movement_pressed.iter().filter(|&&p| p).count() as u8
    }

    fn resolve_role(&self, source: &InputSource) -> Option<BindingRole> {
        let binding = source_to_binding(source);
        self.settings.key_map.role_for_binding(&binding)
    }

    /// 引擎认为仍按下、但系统查询已松开的绑定，合成 UP 事件以校正漏掉的 Raw Input。
    pub fn collect_stuck_releases(
        &self,
        key_map: &CounterStrafingKeyMap,
        is_pressed: impl Fn(&InputBinding) -> bool,
        time: f64,
    ) -> Vec<InputEvent> {
        let mut events = Vec::new();

        if self.fire_pressed && !is_pressed(key_map.binding_for_role(BindingRole::Fire)) {
            events.push(stuck_release_event(key_map.binding_for_role(BindingRole::Fire), time));
        }
        if self.crouch_pressed && !is_pressed(key_map.binding_for_role(BindingRole::Crouch)) {
            events.push(stuck_release_event(
                key_map.binding_for_role(BindingRole::Crouch),
                time,
            ));
        }

        let movement_roles = [
            BindingRole::Forward,
            BindingRole::Back,
            BindingRole::Left,
            BindingRole::Right,
        ];
        for (idx, role) in movement_roles.iter().enumerate() {
            if self.movement_pressed[idx] && !is_pressed(key_map.binding_for_role(*role)) {
                events.push(stuck_release_event(key_map.binding_for_role(*role), time));
            }
        }

        events
    }

    /// 引擎认为未按下、但系统仍按下的绑定，合成 DOWN 以校正漏掉的 Raw Input。
    pub fn collect_stuck_presses(
        &self,
        key_map: &CounterStrafingKeyMap,
        is_pressed: impl Fn(&InputBinding) -> bool,
        time: f64,
    ) -> Vec<InputEvent> {
        let mut events = Vec::new();

        if !self.fire_pressed && is_pressed(key_map.binding_for_role(BindingRole::Fire)) {
            events.push(stuck_press_event(
                key_map.binding_for_role(BindingRole::Fire),
                time,
            ));
        }

        events
    }
}

fn stuck_press_event(binding: &InputBinding, time: f64) -> InputEvent {
    InputEvent {
        source: binding_to_source(binding),
        is_down: true,
        time_secs: time,
    }
}

fn stuck_release_event(binding: &InputBinding, time: f64) -> InputEvent {
    InputEvent {
        source: binding_to_source(binding),
        is_down: false,
        time_secs: time,
    }
}

fn binding_to_source(binding: &InputBinding) -> InputSource {
    match binding {
        InputBinding::Keyboard { vk, .. } => InputSource::Keyboard(*vk),
        InputBinding::Mouse { button, .. } => InputSource::Mouse(*button),
    }
}

fn error_from_speed_ratio(speed_ratio: f64) -> f64 {
    if speed_ratio <= 1.0 {
        return 0.0;
    }
    if speed_ratio >= MICRO_SPEED_RATIO {
        return 1.0;
    }
    ((speed_ratio - 1.0) / (MICRO_SPEED_RATIO - 1.0)).clamp(0.0, 1.0)
}

fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

struct SampleEval {
    error: f64,
    reason: ShootingErrorReason,
    score_label: String,
    movement_keys_down: u8,
    crouching: bool,
    last_stop_age_ms: f64,
    timing_diff_ms: f64,
    estimated_speed: f64,
    accuracy_threshold: f64,
    speed_ratio: f64,
    stop_success_age_ms: f64,
    counter_strafe_active: bool,
    axis_conflict: bool,
    crouch_grace_active: bool,
}

fn role_is_movement(role: BindingRole) -> bool {
    matches!(
        role,
        BindingRole::Forward | BindingRole::Back | BindingRole::Left | BindingRole::Right
    )
}

fn movement_index(role: BindingRole) -> usize {
    match role {
        BindingRole::Forward => 0,
        BindingRole::Back => 1,
        BindingRole::Left => 2,
        BindingRole::Right => 3,
        _ => 0,
    }
}

fn opposite_movement_index(index: usize) -> Option<usize> {
    match index {
        0 => Some(1),
        1 => Some(0),
        2 => Some(3),
        3 => Some(2),
        _ => None,
    }
}

fn source_to_binding(source: &InputSource) -> InputBinding {
    match source {
        InputSource::Keyboard(vk) => InputBinding::keyboard(*vk, vk_label(*vk)),
        InputSource::Mouse(button) => InputBinding::mouse(*button, mouse_label(*button)),
    }
}

pub fn vk_label(vk: u16) -> String {
    match vk {
        0x11 => "Ctrl".to_string(),
        0x10 => "Shift".to_string(),
        0x12 => "Alt".to_string(),
        0x20 => "Space".to_string(),
        0x41..=0x5A => {
            let c = vk as u8 as char;
            c.to_string()
        }
        0x30..=0x39 => {
            let c = vk as u8 as char;
            c.to_string()
        }
        _ => format!("VK {vk:02X}"),
    }
}

pub fn mouse_label(button: u8) -> String {
    match button {
        0 => "鼠标左键".to_string(),
        1 => "鼠标右键".to_string(),
        2 => "鼠标中键".to_string(),
        3 => "鼠标侧键1".to_string(),
        4 => "鼠标侧键2".to_string(),
        _ => format!("鼠标键 {button}"),
    }
}

struct Stats {
    avg_error: f64,
    stable_rate: f64,
}

fn compute_stats(records: &[ShootingErrorRecord]) -> Stats {
    if records.is_empty() {
        return Stats {
            avg_error: 0.0,
            stable_rate: 0.0,
        };
    }

    let n = records.len() as f64;
    let sum: f64 = records.iter().map(|r| r.error).sum();
    let avg_error = round3(sum / n);
    let stable_count = records.iter().filter(|r| r.is_stable).count() as f64;
    let stable_rate = ((stable_count / n) * 1000.0).round() / 10.0;

    Stats {
        avg_error,
        stable_rate,
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::counter_strafing::types::CounterStrafingKeyMap;

    fn settings() -> CounterStrafingSettings {
        CounterStrafingSettings::default()
    }

    fn evt(source: InputSource, is_down: bool, t: f64) -> InputEvent {
        InputEvent {
            source,
            is_down,
            time_secs: t,
        }
    }

    fn kb(vk: u16) -> InputSource {
        InputSource::Keyboard(vk)
    }

    fn mouse(button: u8) -> InputSource {
        InputSource::Mouse(button)
    }

    fn fire_down(engine: &mut CounterStrafingEngine, t: f64) -> ShootingErrorRecord {
        engine.handle_event(evt(mouse(0), true, t));
        let delay = settings().fire_sample_delay_ms / 1000.0;
        engine.tick(t + delay + 0.001).unwrap()
    }

    fn fire_tap(engine: &mut CounterStrafingEngine, down: f64, up: f64) -> Vec<ShootingErrorRecord> {
        let mut records = Vec::new();
        engine.handle_event(evt(mouse(0), true, down));
        if let Some(r) = engine.handle_event(evt(mouse(0), false, up)) {
            records.push(r);
        }
        records
    }

    fn build_speed(engine: &mut CounterStrafingEngine, t: f64) {
        engine.handle_event(evt(kb(0x41), true, 0.0));
        engine.handle_event(evt(kb(0x41), true, t));
    }

    #[test]
    fn moving_while_firing_is_high_error() {
        let mut engine = CounterStrafingEngine::new(settings());
        build_speed(&mut engine, 0.15);
        let record = fire_down(&mut engine, 0.16);
        assert!(record.speed_ratio > 1.0);
        assert!(!record.is_stable);
        assert_eq!(record.sample_kind, FireSampleKind::FireDown);
    }

    #[test]
    fn tick_while_holding_move_and_fire_stays_high_error() {
        let mut engine = CounterStrafingEngine::new(settings());
        build_speed(&mut engine, 0.15);
        fire_down(&mut engine, 0.16);
        let mut s = settings();
        s.tap_max_hold_ms = 50.0;
        s.auto_fire_interval_ms = 40.0;
        engine.update_settings(s);
        let record = engine.tick(0.22).unwrap();
        assert!(record.speed_ratio > 1.0);
        assert_eq!(record.sample_kind, FireSampleKind::FireHeld);
    }

    #[test]
    fn axis_conflict_while_firing_is_high_error() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x41), true, 0.0));
        engine.handle_event(evt(kb(0x44), true, 0.01));
        let record = fire_down(&mut engine, 0.02);
        assert_eq!(record.reason, ShootingErrorReason::LowSpeedMovement);
        assert!(record.is_stable);
        assert!(record.speed_ratio <= 1.0);
    }

    #[test]
    fn axis_conflict_high_speed_still_errors() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x41), true, 0.0));
        engine.tick(0.20);
        engine.handle_event(evt(kb(0x44), true, 0.20));
        let record = fire_down(&mut engine, 0.205);
        assert!(record.speed_ratio > 1.0);
        assert!(!record.is_stable);
        assert_eq!(record.reason, ShootingErrorReason::AxisConflict);
    }

    #[test]
    fn overlap_counter_brakes_faster_than_release() {
        let mut overlap = CounterStrafingEngine::new(settings());
        overlap.handle_event(evt(kb(0x41), true, 0.0));
        overlap.tick(0.08);
        overlap.handle_event(evt(kb(0x44), true, 0.08));
        overlap.tick(0.10);
        let overlap_speed = overlap.movement.speed();

        let mut release = CounterStrafingEngine::new(settings());
        release.handle_event(evt(kb(0x41), true, 0.0));
        release.tick(0.08);
        release.handle_event(evt(kb(0x41), false, 0.08));
        release.tick(0.10);
        let release_speed = release.movement.speed();

        assert!(overlap_speed < release_speed);
    }

    #[test]
    fn counter_axis_integrates_in_two_phases_after_zero() {
        let mut velocity = -settings().max_move_speed;
        let result = advance_axis(
            &mut velocity,
            1,
            0.12,
            settings().max_move_speed,
            settings().accel_per_sec,
            settings().natural_decel_per_sec,
            settings().counter_strafe_accel_per_sec,
            accuracy_threshold(&settings()),
        );

        assert!(result.counter);
        assert!(velocity.abs() <= accuracy_threshold(&settings()));
        assert!(result.threshold_cross_dt.unwrap() < 0.12);
    }

    #[test]
    fn releasing_overlap_refreshes_held_axis_intent() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        engine.handle_event(evt(kb(0x41), true, 0.20));
        engine.handle_event(evt(kb(0x41), false, 0.35));

        assert_eq!(engine.movement_press_times[3], Some(0.35));
    }

    #[test]
    fn long_hold_reverse_then_reactivate_original_key_can_stop() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        engine.tick(0.50);
        engine.handle_event(evt(kb(0x41), true, 0.50));
        engine.tick(1.00);
        engine.handle_event(evt(kb(0x41), false, 1.00));

        let record = fire_down(&mut engine, 1.035);
        assert!(record.speed_ratio <= 1.0);
        assert!(record.is_stable);
    }

    #[test]
    fn long_hold_reverse_then_immediate_fire_still_errors() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        engine.tick(0.50);
        engine.handle_event(evt(kb(0x41), true, 0.50));
        engine.tick(1.00);
        engine.handle_event(evt(kb(0x41), false, 1.00));

        let record = fire_down(&mut engine, 1.0005);
        assert!(record.speed_ratio > 1.0);
        assert!(!record.is_stable);
    }

    #[test]
    fn adadad_intermittent_tap_fire_stays_stable() {
        let mut engine = CounterStrafingEngine::new(settings());
        let mut records = Vec::new();
        let mut t = 0.0;
        for _ in 0..6 {
            engine.handle_event(evt(kb(0x41), true, t));
            engine.handle_event(evt(kb(0x41), false, t + 0.025));
            t += 0.03;
            engine.handle_event(evt(kb(0x44), true, t));
            records.push(fire_down(&mut engine, t + 0.005));
            engine.handle_event(evt(kb(0x44), false, t + 0.025));
            t += 0.03;
            engine.tick(t);
        }
        let stable_count = records.iter().filter(|r| r.is_stable).count();
        assert!(
            stable_count >= records.len().saturating_sub(1),
            "expected most ADAD taps to be stable, got {stable_count}/{}",
            records.len()
        );
    }

    #[test]
    fn resolve_axis_input_prefers_recent_press() {
        assert_eq!(resolve_axis_input(true, true, Some(0.1), Some(0.2)), (1, true));
        assert_eq!(resolve_axis_input(true, true, Some(0.2), Some(0.1)), (-1, true));
        assert_eq!(resolve_axis_input(true, false, None, None), (-1, false));
        assert_eq!(resolve_axis_input(false, true, None, None), (1, false));
    }

    #[test]
    fn movement_start_low_speed_fire_is_stable() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        let record = fire_down(&mut engine, 0.01);
        assert!(record.speed_ratio <= 1.0);
        assert!(record.is_stable);
        assert_eq!(record.reason, ShootingErrorReason::LowSpeedMovement);
        assert_eq!(record.score_label, "起步低速");
    }

    #[test]
    fn movement_startup_within_press_window_stays_stable() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        let record = fire_down(&mut engine, 0.10);
        assert!(record.is_stable);
        assert_eq!(record.reason, ShootingErrorReason::LowSpeedMovement);
        assert_eq!(record.score_label, "起步低速");
    }

    #[test]
    fn ad_tap_rhythm_stays_low_speed_stable() {
        let mut engine = CounterStrafingEngine::new(settings());
        for i in 0..4 {
            let t = i as f64 * 0.08;
            engine.handle_event(evt(kb(0x41), true, t));
            engine.handle_event(evt(kb(0x41), false, t + 0.03));
            engine.handle_event(evt(kb(0x44), true, t + 0.04));
            engine.handle_event(evt(kb(0x44), false, t + 0.07));
            engine.tick(t + 0.075);
        }
        engine.handle_event(evt(mouse(0), true, 0.34));
        let delay = settings().fire_sample_delay_ms / 1000.0;
        let record = engine.tick(0.34 + delay + 0.001).unwrap();
        assert!(record.speed_ratio <= 1.0);
        assert!(record.is_stable);
        assert_eq!(record.reason, ShootingErrorReason::LowSpeedMovement);
    }

    #[test]
    fn diagonal_movement_uses_speed_not_key_count() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x41), true, 0.0));
        engine.handle_event(evt(kb(0x57), true, 0.0));
        engine.handle_event(evt(kb(0x41), true, 0.12));
        engine.handle_event(evt(kb(0x57), true, 0.12));
        let record = fire_down(&mut engine, 0.13);
        assert_ne!(record.reason, ShootingErrorReason::AxisConflict);
        assert_eq!(record.movement_keys_down, 2);
        assert!(record.speed_ratio > 1.0);
    }

    #[test]
    fn counter_strafe_stops_faster_than_natural_release() {
        let mut natural = CounterStrafingEngine::new(settings());
        build_speed(&mut natural, 0.20);
        natural.handle_event(evt(kb(0x41), false, 0.21));
        natural.handle_event(evt(mouse(0), true, 0.30));
        let delay = settings().fire_sample_delay_ms / 1000.0;
        let natural_record = natural.tick(0.30 + delay + 0.001).unwrap();

        let mut counter = CounterStrafingEngine::new(settings());
        build_speed(&mut counter, 0.20);
        counter.handle_event(evt(kb(0x41), false, 0.21));
        counter.handle_event(evt(kb(0x44), true, 0.21));
        counter.handle_event(evt(mouse(0), true, 0.30));
        let counter_record = counter.tick(0.30 + delay + 0.001).unwrap();

        assert!(counter_record.speed_ratio < natural_record.speed_ratio);
    }

    #[test]
    fn settled_shot_is_low_error() {
        let mut engine = CounterStrafingEngine::new(settings());
        build_speed(&mut engine, 0.20);
        engine.handle_event(evt(kb(0x41), false, 0.21));
        engine.handle_event(evt(kb(0x44), true, 0.21));
        engine.handle_event(evt(kb(0x44), false, 0.28));
        engine.tick(0.55);
        let record = fire_down(&mut engine, 0.58);
        assert!(record.speed_ratio <= 1.0);
        assert!(record.is_stable);
    }

    #[test]
    fn release_movement_while_firing_transitions_error() {
        let mut engine = CounterStrafingEngine::new(settings());
        build_speed(&mut engine, 0.15);
        fire_down(&mut engine, 0.16);
        engine.handle_event(evt(kb(0x41), false, 0.17));
        engine.handle_event(evt(kb(0x44), true, 0.17));
        let mut s = settings();
        s.tap_max_hold_ms = 50.0;
        s.auto_fire_interval_ms = 40.0;
        engine.update_settings(s);
        let record = engine.tick(0.24).unwrap();
        assert!(record.error < 1.0);
        assert!(
            record.counter_strafe_active
                || record.reason == ShootingErrorReason::CounterStrafeBraking
        );
    }

    #[test]
    fn fire_up_stops_tick_sampling() {
        let mut engine = CounterStrafingEngine::new(settings());
        build_speed(&mut engine, 0.15);
        fire_down(&mut engine, 0.16);
        engine.handle_event(evt(mouse(0), false, 0.17));
        assert!(engine.tick(0.25).is_none());
    }

    #[test]
    fn crouch_shot_uses_crouching_stable_evaluation() {
        let mut engine = CounterStrafingEngine::new(settings());
        build_speed(&mut engine, 0.10);
        engine.handle_event(evt(kb(0x11), true, 0.11));
        let record = fire_down(&mut engine, 0.12);
        assert_eq!(record.error, 0.0);
        assert!(record.crouching);
        assert_eq!(record.score_label, "蹲射");
        assert_eq!(record.reason, ShootingErrorReason::Crouching);
        assert_eq!(record.speed_ratio, 0.0);
    }

    #[test]
    fn crouch_move_shot_stays_low_risk_while_moving() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x41), true, 0.0));
        engine.handle_event(evt(kb(0x11), true, 0.05));
        build_speed(&mut engine, 0.20);
        let record = fire_down(&mut engine, 0.16);
        assert!(record.crouching);
        assert_eq!(record.reason, ShootingErrorReason::Crouching);
        assert_eq!(record.speed_ratio, 0.0);
        assert!(record.estimated_speed > 0.0);
    }

    #[test]
    fn custom_keymap_works() {
        let mut s = settings();
        s.key_map = CounterStrafingKeyMap {
            forward: InputBinding::keyboard(0x49, "I"),
            back: InputBinding::keyboard(0x4B, "K"),
            left: InputBinding::keyboard(0x4A, "J"),
            right: InputBinding::keyboard(0x4C, "L"),
            crouch: InputBinding::keyboard(0x10, "Shift"),
            fire: InputBinding::keyboard(0x20, "Space"),
        };
        let mut engine = CounterStrafingEngine::new(s);
        engine.handle_event(evt(kb(0x4A), true, 0.0));
        engine.handle_event(evt(kb(0x4A), true, 0.12));
        engine.handle_event(evt(kb(0x20), true, 0.13));
        let delay = settings().fire_sample_delay_ms / 1000.0;
        let record = engine.tick(0.13 + delay + 0.001).unwrap();
        assert!(record.speed_ratio > 1.0);
    }

    #[test]
    fn stats_computed() {
        let mut engine = CounterStrafingEngine::new(settings());
        build_speed(&mut engine, 0.15);
        fire_down(&mut engine, 0.16);
        engine.handle_event(evt(mouse(0), false, 0.17));
        engine.handle_event(evt(kb(0x41), false, 0.18));
        engine.handle_event(evt(kb(0x44), true, 0.18));
        engine.handle_event(evt(kb(0x44), false, 0.26));
        engine.tick(0.60);
        fire_down(&mut engine, 0.62);
        engine.handle_event(evt(mouse(0), false, 0.63));

        let snap = engine.snapshot(true, true, false, None);
        assert_eq!(snap.shot_records.len(), 2);
        assert!(snap.shot_records.last().unwrap().is_stable);
        assert!(snap.stable_rate >= 50.0);
        assert!(!snap.fire_active);
    }

    #[test]
    fn short_tap_produces_single_sample() {
        let mut engine = CounterStrafingEngine::new(settings());
        let records = fire_tap(&mut engine, 0.0, 0.05);
        assert_eq!(records.len(), 1);
        assert!(records[0].fire_sample_delayed);
    }

    #[test]
    fn fire_sample_delay_evaluates_at_delayed_speed() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        engine.handle_event(evt(mouse(0), true, 0.0));
        let delay = settings().fire_sample_delay_ms / 1000.0;
        let record = engine.tick(delay + 0.001).expect("delayed sample");
        assert!(record.fire_sample_delayed);
        assert!(record.estimated_speed > 0.0);
        assert!(record.estimated_speed < settings().max_move_speed * 0.5);
    }

    #[test]
    fn auto_fire_after_tap_window() {
        let mut s = settings();
        s.tap_max_hold_ms = 50.0;
        s.auto_fire_interval_ms = 40.0;
        s.fire_sample_delay_ms = 10.0;
        let mut engine = CounterStrafingEngine::new(s.clone());

        engine.handle_event(evt(mouse(0), true, 0.0));
        let first = engine.tick(0.011).expect("first");
        assert_eq!(first.shot_sequence_index, 1);

        let second = engine.tick(0.06).expect("second after tap window");
        assert_eq!(second.shot_sequence_index, 2);
        assert_eq!(second.sample_kind, FireSampleKind::FireHeld);

        let third = engine.tick(0.101).expect("third auto");
        assert_eq!(third.shot_sequence_index, 3);
    }

    #[test]
    fn crouch_release_grace_stays_stable() {
        let mut engine = CounterStrafingEngine::new(settings());
        let crouch = settings().key_map.crouch.clone();

        let crouch_vk = match crouch {
            InputBinding::Keyboard { vk, .. } => vk,
            _ => 0x11,
        };

        engine.handle_event(evt(kb(crouch_vk), true, 0.0));
        engine.handle_event(evt(kb(crouch_vk), false, 0.1));
        let grace = settings().crouch_release_grace_ms / 1000.0;
        engine.handle_event(evt(mouse(0), true, 0.1 + grace * 0.5));
        let record = engine
            .tick(0.1 + grace * 0.5 + 0.02)
            .expect("sample in grace");

        assert!(record.crouch_grace_active);
        assert_eq!(record.reason, ShootingErrorReason::CrouchGrace);
        assert!(record.error < 1.0);
    }

    #[test]
    fn crouch_exit_ramp_blends_error() {
        let mut s = settings();
        s.crouch_release_grace_ms = 20.0;
        s.crouch_exit_ramp_ms = 80.0;
        let mut engine = CounterStrafingEngine::new(s.clone());
        let crouch_vk = match s.key_map.crouch {
            InputBinding::Keyboard { vk, .. } => vk,
            _ => 0x11,
        };

        engine.handle_event(evt(kb(0x44), true, 0.0));
        engine.handle_event(evt(kb(crouch_vk), true, 0.0));
        engine.handle_event(evt(kb(crouch_vk), false, 0.05));
        engine.handle_event(evt(kb(0x44), false, 0.05));

        let mid_ramp = 0.05
            + (s.crouch_release_grace_ms + s.crouch_exit_ramp_ms / 2.0) / 1000.0;
        engine.handle_event(evt(mouse(0), true, mid_ramp));
        let record = engine.tick(mid_ramp + 0.02).expect("ramp sample");

        assert!(!record.crouch_grace_active);
        assert!(record.speed_ratio < 1.5);
    }

    #[test]
    fn movement_ramps_up_not_instant_max() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        engine.tick(0.05);
        let speed_early = engine.movement.speed();
        engine.tick(0.2);
        let speed_later = engine.movement.speed();
        assert!(speed_early < settings().max_move_speed * 0.8);
        assert!(speed_later > speed_early);
    }

    #[test]
    fn next_sample_due_time_matches_fire_delay() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(mouse(0), true, 0.1));
        let delay = settings().fire_sample_delay_ms / 1000.0;
        let due = engine.next_sample_due_time().unwrap();
        assert!((due - (0.1 + delay)).abs() < 1e-9);
    }

    #[test]
    fn late_tick_samples_at_scheduled_due_time() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(mouse(0), true, 0.0));
        let record = engine.tick(0.05).expect("late tick still samples");
        assert!(record.is_stable);
        assert_eq!(record.reason, ShootingErrorReason::NoMovement);
        assert!(record.fire_sample_delayed);
    }

    #[test]
    fn settled_counter_strafe_stays_stable_on_late_tick() {
        let mut engine = CounterStrafingEngine::new(settings());
        build_speed(&mut engine, 0.20);
        engine.handle_event(evt(kb(0x41), false, 0.21));
        engine.handle_event(evt(kb(0x44), true, 0.21));
        engine.handle_event(evt(kb(0x44), false, 0.28));
        engine.tick(0.55);
        engine.handle_event(evt(mouse(0), true, 0.58));
        let record = engine.tick(0.70).expect("late tick after stop");
        assert!(record.speed_ratio <= 1.0);
        assert!(record.is_stable);
    }

    #[test]
    fn movement_release_before_scheduled_sample_affects_speed() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        engine.handle_event(evt(mouse(0), true, 0.0));
        engine.handle_event(evt(kb(0x44), false, 0.012));
        engine.handle_event(evt(kb(0x41), true, 0.012));
        let delay = settings().fire_sample_delay_ms / 1000.0;
        let record = engine.tick(0.012 + delay + 0.005).unwrap();
        assert!(
            record.movement_keys_down > 0
                || record.counter_strafe_active
                || record.reason == ShootingErrorReason::CounterStrafeBraking
        );
    }

    #[test]
    fn marginal_speed_not_marked_stable() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(kb(0x44), true, 0.0));
        engine.handle_event(evt(mouse(0), true, 0.008));
        let delay = settings().fire_sample_delay_ms / 1000.0;
        let record = engine.tick(0.008 + delay + 0.001).unwrap();
        if record.speed_ratio > 1.0 && record.speed_ratio <= MICRO_SPEED_RATIO {
            assert!(!record.is_stable);
            assert_eq!(record.score_label, "微动");
        }
    }

    #[test]
    fn collect_stuck_releases_synthesizes_fire_up_when_physically_released() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(mouse(0), true, 0.0));
        let key_map = settings().key_map.clone();
        let stuck = engine.collect_stuck_releases(&key_map, |_| false, 0.05);
        assert_eq!(stuck.len(), 1);
        assert!(!stuck[0].is_down);
        match stuck[0].source {
            InputSource::Mouse(0) => {}
            _ => panic!("expected mouse left"),
        }
    }

    #[test]
    fn fire_hold_guard_rearms_while_fire_still_pressed() {
        let mut s = settings();
        s.tap_max_hold_ms = 50.0;
        s.auto_fire_interval_ms = 10.0;
        s.fire_sample_delay_ms = 5.0;
        let mut engine = CounterStrafingEngine::new(s);
        engine.handle_event(evt(mouse(0), true, 0.0));
        engine.tick(0.006).expect("first sample");

        let mut samples = 1u32;
        let mut t = 0.06;
        while t < 35.0 {
            if engine.tick(t).is_some() {
                samples += 1;
            }
            t += 0.01;
        }
        assert!(samples > MAX_AUTO_FIRE_SAMPLES);
        assert!(engine.next_sample_due_time().is_some());

        engine.handle_event(evt(mouse(0), false, t));
        assert!(engine.next_sample_due_time().is_none());
    }

    fn process_batch_at(
        engine: &mut CounterStrafingEngine,
        events: &[InputEvent],
        now: f64,
    ) -> Vec<ShootingErrorRecord> {
        let mut shots = Vec::new();
        for event in events {
            if let Some(record) = engine.handle_event(*event) {
                shots.push(record);
            }
        }
        engine.drain_due_samples(now, &mut shots);
        shots
    }

    #[test]
    fn rapid_taps_within_100ms_all_recorded() {
        let mut engine = CounterStrafingEngine::new(settings());
        let taps = [(0.0, 0.04), (0.05, 0.09), (0.10, 0.14)];
        let mut total = 0usize;
        for (down, up) in taps {
            let records = process_batch_at(
                &mut engine,
                &[evt(mouse(0), true, down), evt(mouse(0), false, up)],
                up + 0.001,
            );
            total += records.len();
        }
        assert_eq!(total, 3);
        assert_eq!(engine.snapshot(true, true, false, None).shot_records.len(), 3);
    }

    #[test]
    fn keyboard_mouse_same_batch_records_fire() {
        let mut engine = CounterStrafingEngine::new(settings());
        let events = [
            evt(kb(0x41), true, 0.0),
            evt(kb(0x11), true, 0.0),
            evt(mouse(0), true, 0.0),
        ];
        let delay = settings().fire_sample_delay_ms / 1000.0;
        let records = process_batch_at(&mut engine, &events, delay + 0.001);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].sample_kind, FireSampleKind::FireDown);
    }

    #[test]
    fn simultaneous_a_crouch_and_fire_tap_records_shot() {
        let mut engine = CounterStrafingEngine::new(settings());
        let events = [
            evt(kb(0x41), true, 0.10),
            evt(kb(0x11), true, 0.10),
            evt(mouse(0), true, 0.10),
            evt(mouse(0), false, 0.12),
        ];
        let records = process_batch_at(&mut engine, &events, 0.12);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].sample_kind, FireSampleKind::FireDown);
    }

    #[test]
    fn duplicate_fire_down_before_up_still_records_shot() {
        let mut engine = CounterStrafingEngine::new(settings());
        engine.handle_event(evt(mouse(0), true, 0.0));
        engine.handle_event(evt(mouse(0), true, 0.005));
        let records = process_batch_at(&mut engine, &[evt(mouse(0), false, 0.04)], 0.04);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].sample_kind, FireSampleKind::FireDown);
    }

    #[test]
    fn collect_stuck_presses_synthesizes_fire_down_when_physically_pressed() {
        let engine = CounterStrafingEngine::new(settings());
        let key_map = settings().key_map.clone();
        let stuck = engine.collect_stuck_presses(&key_map, |_| true, 0.05);
        assert_eq!(stuck.len(), 1);
        assert!(stuck[0].is_down);
        match stuck[0].source {
            InputSource::Mouse(0) => {}
            _ => panic!("expected mouse left"),
        }
    }

    #[test]
    fn stuck_press_recovery_records_missed_fire_down() {
        let mut engine = CounterStrafingEngine::new(settings());
        let key_map = settings().key_map.clone();
        let stuck = engine.collect_stuck_presses(&key_map, |_| true, 0.10);
        assert_eq!(stuck.len(), 1);
        let records = process_batch_at(
            &mut engine,
            &[stuck[0], evt(mouse(0), false, 0.12)],
            0.12,
        );
        assert_eq!(records.len(), 1);
    }

    #[test]
    fn drain_due_samples_flushes_multiple_auto_fire_samples() {
        let mut s = settings();
        s.tap_max_hold_ms = 50.0;
        s.auto_fire_interval_ms = 10.0;
        s.fire_sample_delay_ms = 5.0;
        let mut engine = CounterStrafingEngine::new(s);
        engine.handle_event(evt(mouse(0), true, 0.0));
        engine.tick(0.006).expect("first sample");

        let mut drained = Vec::new();
        engine.drain_due_samples(0.08, &mut drained);
        assert!(drained.len() >= 2);
        for record in &drained {
            assert_eq!(record.sample_kind, FireSampleKind::FireHeld);
        }
    }
}
