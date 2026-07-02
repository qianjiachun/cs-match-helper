import { ref, watch } from 'vue';

export type CounterStrafingDisplayMode = 'hud' | 'widget';

const STORAGE_KEY = 'csmh-counter-strafing-display-mode';

function readStoredMode(): CounterStrafingDisplayMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'hud' || raw === 'widget') return raw;
  } catch {
    // ignore
  }
  return 'widget';
}

const displayMode = ref<CounterStrafingDisplayMode>(readStoredMode());

watch(displayMode, (mode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
});

export function useCounterStrafingDisplayMode() {
  function setDisplayMode(mode: CounterStrafingDisplayMode) {
    displayMode.value = mode;
  }

  return { displayMode, setDisplayMode };
}
