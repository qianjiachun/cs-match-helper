use tauri::WebviewWindow;

/// HUD 浮层：禁止用户通过系统菜单关闭/最大化/最小化
pub fn harden_hud_window(window: &WebviewWindow) {
    let _ = window.set_closable(false);
    let _ = window.set_minimizable(false);
    let _ = window.set_maximizable(false);

    #[cfg(windows)]
    disable_windows_system_menu(window);
}

#[cfg(windows)]
fn disable_windows_system_menu(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMenu, GetWindowLongPtrW, SetWindowLongPtrW, GWL_STYLE, MF_BYCOMMAND, RemoveMenu,
        SC_CLOSE, SC_MAXIMIZE, SC_MINIMIZE, SC_RESTORE, WS_SYSMENU,
    };

    let Ok(hwnd_raw) = window.hwnd() else {
        return;
    };

    let hwnd = HWND(hwnd_raw.0);

    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        SetWindowLongPtrW(hwnd, GWL_STYLE, style & !(WS_SYSMENU.0 as isize));

        let menu = GetSystemMenu(hwnd, false);
        if !menu.is_invalid() {
            let _ = RemoveMenu(menu, SC_CLOSE, MF_BYCOMMAND);
            let _ = RemoveMenu(menu, SC_MAXIMIZE, MF_BYCOMMAND);
            let _ = RemoveMenu(menu, SC_MINIMIZE, MF_BYCOMMAND);
            let _ = RemoveMenu(menu, SC_RESTORE, MF_BYCOMMAND);
        }
    }
}

#[cfg(not(windows))]
fn disable_windows_system_menu(_window: &WebviewWindow) {}
