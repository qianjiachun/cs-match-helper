import { MOCK_RELEASE_NOTES } from '@core/update/mock-release-notes';
import type { UpdateCheckResult, UpdatePhase } from '@core/update/types';
import { computed, reactive, ref } from 'vue';
import {
  applyUpdateAndRestart,
  checkForUpdate,
  downloadUpdate,
  getAppVersion,
  onUpdateProgress,
} from '../native';

const state = reactive({
  currentVersion: '',
  hasUpdate: false,
  latestVersion: '',
  releaseNotes: '',
  releaseUrl: '',
  downloadUrl: '',
  publishedAt: '',
  checking: false,
  checked: false,
  error: '',
  phase: 'idle' as UpdatePhase,
  downloadedBytes: 0,
  totalBytes: 0,
  progressPercent: 0,
  downloadError: '',
  downloadedFilePath: '',
});

const dialogOpen = ref(false);
let progressUnlisten: (() => void) | null = null;
let autoDownloadStarted = false;

function applyResult(result: UpdateCheckResult) {
  state.currentVersion = result.currentVersion;
  state.hasUpdate = result.hasUpdate;
  state.latestVersion = result.latestVersion ?? '';
  state.releaseNotes = result.releaseNotes ?? '';
  state.releaseUrl = result.releaseUrl ?? '';
  state.downloadUrl = result.downloadUrl ?? '';
  state.publishedAt = result.publishedAt ?? '';
  state.checked = true;
  state.error = '';
  if (result.hasUpdate) {
    state.phase = 'ready';
  } else {
    state.phase = 'idle';
  }
}

async function ensureProgressListener() {
  if (progressUnlisten) return;
  progressUnlisten = await onUpdateProgress((event) => {
    state.downloadedBytes = event.downloadedBytes;
    if (event.totalBytes != null) {
      state.totalBytes = event.totalBytes;
    }
    if (event.percent != null) {
      state.progressPercent = Math.min(100, Math.max(0, event.percent));
    }
    if (event.phase === 'verifying') {
      state.phase = 'verifying';
    } else if (event.phase === 'complete') {
      state.progressPercent = 100;
    } else if (event.phase === 'downloading') {
      state.phase = 'downloading';
    }
  });
}

export function formatAppVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value < 10 && unitIndex > 0 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}

export function useUpdateCheck() {
  const formattedVersion = computed(() => formatAppVersion(state.currentVersion));

  const isBusy = computed(
    () =>
      state.phase === 'downloading' ||
      state.phase === 'verifying' ||
      state.phase === 'installing',
  );

  async function ensureVersion() {
    if (state.currentVersion) return;
    try {
      state.currentVersion = await getAppVersion();
    } catch {
      state.currentVersion = '0.0.0';
    }
  }

  async function startDownload() {
    if (!state.latestVersion || isBusy.value) return;
    if (state.phase === 'installing') return;

    state.downloadError = '';
    state.downloadedBytes = 0;
    state.totalBytes = 0;
    state.progressPercent = 0;
    state.phase = 'downloading';

    try {
      await ensureProgressListener();
      const result = await downloadUpdate(state.latestVersion);
      state.downloadedFilePath = result.filePath;
      state.phase = 'installing';
      state.progressPercent = 100;

      // 短暂展示「准备重启」后自动应用更新
      await new Promise((resolve) => setTimeout(resolve, 600));
      await applyUpdateAndRestart(result.filePath);
    } catch (error) {
      state.downloadError = error instanceof Error ? error.message : String(error);
      state.phase = 'failed';
    }
  }

  async function check() {
    if (state.checking) return;

    state.checking = true;
    state.phase = 'checking';
    try {
      const result = await checkForUpdate();
      applyResult(result);

      if (result.hasUpdate && !autoDownloadStarted) {
        autoDownloadStarted = true;
        dialogOpen.value = true;
        void startDownload();
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      state.checked = true;
      state.phase = 'idle';
      await ensureVersion();
    } finally {
      state.checking = false;
    }
  }

  function openDialog() {
    dialogOpen.value = true;
  }

  function closeDialog() {
    if (isBusy.value) return;
    dialogOpen.value = false;
  }

  function retryDownload() {
    void startDownload();
  }

  function bumpPatchVersion(version: string): string {
    const parts = version
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part.replace(/\D.*$/, ''), 10))
      .filter((part) => Number.isFinite(part));

    while (parts.length < 3) {
      parts.push(0);
    }

    parts[2] += 1;
    return parts.join('.');
  }

  async function simulateUpdate(releaseNotes: string = MOCK_RELEASE_NOTES) {
    await ensureVersion();
    const latestVersion = bumpPatchVersion(state.currentVersion);

    applyResult({
      currentVersion: state.currentVersion,
      hasUpdate: true,
      latestVersion,
      releaseNotes,
      releaseUrl: 'https://github.com/qianjiachun/cs-match-helper/releases/latest',
      downloadUrl:
        'https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download',
      publishedAt: new Date().toISOString(),
    });
    dialogOpen.value = true;
  }

  function clearUpdateHint() {
    state.hasUpdate = false;
    state.latestVersion = '';
    state.releaseNotes = '';
    state.releaseUrl = '';
    state.downloadUrl = '';
    state.publishedAt = '';
    state.error = '';
    state.downloadError = '';
    state.phase = 'idle';
    state.downloadedBytes = 0;
    state.totalBytes = 0;
    state.progressPercent = 0;
    state.downloadedFilePath = '';
    autoDownloadStarted = false;
    closeDialog();
  }

  return {
    state,
    dialogOpen,
    formattedVersion,
    isBusy,
    ensureVersion,
    check,
    openDialog,
    closeDialog,
    retryDownload,
    startDownload,
    simulateUpdate,
    clearUpdateHint,
  };
}
