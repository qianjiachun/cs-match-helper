import { onMounted, onUnmounted, ref } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { closeApp } from '../native';

export function createCloseConfirmController(close = closeApp) {
  const open = ref(false);
  let closeAfterLeave = false;
  let closeRequestLocked = false;
  let unlockTimer: ReturnType<typeof setTimeout> | null = null;

  function handleCloseRequested() {
    if (closeRequestLocked || closeAfterLeave) return;
    closeRequestLocked = true;
    open.value = true;
  }

  function dispose() {
    if (unlockTimer) clearTimeout(unlockTimer);
    unlockTimer = null;
  }

  function cancelClose() {
    closeAfterLeave = false;
    open.value = false;
    if (unlockTimer) clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => {
      closeRequestLocked = false;
      unlockTimer = null;
    }, 350);
  }

  function confirmClose() {
    closeAfterLeave = true;
    open.value = false;
  }

  async function onCloseDialogAfterLeave() {
    if (!closeAfterLeave) return;
    closeAfterLeave = false;
    await close();
  }

  return {
    open,
    handleCloseRequested,
    cancelClose,
    confirmClose,
    onCloseDialogAfterLeave,
    dispose,
  };
}

export function useCloseConfirm() {
  const controller = createCloseConfirmController();
  let unlisten: UnlistenFn | null = null;
  let disposed = false;

  onMounted(() => {
    void listen('app-close-requested', controller.handleCloseRequested).then((stopListening) => {
      if (disposed) {
        stopListening();
        return;
      }
      unlisten = stopListening;
    });
  });

  onUnmounted(() => {
    disposed = true;
    void unlisten?.();
    controller.dispose();
  });

  return {
    closeConfirmOpen: controller.open,
    cancelClose: controller.cancelClose,
    confirmClose: controller.confirmClose,
    onCloseDialogAfterLeave: controller.onCloseDialogAfterLeave,
  };
}
