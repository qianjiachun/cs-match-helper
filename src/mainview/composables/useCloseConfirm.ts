import { onMounted, onUnmounted, ref } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { closeApp } from '../native';

export function useCloseConfirm() {
  const open = ref(false);
  let unlisten: UnlistenFn | null = null;
  let closeAfterLeave = false;

  onMounted(async () => {
    unlisten = await listen('app-close-requested', () => {
      open.value = true;
    });
  });

  onUnmounted(() => {
    void unlisten?.();
  });

  function cancelClose() {
    closeAfterLeave = false;
    open.value = false;
  }

  function confirmClose() {
    closeAfterLeave = true;
    open.value = false;
  }

  async function onCloseDialogAfterLeave() {
    if (!closeAfterLeave) return;
    closeAfterLeave = false;
    await closeApp();
  }

  return {
    closeConfirmOpen: open,
    cancelClose,
    confirmClose,
    onCloseDialogAfterLeave,
  };
}
