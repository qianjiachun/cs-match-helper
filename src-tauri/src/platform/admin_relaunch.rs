#[cfg(windows)]
pub fn relaunch_current_exe_as_admin() -> Result<(), String> {
    use std::env;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{GetLastError, HWND};
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWDEFAULT;

    fn wide(value: &OsStr) -> Vec<u16> {
        OsStrExt::encode_wide(value)
            .chain(std::iter::once(0))
            .collect()
    }

    const ERROR_CANCELLED: u32 = 1223;

    let exe = env::current_exe().map_err(|e| format!("无法获取程序路径: {e}"))?;
    let verb = wide(OsStr::new("runas"));
    let file = wide(exe.as_os_str());

    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        hwnd: HWND::default(),
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: PCWSTR::null(),
        lpDirectory: PCWSTR::null(),
        nShow: SW_SHOWDEFAULT.0,
        ..Default::default()
    };

    let shell_ok = unsafe { ShellExecuteExW(&mut info).is_ok() };
    let inst = info.hInstApp.0 as isize;
    if !shell_ok || inst <= 32 {
        let code = unsafe { GetLastError().0 };
        if code == ERROR_CANCELLED {
            return Err("已取消 UAC 提示。如需管理员权限，请在弹窗中点击「是」。".to_string());
        }
        return Err(format!(
            "无法以管理员身份重启（错误码 {code}）。你也可以右键程序图标 → 以管理员身份运行。"
        ));
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn relaunch_current_exe_as_admin() -> Result<(), String> {
    Err("仅 Windows 支持以管理员身份重启".to_string())
}
