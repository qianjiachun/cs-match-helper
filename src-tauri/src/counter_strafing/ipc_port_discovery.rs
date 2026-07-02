use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub const DEFAULT_IPC_HOST: &str = "127.0.0.1";
#[allow(dead_code)]
pub const DEFAULT_IPC_PORT: u16 = 39281;
pub const IPC_PORT_RANGE: std::ops::RangeInclusive<u16> = 39281..=39290;
const DISCOVERY_FILENAME: &str = "ipc-port.json";
const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcPortDiscovery {
    pub host: String,
    pub port: u16,
    pub schema_version: u32,
    pub updated_at: u64,
    #[serde(default)]
    pub active: bool,
}

pub fn discovery_dir() -> Result<PathBuf, String> {
    let local =
        std::env::var("LOCALAPPDATA").map_err(|e| format!("无法获取 LOCALAPPDATA: {e}"))?;
    Ok(PathBuf::from(local)
        .join("CSMatchHelper")
        .join("gamebar-widget"))
}

pub fn discovery_path() -> Result<PathBuf, String> {
    Ok(discovery_dir()?.join(DISCOVERY_FILENAME))
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn write_ipc_port_discovery(port: u16) -> Result<(), String> {
    write_ipc_port_discovery_with_active(port, true)
}

pub fn write_ipc_port_discovery_inactive(port: u16) {
    let _ = write_ipc_port_discovery_with_active(port, false);
}

fn write_ipc_port_discovery_with_active(port: u16, active: bool) -> Result<(), String> {
    let dir = discovery_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建端口发现目录失败: {e}"))?;
    let info = IpcPortDiscovery {
        host: DEFAULT_IPC_HOST.to_string(),
        port,
        schema_version: SCHEMA_VERSION,
        updated_at: unix_ms(),
        active,
    };
    let json =
        serde_json::to_string(&info).map_err(|e| format!("序列化端口发现信息失败: {e}"))?;
    fs::write(discovery_path()?, json).map_err(|e| format!("写入端口发现文件失败: {e}"))
}

pub fn clear_ipc_port_discovery() {
    if let Ok(path) = discovery_path() {
        let _ = fs::remove_file(path);
    }
}

pub fn bind_ipc_listener() -> Result<(TcpListener, u16), String> {
    for port in IPC_PORT_RANGE {
        let addr = format!("{DEFAULT_IPC_HOST}:{port}");
        match TcpListener::bind(&addr) {
            Ok(listener) => return Ok((listener, port)),
            Err(e) if e.kind() == io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(format!("绑定快照接口失败 ({addr}): {e}")),
        }
    }
    Err(format!(
        "端口 {}-{} 均被占用，无法启动快照接口",
        IPC_PORT_RANGE.start(),
        IPC_PORT_RANGE.end()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_port_in_range() {
        assert!(IPC_PORT_RANGE.contains(&DEFAULT_IPC_PORT));
    }
}
