import { ref } from 'vue';

const toastMessage = ref('');
const toastVisible = ref(false);

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

function showToast(message: string) {
  toastMessage.value = message;
  toastVisible.value = true;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toastVisible.value = false;
  }, 2000);
}

export function useCopyFeedback() {
  async function copyText(text: string, successMessage = '已复制') {
    const ok = await copyToClipboard(text);
    showToast(ok ? successMessage : '复制失败，请重试');
  }

  async function copySteamId(steamId: string, nickname?: string) {
    const label = nickname ? `${nickname} 的 Steam ID` : 'Steam ID';
    await copyText(steamId, `已复制 ${label}`);
  }

  return {
    toastMessage,
    toastVisible,
    copyText,
    copySteamId,
  };
}
