import { MOCK_RELEASE_NOTES } from '@core/update/mock-release-notes';
import type { UpdateCheckResult } from '@core/update/types';
import { computed, reactive, ref } from 'vue';
import { checkForUpdate, getAppVersion } from '../native';

const state = reactive({
  currentVersion: '',
  hasUpdate: false,
  latestVersion: '',
  releaseNotes: '',
  releaseUrl: '',
  publishedAt: '',
  checking: false,
  checked: false,
  error: '',
});

const dialogOpen = ref(false);

function applyResult(result: UpdateCheckResult) {
  state.currentVersion = result.currentVersion;
  state.hasUpdate = result.hasUpdate;
  state.latestVersion = result.latestVersion ?? '';
  state.releaseNotes = result.releaseNotes ?? '';
  state.releaseUrl = result.releaseUrl ?? '';
  state.publishedAt = result.publishedAt ?? '';
  state.checked = true;
  state.error = '';
}

export function formatAppVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

export function useUpdateCheck() {
  const formattedVersion = computed(() => formatAppVersion(state.currentVersion));

  async function ensureVersion() {
    if (state.currentVersion) return;
    try {
      state.currentVersion = await getAppVersion();
    } catch {
      state.currentVersion = '0.0.0';
    }
  }

  async function check() {
    if (state.checking) return;

    state.checking = true;
    try {
      const result = await checkForUpdate();
      applyResult(result);
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      state.checked = true;
      await ensureVersion();
    } finally {
      state.checking = false;
    }
  }

  function openDialog() {
    dialogOpen.value = true;
  }

  function closeDialog() {
    dialogOpen.value = false;
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
      publishedAt: new Date().toISOString(),
    });
  }

  function clearUpdateHint() {
    state.hasUpdate = false;
    state.latestVersion = '';
    state.releaseNotes = '';
    state.releaseUrl = '';
    state.publishedAt = '';
    state.error = '';
    closeDialog();
  }

  return {
    state,
    dialogOpen,
    formattedVersion,
    ensureVersion,
    check,
    openDialog,
    closeDialog,
    simulateUpdate,
    clearUpdateHint,
  };
}
