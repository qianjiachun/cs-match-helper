import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useCounterStrafingDisplayMode } from './useCounterStrafingDisplayMode';
import { counterStrafingListening } from './useCounterStrafingListening';
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
  relaunchAsAdmin,
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
import { showToast } from './useCopyFeedback';

const BINDING_ROLES: BindingRole[] = ['forward', 'back', 'left', 'right', 'crouch', 'fire'];

const INPUT_LISTEN_ADMIN_HINT = '以管理员身份运行';

const HUD_INIT_RETRY_HINT = '正在初始化';

function createRafCoalescer<T>(apply: (value: T) => void) {
  let pending: T | null = null;
  let rafId: number | null = null;

  const schedule = (value: T) => {
    pending = value;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (pending !== null) {
        apply(pending);
        pending = null;
      }
    });
  };

  const flush = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (pending !== null) {
      apply(pending);
      pending = null;
    }
  };

  return { schedule, flush };
}

function trimHistory<T>(records: T[], limit: number): T[] {
  if (records.length <= limit) return records;
  return records.slice(records.length - limit);
}

async function withHudInitRetry<T>(action: () => Promise<T>, attempts = 10): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(HUD_INIT_RETRY_HINT) || attempt === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError;
}

export function useCounterStrafing() {
  const { displayMode } = useCounterStrafingDisplayMode();
  const snapshot = ref<CounterStrafingSnapshot>({
    active: false,
    listening: false,
    hudVisible: false,
    hudShowStableBars: true,
    hudShowTapMarkers: true,
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
  const relaunchBusy = ref(false);
  const error = ref<string | null>(null);
  const inputListenNeedsAdmin = ref(false);

  let unlisteners: UnlistenFn[] = [];
  let settingsPersistTimer: ReturnType<typeof setTimeout> | null = null;
  let flushSnapshotRaf: (() => void) | null = null;
  let flushAssessmentSnapshotRaf: (() => void) | null = null;

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

  function patchStatisticsHistoryLimit(raw: string, debounceMs = 200) {
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value)) return;
    void applySettings({ historyLimit: value, assessmentHistoryLimit: value }, { debounceMs });
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
      } else {
        const showHud = displayMode.value === 'hud';
        snapshot.value = await startCounterStrafing(showHud);
        if (!snapshot.value.listening) {
          throw new Error('按键监听未成功启动，请重试');
        }
        if (showHud) {
          if (settings.value.hudVisible !== snapshot.value.hudVisible) {
            settings.value.hudVisible = snapshot.value.hudVisible;
          }
          if (settings.value.assessmentHudVisible !== snapshot.value.assessmentHudVisible) {
            settings.value.assessmentHudVisible = snapshot.value.assessmentHudVisible;
          }
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
        assessmentSnapshot.value = await withHudInitRetry(() => showCounterStrafingAssessmentHud());
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
        snapshot.value = await withHudInitRetry(() => showCounterStrafingHud());
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
      showToast('已恢复默认设置');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }

  async function restartAsAdmin() {
    relaunchBusy.value = true;
    try {
      await relaunchAsAdmin();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      relaunchBusy.value = false;
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

  watch(
    () => snapshot.value.listening,
    (listening) => {
      counterStrafingListening.value = listening;
    },
    { immediate: true },
  );

  onMounted(async () => {
    try {
      await loadSettings();
      await refresh();
      await refreshAssessment();

      const snapshotRaf = createRafCoalescer<CounterStrafingSnapshot>((next) => {
        snapshot.value = next;
      });
      const assessmentSnapshotRaf = createRafCoalescer<CounterStrafingAssessmentSnapshot>((next) => {
        assessmentSnapshot.value = next;
      });
      flushSnapshotRaf = snapshotRaf.flush;
      flushAssessmentSnapshotRaf = assessmentSnapshotRaf.flush;

      unlisteners = await Promise.all([
        onCounterStrafingShot((record) => {
          lastShot.value = record;
          const records = trimHistory(
            [...snapshot.value.shotRecords, record],
            settings.value.historyLimit,
          );
          snapshot.value = {
            ...snapshot.value,
            shotRecords: records,
            lastShot: record,
          };
        }),
        onCounterStrafingSnapshot((next) => {
          snapshotRaf.schedule(next);
        }),
        onCounterStrafingStatus((next) => {
          snapshotRaf.schedule(next);
        }),
        onCounterStrafingAssessmentRecord((record) => {
          lastAssessmentRecord.value = record;
          const records = trimHistory(
            [...assessmentSnapshot.value.records, record],
            settings.value.assessmentHistoryLimit,
          );
          assessmentSnapshot.value = {
            ...assessmentSnapshot.value,
            records,
            lastRecord: record,
          };
        }),
        onCounterStrafingAssessmentSnapshot((next) => {
          assessmentSnapshotRaf.schedule(next);
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
    flushSnapshotRaf?.();
    flushAssessmentSnapshotRaf?.();
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
    relaunchBusy,
    error,
    inputListenNeedsAdmin,
    bindingRoles: BINDING_ROLES,
    bindingRoleLabels: BINDING_ROLE_LABELS,
    refresh,
    refreshAssessment,
    loadSettings,
    applySettings,
    patchNumberSetting,
    patchStatisticsHistoryLimit,
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
    restartAsAdmin,
  };
}
