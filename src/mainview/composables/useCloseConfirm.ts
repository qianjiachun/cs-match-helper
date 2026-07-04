import { onMounted, onUnmounted, ref } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { closeApp } from '../native';

export function useCloseConfirm() {
  const open = ref(false);
  let unlisten: UnlistenFn | null = null;

  onMounted(async () => {
    unlisten = await listen('app-close-requested', () => {
      open.value = true;
    });
  });

  onUnmounted(() => {
    void unlisten?.();
  });

  function cancelClose() {
    open.value = false;
  }

  async function confirmClose() {
    open.value = false;
    await closeApp();
  }

  return {
    closeConfirmOpen: open,
    cancelClose,
    confirmClose,
  };
}
