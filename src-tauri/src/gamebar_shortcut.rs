#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameBarOpenShortcut {
    pub display: String,
    pub from_registry: bool,
}

const DEFAULT_HOTKEY_DWORD: u32 = 0x0008_0047;

pub fn read_game_bar_open_shortcut() -> GameBarOpenShortcut {
    #[cfg(windows)]
    {
        return read_game_bar_open_shortcut_windows();
    }
    #[cfg(not(windows))]
    {
        GameBarOpenShortcut {
            display: default_shortcut_display(),
            from_registry: false,
        }
    }
}

pub fn default_shortcut_display() -> String {
    decode_hotkey_dword(DEFAULT_HOTKEY_DWORD)
        .unwrap_or_else(|| "Win+G".to_string())
}

#[cfg(windows)]
fn read_game_bar_open_shortcut_windows() -> GameBarOpenShortcut {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(game_dvr) = hkcu.open_subkey(r"Software\Microsoft\Windows\CurrentVersion\GameDVR")
    else {
        return default_shortcut();
    };

    let hotkey = game_dvr.get_value::<u32, _>("VKToggleGameBar").ok();
    let Some(hotkey) = hotkey.filter(|value| *value != 0) else {
        return default_shortcut();
    };

    let Some(display) = decode_hotkey_dword(hotkey) else {
        return default_shortcut();
    };

    GameBarOpenShortcut {
        display,
        from_registry: true,
    }
}

fn default_shortcut() -> GameBarOpenShortcut {
    GameBarOpenShortcut {
        display: default_shortcut_display(),
        from_registry: false,
    }
}

fn decode_hotkey_dword(value: u32) -> Option<String> {
    let vk = (value & 0xFF) as u8;
    let modifiers = ((value >> 16) & 0xFF) as u8;
    if vk == 0 {
        return None;
    }

    let key = vk_to_label(vk)?;
    let mut parts = Vec::new();
    if modifiers & 0x8 != 0 {
        parts.push("Win".to_string());
    }
    if modifiers & 0x2 != 0 {
        parts.push("Ctrl".to_string());
    }
    if modifiers & 0x4 != 0 {
        parts.push("Alt".to_string());
    }
    if modifiers & 0x1 != 0 {
        parts.push("Shift".to_string());
    }
    parts.push(key);
    Some(parts.join("+"))
}

fn vk_to_label(vk: u8) -> Option<String> {
    match vk {
        0x08 => Some("Backspace".into()),
        0x09 => Some("Tab".into()),
        0x0D => Some("Enter".into()),
        0x1B => Some("Esc".into()),
        0x20 => Some("Space".into()),
        0x21 => Some("Page Up".into()),
        0x22 => Some("Page Down".into()),
        0x23 => Some("End".into()),
        0x24 => Some("Home".into()),
        0x25 => Some("Left".into()),
        0x26 => Some("Up".into()),
        0x27 => Some("Right".into()),
        0x28 => Some("Down".into()),
        0x2D => Some("Insert".into()),
        0x2E => Some("Delete".into()),
        0x30..=0x39 => Some((((vk - 0x30) + b'0') as char).to_string()),
        0x41..=0x5A => Some((((vk - 0x41) + b'A') as char).to_string()),
        0x5B | 0x5C => Some("Win".into()),
        0x60..=0x69 => Some(format!("Num {}", vk - 0x60)),
        0x70..=0x87 => Some(format!("F{}", vk - 0x6F)),
        0xBA..=0xC0 => vk_to_oem_label(vk),
        0xDB..=0xDE => vk_to_oem_label(vk),
        _ => None,
    }
}

fn vk_to_oem_label(vk: u8) -> Option<String> {
    let label = match vk {
        0xBA => ";",
        0xBB => "=",
        0xBC => ",",
        0xBD => "-",
        0xBE => ".",
        0xBF => "/",
        0xC0 => "`",
        0xDB => "[",
        0xDC => "\\",
        0xDD => "]",
        0xDE => "'",
        _ => return None,
    };
    Some(label.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_default_win_g() {
        assert_eq!(
            decode_hotkey_dword(0x0008_0047).as_deref(),
            Some("Win+G")
        );
    }

    #[test]
    fn decodes_win_alt_g() {
        assert_eq!(
            decode_hotkey_dword(0x000C_0047).as_deref(),
            Some("Win+Alt+G")
        );
    }

    #[test]
    fn decodes_ctrl_shift_f12() {
        assert_eq!(
            decode_hotkey_dword(0x0003_007B).as_deref(),
            Some("Ctrl+Shift+F12")
        );
    }

    #[test]
    fn rejects_zero_virtual_key() {
        assert!(decode_hotkey_dword(0).is_none());
    }

    #[test]
    fn default_shortcut_is_win_g() {
        assert_eq!(default_shortcut_display(), "Win+G");
    }
}
