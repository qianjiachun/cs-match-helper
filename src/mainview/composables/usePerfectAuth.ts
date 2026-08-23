import type { PerfectAuthStatus } from '@platforms/perfect/auth';
import { computed, onUnmounted, ref } from 'vue';
import {
  cancelPerfectLogin,
  clearPerfectAuth,
  getPerfectAuthStatus,
  onPerfectAuthState,
  startPerfectQrLogin,
  startPerfectSteamLogin,
} from '../native';

const VALIDATION_INTERVAL_MS = 30 * 60 * 1000;
export const QR_REFRESH_COOLDOWN_MS = 60 * 1000;
const LIVE_QR_PHASES = ['requesting', 'waiting_scan', 'scanned', 'confirming'] as const;

function emptyStatus(): PerfectAuthStatus {
  return { phase: 'idle' };
}

function isLiveQrPhase(phase: PerfectAuthStatus['phase']) {
  return (LIVE_QR_PHASES as readonly string[]).includes(phase);
}

export function usePerfectAuth() {
  const status = ref<PerfectAuthStatus>(emptyStatus());
  const initialized = ref(false);
  const lastValidationAt = ref<number | null>(null);
  const lastQrStartedAt = ref<number | null>(null);
  let unlisten: (() => void) | null = null;
  let validationTimer: number | null = null;
  let validationInFlight: Promise<PerfectAuthStatus> | null = null;

  const authenticated = computed(() => status.value.phase === 'authenticated');
  const busy = computed(() =>
    ['requesting', 'waiting_scan', 'scanned', 'confirming', 'validating'].includes(status.value.phase),
  );

  function update(next: PerfectAuthStatus) {
    status.value = next;
    if (next.phase === 'authenticated') {
      lastValidationAt.value = Date.now();
      startValidationTimer();
    } else {
      stopValidationTimer();
    }
  }

  async function ensureListener() {
    if (unlisten) return;
    unlisten = await onPerfectAuthState(update);
    initialized.value = true;
  }

  function validationIsFresh(maxAgeMs: number, now = Date.now()) {
    return status.value.phase === 'authenticated'
      && lastValidationAt.value != null
      && now - lastValidationAt.value < maxAgeMs;
  }

  async function validate() {
    if (validationInFlight) return validationInFlight;
    validationInFlight = (async () => {
      await ensureListener();
      update(await getPerfectAuthStatus());
      return status.value;
    })();
    try {
      return await validationInFlight;
    } finally {
      validationInFlight = null;
    }
  }

  async function validateIfStale(maxAgeMs: number) {
    if (validationIsFresh(maxAgeMs)) return status.value;
    return validate();
  }

  function qrCooldownRemainingMs(now = Date.now()) {
    if (lastQrStartedAt.value == null) return 0;
    return Math.max(0, lastQrStartedAt.value + QR_REFRESH_COOLDOWN_MS - now);
  }

  function hasLiveQrSession() {
    return status.value.method === 'qr' && isLiveQrPhase(status.value.phase);
  }

  async function startQr() {
    await ensureListener();
    if (qrCooldownRemainingMs() > 0) return status.value;
    lastQrStartedAt.value = Date.now();
    update(await startPerfectQrLogin());
  }

  async function startSteam() {
    await ensureListener();
    update(await startPerfectSteamLogin());
  }

  async function cancel() {
    update(await cancelPerfectLogin());
  }

  async function clear() {
    update(await clearPerfectAuth());
    lastValidationAt.value = null;
  }

  function startValidationTimer() {
    stopValidationTimer();
    validationTimer = window.setInterval(() => {
      void validate().catch(() => {
        // Backend classifies transient network failures and keeps the last valid credential.
      });
    }, VALIDATION_INTERVAL_MS);
  }

  function stopValidationTimer() {
    if (validationTimer != null) {
      window.clearInterval(validationTimer);
      validationTimer = null;
    }
  }

  onUnmounted(() => {
    stopValidationTimer();
    unlisten?.();
  });

  return {
    status,
    initialized,
    lastValidationAt,
    lastQrStartedAt,
    authenticated,
    busy,
    ensureListener,
    validate,
    validateIfStale,
    validationIsFresh,
    qrCooldownRemainingMs,
    hasLiveQrSession,
    startQr,
    startSteam,
    cancel,
    clear,
    stopValidationTimer,
  };
}

export type PerfectAuthApi = ReturnType<typeof usePerfectAuth>;
