use crate::counter_strafing::types::CounterStrafingSettings;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

const SETTINGS_FILENAME: &str = "cs-match-helper-settings.json";

fn settings_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法获取程序路径: {e}"))?;
    let parent = exe
        .parent()
        .ok_or_else(|| "无法获取程序所在目录".to_string())?;
    Ok(parent.join(SETTINGS_FILENAME))
}

fn read_settings_json() -> Result<Value, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(json!({}));
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("读取设置失败 ({path:?}): {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析设置失败: {e}"))
}

pub fn load_counter_strafing_settings() -> Result<CounterStrafingSettings, String> {
    let root = read_settings_json()?;
    match root.get("counterStrafing") {
        Some(v) => {
            let mut value = v.clone();
            if let Some(obj) = value.as_object_mut() {
                obj.entry("hudShowStableBars")
                    .or_insert(serde_json::Value::Bool(true));
                obj.entry("hudShowTapMarkers")
                    .or_insert(serde_json::Value::Bool(true));
            }
            serde_json::from_value(value).map_err(|e| format!("解析急停设置失败: {e}"))
        }
        None => Ok(CounterStrafingSettings::default()),
    }
}

pub fn save_counter_strafing_settings(settings: &CounterStrafingSettings) -> Result<(), String> {
    let path = settings_path()?;
    let mut root = read_settings_json()?;
    root["counterStrafing"] = serde_json::to_value(settings)
        .map_err(|e| format!("序列化急停设置失败: {e}"))?;
    let content =
        serde_json::to_string_pretty(&root).map_err(|e| format!("序列化设置失败: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("保存设置失败 ({path:?}): {e}"))
}
