import { setActivePlatformId } from '@platforms/registry';
import type { PlatformId } from '@platforms/types';
import { ref } from 'vue';

export type AppPhase = 'select-platform' | 'p5e-launch' | 'main';

export function useAppSession() {
  const phase = ref<AppPhase>('select-platform');
  const selectedPlatform = ref<PlatformId | null>(null);

  function selectPlatform(id: PlatformId) {
    setActivePlatformId(id);
    selectedPlatform.value = id;
    phase.value = id === '5e' ? 'p5e-launch' : 'main';
  }

  function completeP5eSetup() {
    phase.value = 'main';
  }

  function resetToP5eLaunch() {
    setActivePlatformId('5e');
    selectedPlatform.value = '5e';
    phase.value = 'p5e-launch';
  }

  function resetToPlatformSelect() {
    selectedPlatform.value = null;
    phase.value = 'select-platform';
  }

  return {
    phase,
    selectedPlatform,
    selectPlatform,
    completeP5eSetup,
    resetToP5eLaunch,
    resetToPlatformSelect,
  };
}
