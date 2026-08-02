import { onMounted, onUnmounted, ref } from 'vue';
import { onCounterStrafingHudLocate } from '@core/counter-strafing/native';
import type { UnlistenFn } from '@tauri-apps/api/event';

const HUD_LOCATE_DURATION_MS = 2_800;

export function useHudLocateHighlight() {
  const isLocating = ref(false);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let unlisten: UnlistenFn | null = null;
  let disposed = false;

  function reveal() {
    isLocating.value = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      isLocating.value = false;
      hideTimer = null;
    }, HUD_LOCATE_DURATION_MS);
  }

  onMounted(() => {
    reveal();
    void onCounterStrafingHudLocate(reveal).then((stopListening) => {
      if (disposed) {
        stopListening();
        return;
      }
      unlisten = stopListening;
    });
  });

  onUnmounted(() => {
    disposed = true;
    if (hideTimer) clearTimeout(hideTimer);
    unlisten?.();
  });

  return { isLocating };
}
