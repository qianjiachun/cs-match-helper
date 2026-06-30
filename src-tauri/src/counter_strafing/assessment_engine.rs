use crate::counter_strafing::types::{
    BindingRole, CounterStrafingAssessmentRecord, CounterStrafingAssessmentSnapshot,
    CounterStrafingSettings, AssessmentAxis, AssessmentTiming, InputBinding,
};

const MIN_RECORD_INTERVAL_SECS: f64 = 0.05;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MovementKey {
    Left,
    Right,
    Forward,
    Back,
}

impl MovementKey {
    fn axis(self) -> AssessmentAxis {
        match self {
            MovementKey::Left | MovementKey::Right => AssessmentAxis::Horizontal,
            MovementKey::Forward | MovementKey::Back => AssessmentAxis::Vertical,
        }
    }

    fn opposite(self) -> MovementKey {
        match self {
            MovementKey::Left => MovementKey::Right,
            MovementKey::Right => MovementKey::Left,
            MovementKey::Forward => MovementKey::Back,
            MovementKey::Back => MovementKey::Forward,
        }
    }

    fn index(self) -> usize {
        match self {
            MovementKey::Left => 0,
            MovementKey::Right => 1,
            MovementKey::Forward => 2,
            MovementKey::Back => 3,
        }
    }

    fn label(self, settings: &CounterStrafingSettings) -> String {
        let role = match self {
            MovementKey::Left => BindingRole::Left,
            MovementKey::Right => BindingRole::Right,
            MovementKey::Forward => BindingRole::Forward,
            MovementKey::Back => BindingRole::Back,
        };
        match settings.key_map.binding_for_role(role) {
            InputBinding::Keyboard { label, .. } | InputBinding::Mouse { label, .. } => {
                label.clone()
            }
        }
    }
}

fn role_to_movement(role: BindingRole) -> Option<MovementKey> {
    match role {
        BindingRole::Left => Some(MovementKey::Left),
        BindingRole::Right => Some(MovementKey::Right),
        BindingRole::Forward => Some(MovementKey::Forward),
        BindingRole::Back => Some(MovementKey::Back),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct KeyState {
    pressed: bool,
    press_time: f64,
}

#[derive(Debug, Clone, Copy, Default)]
struct AxisState {
    waiting: bool,
    released_key: Option<MovementKey>,
    release_time: f64,
}

pub struct CounterStrafingAssessmentEngine {
    settings: CounterStrafingSettings,
    key_states: [KeyState; 4],
    axis_states: [AxisState; 2],
    records: Vec<CounterStrafingAssessmentRecord>,
    last_record_time: f64,
}

impl CounterStrafingAssessmentEngine {
    pub fn new(settings: CounterStrafingSettings) -> Self {
        Self {
            settings,
            key_states: [KeyState::default(); 4],
            axis_states: [AxisState::default(); 2],
            records: Vec::new(),
            last_record_time: 0.0,
        }
    }

    pub fn update_settings(&mut self, settings: CounterStrafingSettings) {
        self.settings = settings;
        let limit = self.settings.assessment_history_limit;
        if self.records.len() > limit {
            self.records.drain(0..self.records.len() - limit);
        }
    }

    pub fn clear_records(&mut self) {
        self.records.clear();
    }

    pub fn is_movement_pressed(&self, role: BindingRole) -> bool {
        role_to_movement(role)
            .map(|k| self.key_states[k.index()].pressed)
            .unwrap_or(false)
    }

    pub fn handle_movement(
        &mut self,
        role: BindingRole,
        is_down: bool,
        time: f64,
    ) -> Option<CounterStrafingAssessmentRecord> {
        if !self.settings.assessment_enabled {
            return None;
        }

        let key = role_to_movement(role)?;

        if is_down {
            self.on_key_down(key, time)
        } else {
            self.on_key_up(key, time)
        }
    }

    fn on_key_up(&mut self, key: MovementKey, time: f64) -> Option<CounterStrafingAssessmentRecord> {
        let idx = key.index();
        self.key_states[idx].pressed = false;

        let opposite = key.opposite();
        let opp_idx = opposite.index();

        if self.key_states[opp_idx].pressed {
            let diff_secs = self.key_states[opp_idx].press_time - time;
            return self.try_record(key, opposite, diff_secs, time);
        }

        let axis_idx = axis_index(key.axis());
        self.axis_states[axis_idx] = AxisState {
            waiting: true,
            released_key: Some(key),
            release_time: time,
        };
        None
    }

    fn on_key_down(&mut self, key: MovementKey, time: f64) -> Option<CounterStrafingAssessmentRecord> {
        let idx = key.index();
        self.key_states[idx].pressed = true;
        self.key_states[idx].press_time = time;

        let axis = key.axis();
        let axis_idx = axis_index(axis);
        let axis_state = &self.axis_states[axis_idx];

        if axis_state.waiting {
            if let Some(released) = axis_state.released_key {
                if released.opposite() == key {
                    let diff_secs = time - axis_state.release_time;
                    self.axis_states[axis_idx] = AxisState::default();
                    return self.try_record(released, key, diff_secs, time);
                }
            }
        }
        None
    }

    fn try_record(
        &mut self,
        from: MovementKey,
        to: MovementKey,
        diff_secs: f64,
        time: f64,
    ) -> Option<CounterStrafingAssessmentRecord> {
        if !self.axis_enabled(from.axis()) {
            return None;
        }

        let max_diff_secs = self.settings.assessment_max_diff_ms / 1000.0;
        if diff_secs.abs() > max_diff_secs {
            return None;
        }

        if time - self.last_record_time < MIN_RECORD_INTERVAL_SECS {
            return None;
        }

        let diff_ms = (diff_secs * 1000.0 * 10.0).round() / 10.0;
        let perfect = self.settings.assessment_perfect_threshold_ms;
        let success = self.settings.assessment_success_threshold_ms;

        let timing = if diff_ms.abs() <= perfect {
            AssessmentTiming::Perfect
        } else if diff_ms < 0.0 {
            AssessmentTiming::Early
        } else {
            AssessmentTiming::Late
        };

        let is_perfect = diff_ms.abs() <= perfect;
        let is_success = diff_ms.abs() <= success;

        let timing_label = if is_perfect {
            "完美".to_string()
        } else if is_success {
            "优秀".to_string()
        } else if diff_ms < 0.0 {
            "偏早".to_string()
        } else {
            "偏晚".to_string()
        };

        let record = CounterStrafingAssessmentRecord {
            axis: from.axis(),
            from_key: from.label(&self.settings),
            to_key: to.label(&self.settings),
            diff_ms,
            timing,
            timing_label,
            is_perfect,
            is_success,
            timestamp_ms: (time * 1000.0) as u64,
        };

        self.last_record_time = time;
        self.records.push(record.clone());
        let limit = self.settings.assessment_history_limit;
        if self.records.len() > limit {
            let drain = self.records.len() - limit;
            self.records.drain(0..drain);
        }

        Some(record)
    }

    fn axis_enabled(&self, axis: AssessmentAxis) -> bool {
        match axis {
            AssessmentAxis::Horizontal => self.settings.assessment_horizontal_enabled,
            AssessmentAxis::Vertical => self.settings.assessment_vertical_enabled,
        }
    }

    pub fn snapshot(
        &self,
        active: bool,
        listening: bool,
        hud_visible: bool,
    ) -> CounterStrafingAssessmentSnapshot {
        let stats = compute_stats(&self.records);
        CounterStrafingAssessmentSnapshot {
            active,
            listening,
            hud_visible,
            hud_locked: false,
            records: self.records.clone(),
            avg_diff_ms: stats.avg_diff_ms,
            success_rate: stats.success_rate,
            std_dev_ms: stats.std_dev_ms,
            tendency: stats.tendency,
            tendency_label: stats.tendency_label,
            last_record: self.records.last().cloned(),
        }
    }
}

fn axis_index(axis: AssessmentAxis) -> usize {
    match axis {
        AssessmentAxis::Horizontal => 0,
        AssessmentAxis::Vertical => 1,
    }
}

struct AssessmentStats {
    avg_diff_ms: f64,
    success_rate: f64,
    std_dev_ms: f64,
    tendency: String,
    tendency_label: String,
}

fn compute_stats(records: &[CounterStrafingAssessmentRecord]) -> AssessmentStats {
    if records.is_empty() {
        return AssessmentStats {
            avg_diff_ms: 0.0,
            success_rate: 0.0,
            std_dev_ms: 0.0,
            tendency: "normal".to_string(),
            tendency_label: "正常".to_string(),
        };
    }

    let n = records.len() as f64;
    let sum: f64 = records.iter().map(|r| r.diff_ms).sum();
    let avg = (sum / n * 10.0).round() / 10.0;

    let success_count = records.iter().filter(|r| r.is_success).count() as f64;
    let success_rate = (success_count / n * 1000.0).round() / 10.0;

    let variance: f64 = records
        .iter()
        .map(|r| {
            let d = r.diff_ms - avg;
            d * d
        })
        .sum::<f64>()
        / n;
    let std_dev = (variance.sqrt() * 10.0).round() / 10.0;

    let (tendency, tendency_label) = if avg < -5.0 {
        ("early".to_string(), "整体偏早".to_string())
    } else if avg > 5.0 {
        ("late".to_string(), "整体偏晚".to_string())
    } else {
        ("normal".to_string(), "正常".to_string())
    };

    AssessmentStats {
        avg_diff_ms: avg,
        success_rate,
        std_dev_ms: std_dev,
        tendency,
        tendency_label,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::counter_strafing::types::CounterStrafingSettings;

    fn engine() -> CounterStrafingAssessmentEngine {
        CounterStrafingAssessmentEngine::new(CounterStrafingSettings::default())
    }

    #[test]
    fn late_after_release_then_opposite_press() {
        let mut e = engine();
        e.handle_movement(BindingRole::Left, true, 0.0);
        let r = e.handle_movement(BindingRole::Left, false, 0.1);
        assert!(r.is_none());
        let r = e.handle_movement(BindingRole::Right, true, 0.115).unwrap();
        assert!(r.diff_ms > 0.0);
        assert_eq!(r.timing, AssessmentTiming::Late);
    }

    #[test]
    fn early_when_opposite_pressed_before_release() {
        let mut e = engine();
        e.handle_movement(BindingRole::Left, true, 0.0);
        e.handle_movement(BindingRole::Right, true, 0.1);
        let r = e.handle_movement(BindingRole::Left, false, 0.115).unwrap();
        assert!(r.diff_ms < 0.0);
        assert_eq!(r.timing, AssessmentTiming::Early);
    }

    #[test]
    fn perfect_within_threshold() {
        let mut e = engine();
        e.handle_movement(BindingRole::Left, true, 0.0);
        e.handle_movement(BindingRole::Left, false, 0.1);
        let r = e.handle_movement(BindingRole::Right, true, 0.101).unwrap();
        assert!(r.is_perfect);
        assert_eq!(r.timing, AssessmentTiming::Perfect);
    }

    #[test]
    fn filters_extreme_diff() {
        let mut e = engine();
        e.handle_movement(BindingRole::Left, true, 0.0);
        e.handle_movement(BindingRole::Left, false, 0.1);
        let r = e.handle_movement(BindingRole::Right, true, 0.5);
        assert!(r.is_none());
    }

    #[test]
    fn filters_rapid_duplicate() {
        let mut e = engine();
        e.handle_movement(BindingRole::Left, true, 0.0);
        e.handle_movement(BindingRole::Left, false, 0.1);
        e.handle_movement(BindingRole::Right, true, 0.115).unwrap();
        e.handle_movement(BindingRole::Right, false, 0.12);
        let r = e.handle_movement(BindingRole::Left, true, 0.13);
        assert!(r.is_none());
    }

    #[test]
    fn success_within_threshold_not_perfect() {
        let mut e = engine();
        e.handle_movement(BindingRole::Left, true, 0.0);
        e.handle_movement(BindingRole::Left, false, 0.1);
        let r = e.handle_movement(BindingRole::Right, true, 0.108).unwrap();
        assert!(!r.is_perfect);
        assert!(r.is_success);
        assert_eq!(r.timing_label, "优秀");
    }

    #[test]
    fn horizontal_disabled_skips_horizontal() {
        let mut settings = CounterStrafingSettings::default();
        settings.assessment_horizontal_enabled = false;
        let mut e = CounterStrafingAssessmentEngine::new(settings);
        e.handle_movement(BindingRole::Left, true, 0.0);
        e.handle_movement(BindingRole::Left, false, 0.1);
        let r = e.handle_movement(BindingRole::Right, true, 0.115);
        assert!(r.is_none());
    }
}
