use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

const INDEX_FILENAME: &str = "index.json";
const ENTRIES_DIRNAME: &str = "entries";
const INDEX_SCHEMA_VERSION: u64 = 2;

fn history_root() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法获取程序路径: {e}"))?;
    let parent = exe
        .parent()
        .ok_or_else(|| "无法获取程序所在目录".to_string())?;
    let root = parent.join("match-history");

    if !index_path(&root).exists() {
        if let Some(legacy) =
            dirs::data_local_dir().map(|d| d.join("CSMatchHelper").join("match-history"))
        {
            if index_path(&legacy).exists() {
                let _ = migrate_legacy_history(&legacy, &root);
            }
        }
    }

    Ok(root)
}

fn migrate_legacy_history(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(entries_dir(to)).map_err(|e| format!("创建历史目录失败: {e}"))?;
    let from_index = index_path(from);
    if from_index.exists() {
        fs::copy(&from_index, index_path(to)).map_err(|e| format!("迁移索引失败: {e}"))?;
    }
    let from_entries = entries_dir(from);
    if from_entries.exists() {
        for entry in fs::read_dir(&from_entries).map_err(|e| format!("读取旧 entries 失败: {e}"))? {
            let entry = entry.map_err(|e| format!("读取旧 entry 失败: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(name) = path.file_name() {
                    let _ = fs::copy(&path, entries_dir(to).join(name));
                }
            }
        }
    }
    Ok(())
}

fn index_path(root: &Path) -> PathBuf {
    root.join(INDEX_FILENAME)
}

fn entries_dir(root: &Path) -> PathBuf {
    root.join(ENTRIES_DIRNAME)
}

fn entry_filename(platform_id: &str, id: &str) -> String {
    let safe_platform = sanitize_component(platform_id);
    let safe_id = sanitize_component(id);
    format!("{safe_platform}_{safe_id}.json")
}

fn sanitize_component(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => c,
            _ => '_',
        })
        .collect()
}

fn ensure_dirs(root: &Path) -> Result<(), String> {
    fs::create_dir_all(entries_dir(root)).map_err(|e| format!("创建历史目录失败: {e}"))?;
    Ok(())
}

fn atomic_write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&tmp, text).map_err(|e| format!("写入临时文件失败: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("替换文件失败: {e}"))?;
    Ok(())
}

fn empty_index() -> Value {
    json!({
        "schemaVersion": INDEX_SCHEMA_VERSION,
        "entries": []
    })
}

fn thin_index_item(id: &str, platform_id: &str, saved_at: &Value, updated_at: &Value) -> Value {
    json!({
        "id": id,
        "platformId": platform_id,
        "savedAt": saved_at,
        "updatedAt": updated_at,
    })
}

fn slim_index_item(raw: &Value) -> Option<Value> {
    let id = raw.get("id").and_then(|v| v.as_str())?;
    let platform_id = raw.get("platformId").and_then(|v| v.as_str())?;
    let saved_at = raw.get("savedAt").cloned().unwrap_or(json!(0));
    let updated_at = raw
        .get("updatedAt")
        .cloned()
        .unwrap_or_else(|| saved_at.clone());
    Some(thin_index_item(id, platform_id, &saved_at, &updated_at))
}

/// 将任意旧 index 收成 v2 瘦元数据；返回是否发生变更
fn slim_index(index: &mut Value) -> bool {
    let mut changed = false;
    let version = index
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);
    if version != INDEX_SCHEMA_VERSION {
        if let Some(obj) = index.as_object_mut() {
            obj.insert("schemaVersion".into(), json!(INDEX_SCHEMA_VERSION));
            changed = true;
        }
    }
    if index.get("maxEntries").is_some() {
        if let Some(obj) = index.as_object_mut() {
            obj.remove("maxEntries");
            changed = true;
        }
    }

    let Some(entries) = index.get_mut("entries").and_then(|v| v.as_array_mut()) else {
        return changed;
    };

    let mut next = Vec::with_capacity(entries.len());
    for entry in entries.iter() {
        if let Some(slim) = slim_index_item(entry) {
            if slim != *entry {
                changed = true;
            }
            next.push(slim);
        } else {
            changed = true;
        }
    }
    *entries = next;
    changed
}

fn read_index(root: &Path) -> Result<Value, String> {
    let path = index_path(root);
    if !path.exists() {
        return Ok(empty_index());
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("读取历史索引失败: {e}"))?;
    if text.trim().is_empty() {
        return Ok(empty_index());
    }
    serde_json::from_str(&text).map_err(|e| format!("解析历史索引失败: {e}"))
}

fn write_index(root: &Path, index: &Value) -> Result<(), String> {
    atomic_write_json(&index_path(root), index)
}

fn read_entry(root: &Path, platform_id: &str, id: &str) -> Result<Option<Value>, String> {
    let path = entries_dir(root).join(entry_filename(platform_id, id));
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("读取历史条目失败: {e}"))?;
    let value: Value = serde_json::from_str(&text).map_err(|e| format!("解析历史条目失败: {e}"))?;
    Ok(Some(value))
}

fn write_entry(root: &Path, platform_id: &str, id: &str, doc: &Value) -> Result<(), String> {
    let path = entries_dir(root).join(entry_filename(platform_id, id));
    atomic_write_json(&path, doc)
}

fn delete_entry_file(root: &Path, platform_id: &str, id: &str) {
    let path = entries_dir(root).join(entry_filename(platform_id, id));
    let _ = fs::remove_file(path);
}

fn merge_objects(base: &Value, patch: &Value) -> Value {
    match (base, patch) {
        (Value::Object(base_map), Value::Object(patch_map)) => {
            let mut out = base_map.clone();
            for (k, v) in patch_map {
                if k == "sections" {
                    let merged_sections = merge_sections(out.get("sections"), v);
                    out.insert(k.clone(), merged_sections);
                } else {
                    out.insert(k.clone(), v.clone());
                }
            }
            Value::Object(out)
        }
        (_, patch) => patch.clone(),
    }
}

fn merge_sections(existing: Option<&Value>, patch: &Value) -> Value {
    let mut out: Map<String, Value> = match existing {
        Some(Value::Object(map)) => map.clone(),
        _ => Map::new(),
    };
    if let Value::Object(patch_map) = patch {
        for (k, v) in patch_map {
            out.insert(k.clone(), v.clone());
        }
    }
    Value::Object(out)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn build_index_meta_from_doc(doc: &Value, existing: Option<&Value>) -> Value {
    let id = doc.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let platform_id = doc.get("platformId").and_then(|v| v.as_str()).unwrap_or("");
    let saved_at = doc
        .get("savedAt")
        .cloned()
        .or_else(|| existing.and_then(|e| e.get("savedAt").cloned()))
        .unwrap_or(json!(0));
    let updated_at = doc.get("updatedAt").cloned().unwrap_or_else(|| saved_at.clone());
    thin_index_item(id, platform_id, &saved_at, &updated_at)
}

fn upsert_index_item(index: &mut Value, item: Value) -> Result<(), String> {
    let id = item
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "index item 缺少 id".to_string())?
        .to_string();
    let platform_id = item
        .get("platformId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "index item 缺少 platformId".to_string())?
        .to_string();

    let entries = index
        .get_mut("entries")
        .and_then(|v| v.as_array_mut())
        .ok_or_else(|| "index 缺少 entries".to_string())?;

    if let Some(pos) = entries.iter().position(|e| {
        e.get("id").and_then(|v| v.as_str()) == Some(id.as_str())
            && e.get("platformId").and_then(|v| v.as_str()) == Some(platform_id.as_str())
    }) {
        entries.remove(pos);
    }
    entries.insert(0, item);
    Ok(())
}

fn remove_index_item(index: &mut Value, platform_id: &str, id: &str) {
    if let Some(entries) = index.get_mut("entries").and_then(|v| v.as_array_mut()) {
        entries.retain(|e| {
            !(e.get("id").and_then(|v| v.as_str()) == Some(id)
                && e.get("platformId").and_then(|v| v.as_str()) == Some(platform_id))
        });
    }
}

fn find_existing_index_item<'a>(index: &'a Value, platform_id: &str, id: &str) -> Option<&'a Value> {
    index
        .get("entries")
        .and_then(|v| v.as_array())
        .and_then(|entries| {
            entries.iter().find(|e| {
                e.get("id").and_then(|v| v.as_str()) == Some(id)
                    && e.get("platformId").and_then(|v| v.as_str()) == Some(platform_id)
            })
        })
}

fn load_and_slim_index(root: &Path) -> Result<Value, String> {
    let mut index = read_index(root)?;
    if slim_index(&mut index) {
        write_index(root, &index)?;
    }
    Ok(index)
}

#[tauri::command]
pub fn list_match_history() -> Result<Value, String> {
    let root = history_root()?;
    ensure_dirs(&root)?;
    load_and_slim_index(&root)
}

#[tauri::command]
pub fn list_match_history_documents() -> Result<Value, String> {
    let root = history_root()?;
    ensure_dirs(&root)?;
    let index = load_and_slim_index(&root)?;
    let entries = index
        .get("entries")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut docs = Vec::with_capacity(entries.len());
    for entry in entries {
        let id = entry.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let platform_id = entry.get("platformId").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() || platform_id.is_empty() {
            continue;
        }
        if let Some(doc) = read_entry(&root, platform_id, id)? {
            docs.push(doc);
        }
    }
    Ok(Value::Array(docs))
}

#[tauri::command]
pub fn get_match_history_entry(platform_id: String, id: String) -> Result<Option<Value>, String> {
    let root = history_root()?;
    ensure_dirs(&root)?;
    read_entry(&root, &platform_id, &id)
}

#[tauri::command]
pub fn upsert_match_history_entry(document: Value) -> Result<Value, String> {
    let root = history_root()?;
    ensure_dirs(&root)?;

    let id = document
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "document 缺少 id".to_string())?
        .to_string();
    let platform_id = document
        .get("platformId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "document 缺少 platformId".to_string())?
        .to_string();

    let existing = read_entry(&root, &platform_id, &id)?;
    let merged = match existing {
        Some(base) => {
            let mut merged = merge_objects(&base, &document);
            if let (Some(obj), Some(saved)) = (merged.as_object_mut(), base.get("savedAt")) {
                obj.insert("savedAt".into(), saved.clone());
            }
            merged
        }
        None => document,
    };

    write_entry(&root, &platform_id, &id, &merged)?;

    let mut index = load_and_slim_index(&root)?;
    let existing_item = find_existing_index_item(&index, &platform_id, &id).cloned();
    let item = build_index_meta_from_doc(&merged, existing_item.as_ref());
    upsert_index_item(&mut index, item)?;
    write_index(&root, &index)?;
    Ok(index)
}

#[tauri::command]
pub fn patch_match_history_section(
    platform_id: String,
    id: String,
    section_name: String,
    section: Value,
) -> Result<Value, String> {
    let root = history_root()?;
    ensure_dirs(&root)?;

    let existing = read_entry(&root, &platform_id, &id)?
        .ok_or_else(|| "历史条目不存在，无法 patch section".to_string())?;

    let mut doc = existing;
    {
        let obj = doc
            .as_object_mut()
            .ok_or_else(|| "历史文档格式无效".to_string())?;
        let sections = obj
            .entry("sections".to_string())
            .or_insert_with(|| json!({}));
        let sections_obj = sections
            .as_object_mut()
            .ok_or_else(|| "sections 格式无效".to_string())?;
        sections_obj.insert(section_name, section);
        obj.insert("updatedAt".into(), json!(now_ms()));
    }

    write_entry(&root, &platform_id, &id, &doc)?;

    let mut index = load_and_slim_index(&root)?;
    let existing_item = find_existing_index_item(&index, &platform_id, &id).cloned();
    let item = build_index_meta_from_doc(&doc, existing_item.as_ref());
    upsert_index_item(&mut index, item)?;
    write_index(&root, &index)?;
    Ok(index)
}

#[tauri::command]
pub fn delete_match_history_entry(platform_id: String, id: String) -> Result<Value, String> {
    let root = history_root()?;
    ensure_dirs(&root)?;
    delete_entry_file(&root, &platform_id, &id);
    let mut index = load_and_slim_index(&root)?;
    remove_index_item(&mut index, &platform_id, &id);
    write_index(&root, &index)?;
    Ok(index)
}

#[tauri::command]
pub fn clear_match_history() -> Result<Value, String> {
    let root = history_root()?;
    ensure_dirs(&root)?;
    let dir = entries_dir(&root);
    if dir.exists() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("读取 entries 失败: {e}"))? {
            let entry = entry.map_err(|e| format!("读取 entry 失败: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                let _ = fs::remove_file(path);
            }
        }
    }
    let index = empty_index();
    write_index(&root, &index)?;
    Ok(index)
}
