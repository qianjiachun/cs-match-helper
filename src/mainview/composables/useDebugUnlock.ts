import { computed, ref } from 'vue';

const UNLOCK_CLICKS = 10;

/** 开发环境默认开启调试；正式包需通过关于页点击解锁 */
export const debugEnabled = ref(import.meta.env.DEV);
const aboutClickCount = ref(0);

export function useDebugUnlock() {
  const remainingClicks = computed(() =>
    Math.max(0, UNLOCK_CLICKS - aboutClickCount.value),
  );

  function registerAboutClick() {
    if (import.meta.env.DEV || debugEnabled.value) return;

    aboutClickCount.value += 1;
    if (aboutClickCount.value >= UNLOCK_CLICKS) {
      debugEnabled.value = true;
    }
  }

  return {
    debugEnabled,
    aboutClickCount,
    remainingClicks,
    registerAboutClick,
  };
}
