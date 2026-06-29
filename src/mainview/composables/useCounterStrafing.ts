import { onMounted, onUnmounted, ref } from 'vue';
import {
  cancelBindingCapture,
  clearCounterStrafingAssessmentRecords,
  clearCounterStrafingRecords,
  getCounterStrafingAssessmentSnapshot,
  getCounterStrafingSnapshot,
  hideCounterStrafingAssessmentHud,
  hideCounterStrafingHud,
  loadCounterStrafingSettings,
  onCounterStrafingAssessmentRecord,
  onCounterStrafingAssessmentSnapshot,
  onCounterStrafingShot,
  onCounterStrafingSnapshot,
  onCounterStrafingStatus,
  resetKeyMap,
  resetCounterStrafingSettings,
  saveCounterStrafingSettings,
  showCounterStrafingAssessmentHud,
  showCounterStrafingHud,
  startBindingCapture,
  startCounterStrafing,
  stopCounterStrafing,
} from '@core/counter-strafing/native';
import {
  BINDING_ROLE_LABELS,
  DEFAULT_COUNTER_STRAFING_SETTINGS,
  MOVEMENT_MODEL_DEFAULTS,
  mergeCounterStrafingSettings,
  type BindingRole,
  type CounterStrafingAssessmentRecord,
  type CounterStrafingAssessmentSnapshot,
  type CounterStrafingSettings,
  type CounterStrafingSnapshot,
  type ShootingErrorRecord,
} from '@core/counter-strafing/types';
import type { UnlistenFn } from '@tauri-apps/api/event';

const BINDING_ROLES: BindingRole[] = ['forward', 'back', 'left', 'right', 'crouch', 'fire'];

const INPUT_LISTEN_ADMIN_HINT = '以管理员身份运行';

export function useCounterStrafing() {
  const snapshot = ref<CounterStrafingSnapshot>({
    active: false,
    listening: false,
    hudVisible: false,
    hudShowStableBars: true,
    shotRecords: [],
    avgError: 0,
    stableRate: 0,
    lastShot: null,
  });
  const assessmentSnapshot = ref<CounterStrafingAssessmentSnapshot>({
    active: false,
    listening: false,
    hudVisible: false,
    records: [],
    avgDiffMs: 0,
    successRate: 0,
    stdDevMs: 0,
    tendency: 'normal',
    tendencyLabel: '正常',
    lastRecord: null,
  });
  const settings = ref<CounterStrafingSettings>({ ...DEFAULT_COUNTER_STRAFING_SETTINGS });
  const lastShot = ref<ShootingErrorRecord | null>(null);
  const lastAssessmentRecord = ref<CounterStrafingAssessmentRecord | null>(null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  const inputListenNeedsAdmin = ref(false);

  let unlisteners: UnlistenFn[] = [];
  let settingsPersistTimer: ReturnType<typeof setTimeout> | null = null;

  async function refreshAssessment() {
    assessmentSnapshot.value = await getCounterStrafingAssessmentSnapshot();
    if (assessmentSnapshot.value.lastRecord) {
      lastAssessmentRecord.value = assessmentSnapshot.value.lastRecord;
    }
  }

  async function refresh() {
    snapshot.value = await getCounterStrafingSnapshot();
    if (snapshot.value.lastShot) {
      lastShot.value = snapshot.value.lastShot;
    }
  }

  async function loadSettings() {
    settings.value = mergeCounterStrafingSettings(await loadCounterStrafingSettings());
  }

  async function persistSettings() {
    snapshot.value = await saveCounterStrafingSettings(settings.value);
  }

  async function applySettings(
    patch: Partial<CounterStrafingSettings>,
    options?: { debounceMs?: number },
  ) {
    settings.value = { ...settings.value, ...patch };
    const debounceMs = options?.debounceMs ?? 0;
    if (debounceMs > 0) {
      if (settingsPersistTimer) {
        clearTimeout(settingsPersistTimer);
      }
      settingsPersistTimer = setTimeout(() => {
        settingsPersistTimer = null;
        void persistSettings();
      }, debounceMs);
      return;
    }
    if (settingsPersistTimer) {
      clearTimeout(settingsPersistTimer);
      settingsPersistTimer = null;
    }
    await persistSettings();
  }

  function patchNumberSetting<K extends keyof CounterStrafingSettings>(
    key: K,
    raw: string,
    debounceMs = 200,
  ) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    void applySettings({ [key]: value } as Partial<CounterStrafingSettings>, { debounceMs });
  }

  function setInputListenError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    error.value = msg;
    inputListenNeedsAdmin.value = msg.includes(INPUT_LISTEN_ADMIN_HINT);
  }

  function clearError() {
    error.value = null;
    inputListenNeedsAdmin.value = false;
  }

  async function restoreMovementModelDefaults() {
    await applySettings({ ...MOVEMENT_MODEL_DEFAULTS });
  }

  async function toggleListening() {
    busy.value = true;
    clearError();
    try {
      if (snapshot.value.listening) {
        snapshot.value = await stopCounterStrafing();
        await refreshAssessment();
      } else {
        snapshot.value = await startCounterStrafing();
        if (!snapshot.value.listening) {
          throw new Error('按键监听未成功启动，请重试');
        }
        await refreshAssessment();
        if (settings.value.hudVisible !== snapshot.value.hudVisible) {
          settings.value.hudVisible = snapshot.value.hudVisible;
        }
        if (settings.value.assessmentHudVisible !== assessmentSnapshot.value.hudVisible) {
          settings.value.assessmentHudVisible = assessmentSnapshot.value.hudVisible;
        }
      }
    } catch (e) {
      setInputListenError(e);
    } finally {
      busy.value = false;
    }
  }

  async function toggleAssessmentHud() {
    busy.value = true;
    error.value = null;
    try {
      if (assessmentSnapshot.value.hudVisible) {
        assessmentSnapshot.value = await hideCounterStrafingAssessmentHud();
        settings.value.assessmentHudVisible = false;
      } else {
        assessmentSnapshot.value = await showCounterStrafingAssessmentHud();
        settings.value.assessmentHudVisible = true;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }

  async function toggleHud() {
    busy.value = true;
    error.value = null;
    try {
      if (snapshot.value.hudVisible) {
        snapshot.value = await hideCounterStrafingHud();
        settings.value.hudVisible = false;
      } else {
        snapshot.value = await showCounterStrafingHud();
        settings.value.hudVisible = true;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }

  async function clearAssessmentRecords() {
    assessmentSnapshot.value = await clearCounterStrafingAssessmentRecords();
    lastAssessmentRecord.value = null;
  }

  async function clearRecords() {
    snapshot.value = await clearCounterStrafingRecords();
    lastShot.value = null;
  }

  async function clearAllRecords() {
    busy.value = true;
    error.value = null;
    try {
      assessmentSnapshot.value = await clearCounterStrafingAssessmentRecords();
      lastAssessmentRecord.value = null;
      snapshot.value = await clearCounterStrafingRecords();
      lastShot.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }

  async function beginCapture(role: BindingRole) {
    busy.value = true;
    clearError();
    try {
      if (snapshot.value.capturingBinding) {
        snapshot.value = await cancelBindingCapture();
      }
      snapshot.value = await startBindingCapture(role);
      settings.value = mergeCounterStrafingSettings(await loadCounterStrafingSettings());
    } catch (e) {
      setInputListenError(e);
    } finally {
      busy.value = false;
    }
  }

  async function cancelCapture() {
    snapshot.value = await cancelBindingCapture();
  }

  async function restoreAllDefaults() {
    busy.value = true;
    error.value = null;
    try {
      snapshot.value = await resetCounterStrafingSettings();
      settings.value = mergeCounterStrafingSettings(await loadCounterStrafingSettings());
      await refreshAssessment();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }

  async function restoreDefaultKeyMap() {
    busy.value = true;
    error.value = null;
    try {
      snapshot.value = await resetKeyMap();
      settings.value = mergeCounterStrafingSettings(await loadCounterStrafingSettings());
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }

  onMounted(async () => {
    try {
      await loadSettings();
      await refresh();
      await refreshAssessment();
      unlisteners = await Promise.all([
        onCounterStrafingShot((record) => {
          lastShot.value = record;
        }),
        onCounterStrafingSnapshot((next) => {
          snapshot.value = next;
        }),
        onCounterStrafingStatus((next) => {
          snapshot.value = next;
        }),
        onCounterStrafingAssessmentRecord((record) => {
          lastAssessmentRecord.value = record;
        }),
        onCounterStrafingAssessmentSnapshot((next) => {
          assessmentSnapshot.value = next;
        }),
      ]);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  });

  onUnmounted(() => {
    if (settingsPersistTimer) {
      clearTimeout(settingsPersistTimer);
      settingsPersistTimer = null;
    }
    void Promise.all(unlisteners.map((fn) => fn()));
    if (snapshot.value.capturingBinding) {
      void cancelBindingCapture();
    }
  });

  return {
    snapshot,
    assessmentSnapshot,
    settings,
    lastShot,
    lastAssessmentRecord,
    busy,
    error,
    inputListenNeedsAdmin,
    bindingRoles: BINDING_ROLES,
    bindingRoleLabels: BINDING_ROLE_LABELS,
    refresh,
    refreshAssessment,
    loadSettings,
    applySettings,
    patchNumberSetting,
    restoreMovementModelDefaults,
    restoreAllDefaults,
    toggleListening,
    toggleHud,
    toggleAssessmentHud,
    clearRecords,
    clearAssessmentRecords,
    clearAllRecords,
    beginCapture,
    cancelCapture,
    restoreDefaultKeyMap,
  };
}
