use serde_json::{json, Map, Value};
use std::{fs, path::Path, path::PathBuf, sync::Mutex};

pub const SETTINGS_FILENAME: &str = "cs-match-helper-settings.json";

static SETTINGS_FILE_LOCK: Mutex<()> = Mutex::new(());

pub fn settings_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| format!("无法获取程序路径: {error}"))?;
    let parent = exe
        .parent()
        .ok_or_else(|| "无法获取程序所在目录".to_string())?;
    Ok(parent.join(SETTINGS_FILENAME))
}

fn read_unlocked(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let content =
        fs::read_to_string(path).map_err(|error| format!("读取设置失败 ({path:?}): {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析设置失败: {error}"))
}

pub fn read_settings_json() -> Result<Value, String> {
    read_settings_json_from(settings_path()?)
}

pub fn read_settings_json_from(path: impl AsRef<Path>) -> Result<Value, String> {
    let _guard = SETTINGS_FILE_LOCK
        .lock()
        .map_err(|_| "设置文件锁已损坏".to_string())?;
    read_unlocked(path.as_ref())
}

pub fn update_settings_json(
    update: impl FnOnce(&mut Map<String, Value>) -> Result<bool, String>,
) -> Result<(), String> {
    update_settings_json_at(settings_path()?, update)
}

pub fn update_settings_json_at(
    path: impl AsRef<Path>,
    update: impl FnOnce(&mut Map<String, Value>) -> Result<bool, String>,
) -> Result<(), String> {
    let _guard = SETTINGS_FILE_LOCK
        .lock()
        .map_err(|_| "设置文件锁已损坏".to_string())?;
    let path = path.as_ref();
    let mut root = read_unlocked(path)?;
    let root_object = root
        .as_object_mut()
        .ok_or_else(|| "设置文件根节点不是对象".to_string())?;
    if !update(root_object)? {
        return Ok(());
    }
    let content =
        serde_json::to_string_pretty(&root).map_err(|error| format!("序列化设置失败: {error}"))?;
    fs::write(path, content).map_err(|error| format!("保存设置失败 ({path:?}): {error}"))
}
