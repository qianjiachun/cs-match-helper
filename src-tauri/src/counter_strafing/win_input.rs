#[cfg(windows)]
mod platform {
    use crate::counter_strafing::types::{InputEvent, InputSource};
    use crossbeam_channel::{bounded, Receiver, Sender};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, OnceLock};
    use std::thread::{self, JoinHandle};
    use std::time::Duration;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{GetLastError, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};
    use windows::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER,
        RIDEV_INPUTSINK, RIDEV_REMOVE, RID_INPUT, RIM_TYPEKEYBOARD, RIM_TYPEMOUSE,
    };
    use std::sync::Mutex;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, PostMessageW,
        PostQuitMessage, RegisterClassW, SetWindowLongPtrW, TranslateMessage, CS_HREDRAW, CS_VREDRAW,
        GetWindowLongPtrW, GWLP_USERDATA, MSG, WM_CLOSE, WM_DESTROY, WM_INPUT, WNDCLASSW, WS_OVERLAPPED,
    };

    const CLASS_NAME: &str = "CSMatchHelperRawInput";
    const CHANNEL_CAPACITY: usize = 256;
    const HID_USAGE_PAGE_GENERIC: u16 = 0x01;
    const HID_USAGE_GENERIC_KEYBOARD: u16 = 0x06;
    const HID_USAGE_GENERIC_MOUSE: u16 = 0x02;

    const RI_MOUSE_LEFT_BUTTON_DOWN: u16 = 0x0001;
    const RI_MOUSE_LEFT_BUTTON_UP: u16 = 0x0002;
    const RI_MOUSE_RIGHT_BUTTON_DOWN: u16 = 0x0004;
    const RI_MOUSE_RIGHT_BUTTON_UP: u16 = 0x0008;
    const RI_MOUSE_MIDDLE_BUTTON_DOWN: u16 = 0x0010;
    const RI_MOUSE_MIDDLE_BUTTON_UP: u16 = 0x0020;
    const RI_MOUSE_BUTTON_4_DOWN: u16 = 0x0040;
    const RI_MOUSE_BUTTON_4_UP: u16 = 0x0080;
    const RI_MOUSE_BUTTON_5_DOWN: u16 = 0x0100;
    const RI_MOUSE_BUTTON_5_UP: u16 = 0x0200;

    const ERROR_CLASS_ALREADY_EXISTS: u32 = 1410;
    const INPUT_INIT_TIMEOUT: Duration = Duration::from_secs(2);
    const INPUT_INIT_POLL: Duration = Duration::from_millis(5);
    const INPUT_HEALTH_CHECK: Duration = Duration::from_millis(50);

    pub fn is_process_elevated() -> bool {
        use windows::Win32::UI::Shell::IsUserAnAdmin;
        unsafe { IsUserAnAdmin().as_bool() }
    }

    pub fn format_input_listener_error(detail: Option<&str>) -> String {
        let detail = detail.unwrap_or("输入监听初始化超时");
        if is_process_elevated() {
            format!(
                "按键监听启动失败：{detail}。请完全退出本软件后重试；若仍失败，可尝试重启电脑。"
            )
        } else {
            format!(
                "按键监听启动失败：{detail}。监听全局按键通常需要管理员权限，请右键「CS 匹配助手」→「以管理员身份运行」后重试。"
            )
        }
    }

    fn set_init_error(init_error: &Arc<Mutex<Option<String>>>, msg: impl Into<String>) {
        *init_error.lock().unwrap() = Some(msg.into());
    }

    fn stop_listener_thread(
        running: &Arc<AtomicBool>,
        hwnd_slot: &Arc<Mutex<Option<isize>>>,
        handle: Option<JoinHandle<()>>,
    ) {
        running.store(false, Ordering::SeqCst);
        if let Some(hwnd) = *hwnd_slot.lock().unwrap() {
            unsafe {
                let _ = PostMessageW(HWND(hwnd as _), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
        }
        if let Some(handle) = handle {
            let _ = handle.join();
        }
    }

    static QPC_FREQ: OnceLock<f64> = OnceLock::new();

    pub fn qpc_secs() -> f64 {
        let freq = *QPC_FREQ.get_or_init(|| unsafe {
            let mut f = i64::default();
            let _ = QueryPerformanceFrequency(&mut f);
            f as f64
        });
        unsafe {
            let mut c = i64::default();
            let _ = QueryPerformanceCounter(&mut c);
            c as f64 / freq
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    pub struct InputListener {
        running: Arc<AtomicBool>,
        hwnd: Arc<Mutex<Option<isize>>>,
        handle: Option<JoinHandle<()>>,
        rx: Receiver<InputEvent>,
    }

    impl InputListener {
        pub fn start() -> Result<Self, String> {
            let (tx, rx) = bounded(CHANNEL_CAPACITY);
            let running = Arc::new(AtomicBool::new(true));
            let ready = Arc::new(AtomicBool::new(false));
            let init_error: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
            let running_flag = Arc::clone(&running);
            let ready_flag = Arc::clone(&ready);
            let init_error_for_thread = Arc::clone(&init_error);
            let hwnd_slot: Arc<Mutex<Option<isize>>> = Arc::new(Mutex::new(None));

            let hwnd_for_thread = Arc::clone(&hwnd_slot);
            let handle = thread::Builder::new()
                .name("counter-strafing-input".into())
                .spawn(move || {
                    if let Err(e) = run_message_loop(
                        tx,
                        running_flag,
                        ready_flag,
                        hwnd_for_thread,
                        init_error_for_thread,
                    ) {
                        eprintln!("[counter-strafing] input loop error: {e}");
                    }
                })
                .map_err(|e| format!("启动输入线程失败: {e}"))?;

            let started = std::time::Instant::now();
            while started.elapsed() < INPUT_INIT_TIMEOUT {
                if ready.load(Ordering::SeqCst) {
                    thread::sleep(INPUT_HEALTH_CHECK);
                    if !running.load(Ordering::SeqCst) {
                        let detail = init_error.lock().unwrap().clone();
                        stop_listener_thread(&running, &hwnd_slot, Some(handle));
                        return Err(format_input_listener_error(detail.as_deref()));
                    }
                    return Ok(Self {
                        running,
                        hwnd: hwnd_slot,
                        handle: Some(handle),
                        rx,
                    });
                }
                if !running.load(Ordering::SeqCst) {
                    break;
                }
                thread::sleep(INPUT_INIT_POLL);
            }

            let detail = init_error.lock().unwrap().clone();
            stop_listener_thread(&running, &hwnd_slot, Some(handle));
            Err(format_input_listener_error(detail.as_deref()))
        }

        pub fn receiver(&self) -> &Receiver<InputEvent> {
            &self.rx
        }

        pub fn stop(&mut self) {
            self.running.store(false, Ordering::SeqCst);
            if let Some(hwnd) = *self.hwnd.lock().unwrap() {
                unsafe {
                    let _ = PostMessageW(HWND(hwnd as _), WM_CLOSE, WPARAM(0), LPARAM(0));
                }
            }
            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
    }

    impl Drop for InputListener {
        fn drop(&mut self) {
            self.stop();
        }
    }

    struct LoopState {
        tx: Sender<InputEvent>,
    }

    fn run_message_loop(
        tx: Sender<InputEvent>,
        running: Arc<AtomicBool>,
        ready: Arc<AtomicBool>,
        hwnd_slot: Arc<Mutex<Option<isize>>>,
        init_error: Arc<Mutex<Option<String>>>,
    ) -> Result<(), String> {
        let class_name = wide(CLASS_NAME);
        let hwnd = unsafe {
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wnd_proc),
                hInstance: Default::default(),
                lpszClassName: PCWSTR(class_name.as_ptr()),
                style: CS_HREDRAW | CS_VREDRAW,
                ..Default::default()
            };
            if RegisterClassW(&wc) == 0 {
                let err = GetLastError().0;
                if err != ERROR_CLASS_ALREADY_EXISTS {
                    running.store(false, Ordering::SeqCst);
                    let msg = format!("RegisterClassW 失败: {err}");
                    set_init_error(&init_error, &msg);
                    return Err(msg);
                }
            }

            let hwnd = CreateWindowExW(
                Default::default(),
                PCWSTR(class_name.as_ptr()),
                PCWSTR(wide("CSMatchHelperRawInputHidden").as_ptr()),
                WS_OVERLAPPED,
                0,
                0,
                0,
                0,
                None,
                None,
                None,
                None,
            )
            .map_err(|e| {
                running.store(false, Ordering::SeqCst);
                let msg = format!("CreateWindowExW 失败: {e}");
                set_init_error(&init_error, &msg);
                msg
            })?;

            *hwnd_slot.lock().unwrap() = Some(hwnd.0 as isize);

            let state = Box::new(LoopState { tx });
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(state) as isize);

            let devices = [
                RAWINPUTDEVICE {
                    usUsagePage: HID_USAGE_PAGE_GENERIC,
                    usUsage: HID_USAGE_GENERIC_KEYBOARD,
                    dwFlags: RIDEV_INPUTSINK,
                    hwndTarget: hwnd,
                },
                RAWINPUTDEVICE {
                    usUsagePage: HID_USAGE_PAGE_GENERIC,
                    usUsage: HID_USAGE_GENERIC_MOUSE,
                    dwFlags: RIDEV_INPUTSINK,
                    hwndTarget: hwnd,
                },
            ];
            RegisterRawInputDevices(&devices, std::mem::size_of::<RAWINPUTDEVICE>() as u32).map_err(
                |e| {
                    running.store(false, Ordering::SeqCst);
                    let msg = format!("RegisterRawInputDevices 失败: {e}");
                    set_init_error(&init_error, &msg);
                    msg
                },
            )?;

            ready.store(true, Ordering::SeqCst);

            let mut msg = MSG::default();
            while running.load(Ordering::SeqCst) {
                let ret = GetMessageW(&mut msg, None, 0, 0);
                if ret.0 == 0 || ret.0 == -1 {
                    break;
                }
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            unregister_raw_input_devices();

            let raw = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut LoopState;
            if !raw.is_null() {
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                drop(Box::from_raw(raw));
            }
            let _ = DestroyWindow(hwnd);
            *hwnd_slot.lock().unwrap() = None;
            hwnd
        };
        let _ = hwnd;
        Ok(())
    }

    fn unregister_raw_input_devices() {
        unsafe {
            let devices = [
                RAWINPUTDEVICE {
                    usUsagePage: HID_USAGE_PAGE_GENERIC,
                    usUsage: HID_USAGE_GENERIC_KEYBOARD,
                    dwFlags: RIDEV_REMOVE,
                    hwndTarget: HWND(std::ptr::null_mut()),
                },
                RAWINPUTDEVICE {
                    usUsagePage: HID_USAGE_PAGE_GENERIC,
                    usUsage: HID_USAGE_GENERIC_MOUSE,
                    dwFlags: RIDEV_REMOVE,
                    hwndTarget: HWND(std::ptr::null_mut()),
                },
            ];
            let _ = RegisterRawInputDevices(&devices, std::mem::size_of::<RAWINPUTDEVICE>() as u32);
        }
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_INPUT => {
                let state_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut LoopState;
                if !state_ptr.is_null() {
                    let state = &*state_ptr;
                    for event in parse_raw_input(lparam) {
                        let _ = state.tx.try_send(event);
                    }
                }
                LRESULT(0)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    unsafe fn parse_raw_input(lparam: LPARAM) -> Vec<InputEvent> {
        let hraw = HRAWINPUT(lparam.0 as _);
        let mut size = 0u32;
        let _ = GetRawInputData(
            hraw,
            RID_INPUT,
            None,
            &mut size,
            std::mem::size_of::<RAWINPUTHEADER>() as u32,
        );
        if size == 0 {
            return Vec::new();
        }

        let mut buf = vec![0u8; size as usize];
        let read = GetRawInputData(
            hraw,
            RID_INPUT,
            Some(buf.as_mut_ptr() as _),
            &mut size,
            std::mem::size_of::<RAWINPUTHEADER>() as u32,
        );
        if read == u32::MAX || read == 0 {
            return Vec::new();
        }

        let raw = &*(buf.as_ptr() as *const RAWINPUT);
        let time = qpc_secs();

        if raw.header.dwType == RIM_TYPEKEYBOARD.0 as u32 {
            let kb = raw.data.keyboard;
            let is_down = kb.Flags & 0x01 == 0;
            return vec![InputEvent {
                source: InputSource::Keyboard(kb.VKey as u16),
                is_down,
                time_secs: time,
            }];
        }

        if raw.header.dwType == RIM_TYPEMOUSE.0 as u32 {
            let mouse = raw.data.mouse;
            let flags = mouse.Anonymous.Anonymous.usButtonFlags;
            let mut events = Vec::new();
            push_mouse_event(&mut events, flags, RI_MOUSE_LEFT_BUTTON_DOWN, 0, true, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_LEFT_BUTTON_UP, 0, false, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_RIGHT_BUTTON_DOWN, 1, true, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_RIGHT_BUTTON_UP, 1, false, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_MIDDLE_BUTTON_DOWN, 2, true, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_MIDDLE_BUTTON_UP, 2, false, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_BUTTON_4_DOWN, 3, true, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_BUTTON_4_UP, 3, false, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_BUTTON_5_DOWN, 4, true, time);
            push_mouse_event(&mut events, flags, RI_MOUSE_BUTTON_5_UP, 4, false, time);
            return events;
        }

        Vec::new()
    }

    fn push_mouse_event(
        out: &mut Vec<InputEvent>,
        flags: u16,
        flag: u16,
        button: u8,
        is_down: bool,
        time: f64,
    ) {
        if flags & flag != 0 {
            out.push(InputEvent {
                source: InputSource::Mouse(button),
                is_down,
                time_secs: time,
            });
        }
    }

    #[derive(Debug, Clone, Copy)]
    pub struct ScreenRect {
        pub x: i32,
        pub y: i32,
        pub width: i32,
        pub height: i32,
    }

    pub fn resolve_hud_target_rect() -> ScreenRect {
        primary_monitor_rect().unwrap_or(ScreenRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        })
    }

    fn primary_monitor_rect() -> Option<ScreenRect> {
        unsafe {
            use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
            Some(ScreenRect {
                x: 0,
                y: 0,
                width: GetSystemMetrics(SM_CXSCREEN),
                height: GetSystemMetrics(SM_CYSCREEN),
            })
        }
    }

    #[allow(dead_code)]
    pub fn apply_click_through_styles(_hwnd: isize) {}
}

#[cfg(not(windows))]
mod platform {
    use crate::counter_strafing::types::InputEvent;
    use crossbeam_channel::{bounded, Receiver};

    pub fn qpc_secs() -> f64 {
        0.0
    }

    pub fn is_process_elevated() -> bool {
        false
    }

    pub fn format_input_listener_error(detail: Option<&str>) -> String {
        let detail = detail.unwrap_or("输入监听初始化超时");
        format!("按键监听启动失败：{detail}。急停采集仅支持 Windows。")
    }

    pub struct InputListener;

    impl InputListener {
        pub fn start() -> Result<Self, String> {
            Err(format_input_listener_error(Some("急停采集仅支持 Windows")))
        }

        pub fn receiver(&self) -> &Receiver<InputEvent> {
            unimplemented!()
        }

        pub fn stop(&mut self) {}
    }

    #[derive(Debug, Clone, Copy)]
    pub struct ScreenRect {
        pub x: i32,
        pub y: i32,
        pub width: i32,
        pub height: i32,
    }

    pub fn resolve_hud_target_rect() -> ScreenRect {
        ScreenRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        }
    }

    pub fn apply_click_through_styles(_hwnd: isize) {}
}

pub use platform::*;
