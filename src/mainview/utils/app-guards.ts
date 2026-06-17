import { getCurrentWindow } from '@tauri-apps/api/window';
import { debugEnabled } from '../composables/useDebugUnlock';
import { openAppDevtools } from './devtools';

function isDevtoolsShortcut(event: KeyboardEvent): boolean {
  const { key, ctrlKey, shiftKey, metaKey, altKey } = event;
  if (key === 'F12') return true;
  if (shiftKey && ctrlKey && (key === 'I' || key === 'J' || key === 'C')) return true;
  if (metaKey && altKey && key.toLowerCase() === 'i') return true;
  return false;
}

async function openDevtools(): Promise<void> {
  try {
    await openAppDevtools();
  } catch {
    try {
      await getCurrentWindow().openDevtools();
    } catch {
      // 非 Tauri 环境或当前构建未启用 devtools API
    }
  }
}

export { openDevtools };

const SELECTABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], .selectable';

function isSelectableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(SELECTABLE_SELECTOR));
}

/** 非调试模式下禁止右键与开发者工具快捷键；全局禁止拖选文本（表单与 .selectable 除外） */
export function installAppGuards(): void {
  document.addEventListener(
    'selectstart',
    (event) => {
      if (!isSelectableTarget(event.target)) {
        event.preventDefault();
      }
    },
    { capture: true },
  );

  document.addEventListener(
    'contextmenu',
    (event) => {
      if (!debugEnabled.value) {
        event.preventDefault();
      }
    },
    { capture: true },
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (!isDevtoolsShortcut(event)) return;

      if (!debugEnabled.value) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      void openDevtools();
    },
    { capture: true },
  );
}
