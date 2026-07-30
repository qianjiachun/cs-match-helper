import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { localize as l, localizeErrorMessage } from '../i18n';
import { useCounterStrafingDisplayMode } from './useCounterStrafingDisplayMode';
import {
  counterStrafingListening,
  counterStrafingSessionBusy,
  onCounterStrafingSessionSnapshot,
  toggleCounterStrafingListening,
} from './useCounterStrafingSession';
import {
  cancelBindingCapture,
  clearCounterStrafingAssessmentRecords,
  clearCounterStrafingRecords,
  getCounterStrafingAssessmentSnapshot,
  getCounterStrafingSnapshot,
  getCounterStrafingGsiStatus,
  hideCounterStrafingAssessmentHud,
  hideCounterStrafingHud,
  loadCounterStrafingSettings,
  onCounterStrafingAssessmentRecord,
  onCounterStrafingAssessmentSnapshot,
  onCounterStrafingShot,
  onCounterStrafingSnapshot,
  onCounterStrafingStatus,
  onCounterStrafingGsiStatus,
  installOrRepairCounterStrafingGsi,
  relaunchAsAdmin,
  resetKeyMap,
  resetCounterStrafingSettings,
  removeCounterStrafingGsiConfig,
  saveCounterStrafingSettings,
  showCounterStrafingAssessmentHud,
  showCounterStrafingHud,
  startBindingCapture,
} from '@core/counter-strafing/native';
import {
  appendAssessmentRecord,
  appendShotRecord,
  mergeCounterStrafingAssessmentSnapshot,
  mergeCounterStrafingSnapshot,
} from '@core/counter-strafing/mergeCounterStrafingSnapshot';
import {
  DEFAULT_COUNTER_STRAFING_SETTINGS,
  DEFAULT_GSI_STATUS,
  MOVEMENT_MODEL_DEFAULTS,
  mergeCounterStrafingSettings,
  type BindingRole,
  type CounterStrafingAssessmentRecord,
  type CounterStrafingAssessmentSnapshot,
  type CounterStrafingSettings,
  type CounterStrafingSnapshot,
  type GsiStatus,
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

  const discard = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pending = null;
  };

  return { schedule, flush, discard };
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
    hudStatTextScale: 1,
    hudLineStrokeWidth: 1.5,
    hudAssessmentChartOpacity: 1,
    hudShootingChartOpacity: 1,
    hudContentMode: 'all',
    shotRecords: [],
    avgError: 0,
    stableRate: 0,
    lastShot: null,
    gsiStatus: { ...DEFAULT_GSI_STATUS, ignored: { ...DEFAULT_GSI_STATUS.ignored } },
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
    tendencyLabel: '',
    lastRecord: null,
  });
  const settings = ref<CounterStrafingSettings>({ ...DEFAULT_COUNTER_STRAFING_SETTINGS });
  const gsiStatus = ref<GsiStatus>({
    ...DEFAULT_GSI_STATUS,
    ignored: { ...DEFAULT_GSI_STATUS.ignored },
  });
  const lastShot = ref<ShootingErrorRecord | null>(null);
  const lastAssessmentRecord = ref<CounterStrafingAssessmentRecord | null>(null);
  const opBusy = ref(false);
  const busy = computed(() => opBusy.value || counterStrafingSessionBusy.value);
  const relaunchBusy = ref(false);
  const error = ref<string | null>(null);
  const inputListenNeedsAdmin = ref(false);
  const bindingRoleLabels = computed<Record<BindingRole, string>>(() => ({
    forward: l('前进', 'Forward'),
    back: l('后退', 'Back'),
    left: l('左移', 'Left'),
    right: l('右移', 'Right'),
    crouch: l('蹲', 'Crouch'),
    fire: l('开火', 'Fire'),
  }));

  let unlisteners: UnlistenFn[] = [];
  let unsubscribeSessionSnapshot: (() => void) | null = null;
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
    gsiStatus.value = snapshot.value.gsiStatus ?? await getCounterStrafingGsiStatus();
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
    gsiStatus.value = snapshot.value.gsiStatus;
  }

  async function setGsiEnhancementEnabled(enabled: boolean) {
    opBusy.value = true;
    error.value = null;
    try {
      await applySettings({ gsiEnhancementEnabled: enabled });
      if (!enabled) {
        gsiStatus.value = await removeCounterStrafingGsiConfig();
      }
    } catch (e) {
      error.value = localizeErrorMessage(e);
    } finally {
      opBusy.value = false;
    }
  }

  async function repairGsiConfig(cs2Path?: string) {
    opBusy.value = true;
    error.value = null;
    try {
      gsiStatus.value = await installOrRepairCounterStrafingGsi(cs2Path);
      snapshot.value = { ...snapshot.value, gsiStatus: gsiStatus.value };
      showToast(l('GSI 配置已写入，请重启 CS2', 'GSI configured. Restart CS2 to apply it.'));
    } catch (e) {
      error.value = localizeErrorMessage(e);
      try {
        gsiStatus.value = await getCounterStrafingGsiStatus();
        snapshot.value = { ...snapshot.value, gsiStatus: gsiStatus.value };
      } catch {
        // Keep the original configuration error visible.
      }
    } finally {
      opBusy.value = false;
    }
  }

  async function chooseGsiDirectory() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: l('选择 CS2 安装目录', 'Select the CS2 installation folder'),
      });
      if (typeof selected === 'string') {
        await repairGsiConfig(selected);
      }
    } catch (e) {
      error.value = localizeErrorMessage(e);
    }
  }

  async function openGsiConfigLocation() {
    const path = gsiStatus.value.configPath?.trim();
    if (!path) {
      await chooseGsiDirectory();
      return;
    }
    try {
      await revealItemInDir(path);
    } catch (e) {
      error.value = localizeErrorMessage(e);
    }
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

  function applyListeningSnapshot(next: CounterStrafingSnapshot) {
    snapshot.value = next;
    if (displayMode.value !== 'hud') return;
    if (settings.value.hudVisible !== next.hudVisible) {
      settings.value.hudVisible = next.hudVisible;
    }
    if (
      next.assessmentHudVisible !== undefined &&
      settings.value.assessmentHudVisible !== next.assessmentHudVisible
    ) {
      settings.value.assessmentHudVisible = next.assessmentHudVisible;
    }
  }

  async function toggleListening() {
    clearError();
    const result = await toggleCounterStrafingListening({ toastOnError: false });
    if (!result.ok) {
      setInputListenError(new Error(result.error));
      return;
    }
    applyListeningSnapshot(result.snapshot);
  }

  async function toggleAssessmentHud() {
    opBusy.value = true;
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
      error.value = localizeErrorMessage(e);
    } finally {
      opBusy.value = false;
    }
  }

  async function toggleHud() {
    opBusy.value = true;
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
      error.value = localizeErrorMessage(e);
    } finally {
      opBusy.value = false;
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
    opBusy.value = true;
    error.value = null;
    try {
      assessmentSnapshot.value = await clearCounterStrafingAssessmentRecords();
      lastAssessmentRecord.value = null;
      snapshot.value = await clearCounterStrafingRecords();
      lastShot.value = null;
    } catch (e) {
      error.value = localizeErrorMessage(e);
    } finally {
      opBusy.value = false;
    }
  }

  async function beginCapture(role: BindingRole) {
    opBusy.value = true;
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
      opBusy.value = false;
    }
  }

  async function cancelCapture() {
    snapshot.value = await cancelBindingCapture();
  }

  async function restoreAllDefaults() {
    opBusy.value = true;
    error.value = null;
    try {
      snapshot.value = await resetCounterStrafingSettings();
      settings.value = mergeCounterStrafingSettings(await loadCounterStrafingSettings());
      await refreshAssessment();
      showToast(l('已恢复默认设置', 'Defaults restored'));
    } catch (e) {
      error.value = localizeErrorMessage(e);
    } finally {
      opBusy.value = false;
    }
  }

  async function restartAsAdmin() {
    relaunchBusy.value = true;
    try {
      await relaunchAsAdmin();
    } catch (e) {
      error.value = localizeErrorMessage(e);
      relaunchBusy.value = false;
    }
  }

  async function restoreDefaultKeyMap() {
    opBusy.value = true;
    error.value = null;
    try {
      snapshot.value = await resetKeyMap();
      settings.value = mergeCounterStrafingSettings(await loadCounterStrafingSettings());
    } catch (e) {
      error.value = localizeErrorMessage(e);
    } finally {
      opBusy.value = false;
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

      unsubscribeSessionSnapshot = onCounterStrafingSessionSnapshot((next) => {
        applyListeningSnapshot(next);
      });

      const snapshotRaf = createRafCoalescer<CounterStrafingSnapshot>((next) => {
        snapshot.value = mergeCounterStrafingSnapshot(snapshot.value, next);
        gsiStatus.value = snapshot.value.gsiStatus;
      });
      const assessmentSnapshotRaf = createRafCoalescer<CounterStrafingAssessmentSnapshot>((next) => {
        assessmentSnapshot.value = mergeCounterStrafingAssessmentSnapshot(
          assessmentSnapshot.value,
          next,
        );
      });
      flushSnapshotRaf = snapshotRaf.flush;
      flushAssessmentSnapshotRaf = assessmentSnapshotRaf.flush;

      unlisteners = await Promise.all([
        onCounterStrafingShot((record) => {
          snapshotRaf.discard();
          lastShot.value = record;
          snapshot.value = {
            ...snapshot.value,
            shotRecords: appendShotRecord(
              snapshot.value.shotRecords,
              record,
              settings.value.historyLimit,
            ),
            lastShot: record,
          };
        }),
        onCounterStrafingSnapshot((next) => {
          snapshotRaf.schedule(next);
        }),
        onCounterStrafingStatus((next) => {
          snapshotRaf.schedule(next);
        }),
        onCounterStrafingGsiStatus((next) => {
          gsiStatus.value = next;
          snapshot.value = { ...snapshot.value, gsiStatus: next };
        }),
        onCounterStrafingAssessmentRecord((record) => {
          assessmentSnapshotRaf.discard();
          lastAssessmentRecord.value = record;
          assessmentSnapshot.value = {
            ...assessmentSnapshot.value,
            records: appendAssessmentRecord(
              assessmentSnapshot.value.records,
              record,
              settings.value.assessmentHistoryLimit,
            ),
            lastRecord: record,
          };
        }),
        onCounterStrafingAssessmentSnapshot((next) => {
          assessmentSnapshotRaf.schedule(next);
        }),
      ]);
    } catch (e) {
      error.value = localizeErrorMessage(e);
    }
  });

  onUnmounted(() => {
    if (settingsPersistTimer) {
      clearTimeout(settingsPersistTimer);
      settingsPersistTimer = null;
    }
    unsubscribeSessionSnapshot?.();
    unsubscribeSessionSnapshot = null;
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
    gsiStatus,
    lastShot,
    lastAssessmentRecord,
    busy,
    relaunchBusy,
    error,
    inputListenNeedsAdmin,
    bindingRoles: BINDING_ROLES,
    bindingRoleLabels,
    refresh,
    refreshAssessment,
    loadSettings,
    applySettings,
    setGsiEnhancementEnabled,
    repairGsiConfig,
    chooseGsiDirectory,
    openGsiConfigLocation,
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
