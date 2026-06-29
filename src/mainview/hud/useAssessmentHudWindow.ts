import { onMounted, onUnmounted } from 'vue';
import { saveCounterStrafingAssessmentHudBounds } from '@core/counter-strafing/native';
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
    void readBounds().then((bounds) => saveCounterStrafingAssessmentHudBounds(bounds));
  }, 180);
}

export function useAssessmentHudWindow() {
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
