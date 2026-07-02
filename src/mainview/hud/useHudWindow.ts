import { onMounted, onUnmounted } from 'vue';
import { saveHudBounds } from '@core/counter-strafing/native';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';

let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function readBounds() {
  const win = getCurrentWindow();
  const [position, size] = await Promise.all([win.outerPosition(), win.innerSize()]);
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };
}

function schedulePersistBounds() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void readBounds().then((bounds) => saveHudBounds(bounds));
  }, 180);
}

/** 仅左键拖动；避免 Windows 上 drag-region 右键弹出系统菜单 */
export async function onHudDragPointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  try {
    await getCurrentWindow().startDragging();
  } catch {
    // 权限或平台不支持时忽略
  }
}

/** 监听 HUD 拖动/缩放结束，持久化位置与尺寸（后端也会监听窗口事件作为兜底） */
export function useHudWindow() {
  let unlisteners: UnlistenFn[] = [];

  onMounted(() => {
    const win = getCurrentWindow();
    void (async () => {
      try {
        unlisteners = await Promise.all([
          win.onMoved(() => schedulePersistBounds()),
          win.onResized(() => schedulePersistBounds()),
        ]);
      } catch {
        // 权限或平台不支持时，仍依赖 mouseup 与后端 WindowEvent
      }
    })();
    window.addEventListener('mouseup', schedulePersistBounds);
  });

  onUnmounted(() => {
    window.removeEventListener('mouseup', schedulePersistBounds);
    void Promise.all(unlisteners.map((fn) => fn()));
    if (persistTimer) clearTimeout(persistTimer);
  });
}
