use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BindingRole {
    Forward,
    Back,
    Left,
    Right,
    Crouch,
    Fire,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum InputBinding {
    Keyboard { vk: u16, label: String },
    Mouse { button: u8, label: String },
}

impl InputBinding {
    pub fn keyboard(vk: u16, label: impl Into<String>) -> Self {
        Self::Keyboard {
            vk,
            label: label.into(),
        }
    }

    pub fn mouse(button: u8, label: impl Into<String>) -> Self {
        Self::Mouse {
            button,
            label: label.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterStrafingKeyMap {
    pub forward: InputBinding,
    pub back: InputBinding,
    pub right: InputBinding,
    pub left: InputBinding,
    pub crouch: InputBinding,
    pub fire: InputBinding,
}

impl Default for CounterStrafingKeyMap {
    fn default() -> Self {
        Self {
            forward: InputBinding::keyboard(0x57, "W"),
            back: InputBinding::keyboard(0x53, "S"),
            left: InputBinding::keyboard(0x41, "A"),
            right: InputBinding::keyboard(0x44, "D"),
            crouch: InputBinding::keyboard(0x11, "Ctrl"),
            fire: InputBinding::mouse(0, "鼠标左键"),
        }
    }
}

impl CounterStrafingKeyMap {
    pub fn binding_for_role(&self, role: BindingRole) -> &InputBinding {
        match role {
            BindingRole::Forward => &self.forward,
            BindingRole::Back => &self.back,
            BindingRole::Left => &self.left,
            BindingRole::Right => &self.right,
            BindingRole::Crouch => &self.crouch,
            BindingRole::Fire => &self.fire,
        }
    }

    pub fn set_binding(&mut self, role: BindingRole, binding: InputBinding) {
        match role {
            BindingRole::Forward => self.forward = binding,
            BindingRole::Back => self.back = binding,
            BindingRole::Left => self.left = binding,
            BindingRole::Right => self.right = binding,
            BindingRole::Crouch => self.crouch = binding,
            BindingRole::Fire => self.fire = binding,
        }
    }

    pub fn role_for_binding(&self, binding: &InputBinding) -> Option<BindingRole> {
        let roles = [
            BindingRole::Forward,
            BindingRole::Back,
            BindingRole::Left,
            BindingRole::Right,
            BindingRole::Crouch,
            BindingRole::Fire,
        ];
        roles
            .into_iter()
            .find(|role| self.binding_for_role(*role) == binding)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ShootingErrorReason {
    Crouching,
    NoMovement,
    SingleDirectionHeld,
    MultipleDirectionsHeld,
    RecentStop,
    AxisConflict,
    CounterStrafeBraking,
    NaturalDeceleration,
    CrouchGrace,
    LowSpeedMovement,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FireSampleKind {
    FireDown,
    FireHeld,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssessmentAxis {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssessmentTiming {
    Early,
    Late,
    Perfect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterStrafingAssessmentRecord {
    pub axis: AssessmentAxis,
    pub from_key: String,
    pub to_key: String,
    pub diff_ms: f64,
    pub timing: AssessmentTiming,
    pub timing_label: String,
    pub is_perfect: bool,
    pub is_success: bool,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterStrafingAssessmentSnapshot {
    pub active: bool,
    pub listening: bool,
    pub hud_visible: bool,
    #[serde(default)]
    pub hud_locked: bool,
    #[serde(default)]
    pub records: Vec<CounterStrafingAssessmentRecord>,
    #[serde(default)]
    pub avg_diff_ms: f64,
    #[serde(default)]
    pub success_rate: f64,
    #[serde(default)]
    pub std_dev_ms: f64,
    #[serde(default)]
    pub tendency: String,
    #[serde(default)]
    pub tendency_label: String,
    #[serde(default)]
    pub last_record: Option<CounterStrafingAssessmentRecord>,
}

impl Default for CounterStrafingAssessmentSnapshot {
    fn default() -> Self {
        Self {
            active: false,
            listening: false,
            hud_visible: false,
            hud_locked: false,
            records: Vec::new(),
            avg_diff_ms: 0.0,
            success_rate: 0.0,
            std_dev_ms: 0.0,
            tendency: "normal".to_string(),
            tendency_label: "正常".to_string(),
            last_record: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShootingErrorRecord {
    pub error: f64,
    pub score_label: String,
    pub reason: ShootingErrorReason,
    pub movement_keys_down: u8,
    pub crouching: bool,
    pub last_stop_age_ms: f64,
    pub timing_diff_ms: f64,
    pub fire_held: bool,
    pub sample_kind: FireSampleKind,
    pub is_stable: bool,
    pub timestamp_ms: u64,
    #[serde(default)]
    pub estimated_speed: f64,
    #[serde(default)]
    pub accuracy_threshold: f64,
    #[serde(default)]
    pub speed_ratio: f64,
    #[serde(default)]
    pub stop_success_age_ms: f64,
    #[serde(default)]
    pub counter_strafe_active: bool,
    #[serde(default)]
    pub axis_conflict: bool,
    #[serde(default)]
    pub fire_sample_delayed: bool,
    #[serde(default)]
    pub crouch_grace_active: bool,
    #[serde(default)]
    pub shot_sequence_index: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HudAnchor {
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

impl Default for HudAnchor {
    fn default() -> Self {
        Self::TopCenter
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterStrafingSnapshot {
    pub active: bool,
    pub listening: bool,
    pub hud_visible: bool,
    #[serde(default)]
    pub hud_locked: bool,
    #[serde(default = "default_true")]
    pub hud_show_stable_bars: bool,
    #[serde(default)]
    pub shot_records: Vec<ShootingErrorRecord>,
    #[serde(default)]
    pub avg_error: f64,
    #[serde(default)]
    pub stable_rate: f64,
    #[serde(default)]
    pub last_shot: Option<ShootingErrorRecord>,
    #[serde(default)]
    pub capturing_binding: Option<BindingRole>,
    #[serde(default)]
    pub fire_active: bool,
    #[serde(default)]
    pub assessment_hud_visible: bool,
    #[serde(default)]
    pub assessment_hud_locked: bool,
}

impl Default for CounterStrafingSnapshot {
    fn default() -> Self {
        Self {
            active: false,
            listening: false,
            hud_visible: false,
            hud_locked: false,
            hud_show_stable_bars: true,
            shot_records: Vec::new(),
            avg_error: 0.0,
            stable_rate: 0.0,
            last_shot: None,
            capturing_binding: None,
            fire_active: false,
            assessment_hud_visible: false,
            assessment_hud_locked: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterStrafingSettings {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_display_mode")]
    pub display_mode: String,
    #[serde(default)]
    pub key_map: CounterStrafingKeyMap,
    #[serde(default = "default_stop_settle_ms")]
    pub stop_settle_ms: f64,
    #[serde(default = "default_clean_shot_speed_ratio")]
    pub clean_shot_speed_ratio: f64,
    #[serde(default = "default_max_move_speed")]
    pub max_move_speed: f64,
    #[serde(default = "default_natural_decel_per_sec")]
    pub natural_decel_per_sec: f64,
    #[serde(default = "default_counter_strafe_accel_per_sec")]
    pub counter_strafe_accel_per_sec: f64,
    #[serde(default = "default_accel_per_sec")]
    pub accel_per_sec: f64,
    #[serde(default = "default_fire_sample_delay_ms")]
    pub fire_sample_delay_ms: f64,
    #[serde(default = "default_tap_max_hold_ms")]
    pub tap_max_hold_ms: f64,
    #[serde(default = "default_auto_fire_interval_ms")]
    pub auto_fire_interval_ms: f64,
    #[serde(default = "default_crouch_release_grace_ms")]
    pub crouch_release_grace_ms: f64,
    #[serde(default = "default_crouch_exit_ramp_ms")]
    pub crouch_exit_ramp_ms: f64,
    #[serde(default = "default_low_speed_movement_window_ms")]
    pub low_speed_movement_window_ms: f64,
    #[serde(default = "default_excellent_error_threshold")]
    pub excellent_error_threshold: f64,
    #[serde(default = "default_success_error_threshold")]
    pub success_error_threshold: f64,
    #[serde(default = "default_history_limit")]
    pub history_limit: usize,
    #[serde(default = "default_true")]
    pub hud_visible: bool,
    #[serde(default)]
    pub hud_locked: bool,
    #[serde(default = "default_true")]
    pub hud_show_stable_bars: bool,
    #[serde(default)]
    pub hud_anchor: HudAnchor,
    #[serde(default)]
    pub hud_x: Option<i32>,
    #[serde(default)]
    pub hud_y: Option<i32>,
    #[serde(default)]
    pub hud_width: Option<f64>,
    #[serde(default)]
    pub hud_height: Option<f64>,
    #[serde(default = "default_true")]
    pub assessment_enabled: bool,
    #[serde(default = "default_true")]
    pub assessment_horizontal_enabled: bool,
    #[serde(default = "default_true")]
    pub assessment_vertical_enabled: bool,
    #[serde(default = "default_assessment_perfect_threshold_ms")]
    pub assessment_perfect_threshold_ms: f64,
    #[serde(default = "default_assessment_success_threshold_ms")]
    pub assessment_success_threshold_ms: f64,
    #[serde(default = "default_assessment_max_diff_ms")]
    pub assessment_max_diff_ms: f64,
    #[serde(default = "default_assessment_history_limit")]
    pub assessment_history_limit: usize,
    #[serde(default = "default_true")]
    pub assessment_hud_visible: bool,
    #[serde(default)]
    pub assessment_hud_locked: bool,
    #[serde(default)]
    pub assessment_hud_anchor: HudAnchor,
    #[serde(default)]
    pub assessment_hud_x: Option<i32>,
    #[serde(default)]
    pub assessment_hud_y: Option<i32>,
    #[serde(default)]
    pub assessment_hud_width: Option<f64>,
    #[serde(default)]
    pub assessment_hud_height: Option<f64>,
}

fn default_enabled() -> bool {
    false
}
fn default_display_mode() -> String {
    "transparentWindow".to_string()
}
fn default_true() -> bool {
    true
}
fn default_stop_settle_ms() -> f64 {
    110.0
}
fn default_clean_shot_speed_ratio() -> f64 {
    0.34
}
fn default_max_move_speed() -> f64 {
    1.0
}
fn default_natural_decel_per_sec() -> f64 {
    2.5
}
fn default_counter_strafe_accel_per_sec() -> f64 {
    14.0
}
fn default_accel_per_sec() -> f64 {
    5.5
}
fn default_fire_sample_delay_ms() -> f64 {
    18.0
}
fn default_tap_max_hold_ms() -> f64 {
    90.0
}
fn default_auto_fire_interval_ms() -> f64 {
    100.0
}
fn default_crouch_release_grace_ms() -> f64 {
    45.0
}
fn default_crouch_exit_ramp_ms() -> f64 {
    90.0
}
fn default_low_speed_movement_window_ms() -> f64 {
    180.0
}
fn default_excellent_error_threshold() -> f64 {
    0.15
}
fn default_success_error_threshold() -> f64 {
    0.35
}
fn default_history_limit() -> usize {
    300
}
fn default_assessment_perfect_threshold_ms() -> f64 {
    2.0
}
fn default_assessment_success_threshold_ms() -> f64 {
    10.0
}
fn default_assessment_max_diff_ms() -> f64 {
    150.0
}
fn default_assessment_history_limit() -> usize {
    300
}

impl Default for CounterStrafingSettings {
    fn default() -> Self {
        Self {
            enabled: default_enabled(),
            display_mode: default_display_mode(),
            key_map: CounterStrafingKeyMap::default(),
            stop_settle_ms: default_stop_settle_ms(),
            clean_shot_speed_ratio: default_clean_shot_speed_ratio(),
            max_move_speed: default_max_move_speed(),
            natural_decel_per_sec: default_natural_decel_per_sec(),
            counter_strafe_accel_per_sec: default_counter_strafe_accel_per_sec(),
            accel_per_sec: default_accel_per_sec(),
            fire_sample_delay_ms: default_fire_sample_delay_ms(),
            tap_max_hold_ms: default_tap_max_hold_ms(),
            auto_fire_interval_ms: default_auto_fire_interval_ms(),
            crouch_release_grace_ms: default_crouch_release_grace_ms(),
            crouch_exit_ramp_ms: default_crouch_exit_ramp_ms(),
            low_speed_movement_window_ms: default_low_speed_movement_window_ms(),
            excellent_error_threshold: default_excellent_error_threshold(),
            success_error_threshold: default_success_error_threshold(),
            history_limit: default_history_limit(),
            hud_visible: default_true(),
            hud_locked: false,
            hud_show_stable_bars: default_true(),
            hud_anchor: HudAnchor::default(),
            hud_x: None,
            hud_y: None,
            hud_width: None,
            hud_height: None,
            assessment_enabled: default_true(),
            assessment_horizontal_enabled: default_true(),
            assessment_vertical_enabled: default_true(),
            assessment_perfect_threshold_ms: default_assessment_perfect_threshold_ms(),
            assessment_success_threshold_ms: default_assessment_success_threshold_ms(),
            assessment_max_diff_ms: default_assessment_max_diff_ms(),
            assessment_history_limit: default_assessment_history_limit(),
            assessment_hud_visible: default_true(),
            assessment_hud_locked: false,
            assessment_hud_anchor: HudAnchor::BottomCenter,
            assessment_hud_x: None,
            assessment_hud_y: None,
            assessment_hud_width: None,
            assessment_hud_height: None,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum InputSource {
    Keyboard(u16),
    Mouse(u8),
}

#[derive(Debug, Clone, Copy)]
pub struct InputEvent {
    pub source: InputSource,
    pub is_down: bool,
    pub time_secs: f64,
}
