use std::sync::atomic::{AtomicBool, Ordering};

static APP_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

pub fn begin_app_shutdown() -> bool {
    !APP_SHUTTING_DOWN.swap(true, Ordering::SeqCst)
}

pub fn is_app_shutting_down() -> bool {
    APP_SHUTTING_DOWN.load(Ordering::Relaxed)
}
