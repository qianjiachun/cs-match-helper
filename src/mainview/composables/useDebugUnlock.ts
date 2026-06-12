import { computed, ref } from 'vue';

const UNLOCK_CLICKS = 10;

export const debugEnabled = ref(false);
const aboutClickCount = ref(0);

export function useDebugUnlock() {
  const remainingClicks = computed(() =>
    Math.max(0, UNLOCK_CLICKS - aboutClickCount.value),
  );

  function registerAboutClick() {
    if (debugEnabled.value) return;

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
