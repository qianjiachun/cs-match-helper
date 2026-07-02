import { ref } from 'vue';

export type ToastVariant = 'success' | 'warning' | 'error';

const toastMessage = ref('');
const toastVisible = ref(false);
const toastVariant = ref<ToastVariant>('success');

let hideTimer: ReturnType<typeof setTimeout> | null = null;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function showToast(message: string, variant: ToastVariant = 'success') {
  toastMessage.value = message;
  toastVariant.value = variant;
  toastVisible.value = true;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toastVisible.value = false;
  }, 2000);
}

export { showToast };

export function useCopyFeedback() {
  async function copyText(
    text: string,
    options?: string | { successMessage?: string; showToast?: boolean },
  ): Promise<boolean> {
    const opts =
      typeof options === 'string'
        ? { successMessage: options, showToast: true }
        : { showToast: true, ...options };

    const ok = await copyToClipboard(text);
    if (opts.showToast !== false) {
      showToast(
        ok ? (opts.successMessage ?? '已复制') : '复制失败，请重试',
        ok ? 'success' : 'error',
      );
    }
    return ok;
  }

  async function copySteamId(steamId: string, nickname?: string) {
    const label = nickname ? `${nickname} 的 Steam ID` : 'Steam ID';
    return copyText(steamId, `已复制 ${label}`);
  }

  return {
    toastMessage,
    toastVisible,
    toastVariant,
    copyText,
    copySteamId,
  };
}
