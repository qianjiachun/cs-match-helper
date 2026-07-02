import {
  checkGameBarWidgetUpdate,
  getGameBarWidgetStatus,
  installGameBarWidgetFromLocal,
  installOrUpdateGameBarWidget,
  onGameBarWidgetProgress,
  uninstallGameBarWidget,
} from '@core/gamebar-widget/native';
import type {
  GameBarWidgetDownloadSource,
  GameBarWidgetPhase,
  GameBarWidgetProgressEvent,
  GameBarWidgetStatus,
  GameBarWidgetUpdateCheck,
} from '@core/gamebar-widget/types';
import { MOCK_GAMEBAR_WIDGET_UPDATE_CHECK } from '@core/gamebar-widget/mock-update-check';
import { formatWidgetProgressMessage } from '@core/gamebar-widget/types';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { computed, onUnmounted, ref } from 'vue';

let sessionUpdateCheckStarted = false;

export function useGameBarWidget(options?: { autoInit?: boolean }) {
  const autoInit = options?.autoInit ?? true;
  const status = ref<GameBarWidgetStatus | null>(null);
  const updateCheck = ref<GameBarWidgetUpdateCheck | null>(null);
  const phase = ref<GameBarWidgetPhase>('idle');
  const progress = ref<GameBarWidgetProgressEvent | null>(null);
  const busy = ref(false);
  const statusRefreshing = ref(false);
  const checkingUpdate = ref(false);
  const error = ref<string | null>(null);
  const lastMessage = ref<string | null>(null);
  const installLogPath = ref<string | null>(null);
  const installLogExcerpt = ref<string | null>(null);

  let unlistenProgress: (() => void) | null = null;
  let progressListenerPromise: Promise<void> | null = null;

  async function ensureProgressListener() {
    if (unlistenProgress) return;
    if (!progressListenerPromise) {
      progressListenerPromise = onGameBarWidgetProgress((event) => {
        progress.value = event;
        if (
          event.phase === 'downloading' ||
          event.phase === 'verifying' ||
          event.phase === 'extracting' ||
          event.phase === 'installing' ||
          event.phase === 'complete'
        ) {
          phase.value = event.phase as GameBarWidgetPhase;
        }
      }).then((unlisten) => {
        unlistenProgress = unlisten;
      });
    }
    await progressListenerPromise;
  }

  async function refreshStatus() {
    statusRefreshing.value = true;
    try {
      status.value = await getGameBarWidgetStatus();
    } finally {
      statusRefreshing.value = false;
    }
  }

  async function checkUpdate(options?: { silent?: boolean }) {
    if (checkingUpdate.value) return;
    const silent = options?.silent ?? false;
    checkingUpdate.value = true;
    if (!silent) {
      phase.value = 'checking';
    }
    try {
      updateCheck.value = await checkGameBarWidgetUpdate();
      if (!silent) {
        phase.value = 'idle';
      }
      status.value = await getGameBarWidgetStatus();
    } catch (err) {
      updateCheck.value = {
        installedVersion: status.value?.installedVersion ?? null,
        latestVersion: null,
        hasUpdate: false,
        downloadUrl: null,
        cdnDownloadUrl: null,
        githubDownloadUrl: null,
        sha256: null,
        zipFileName: null,
        error: err instanceof Error ? err.message : String(err),
      };
      if (!silent) {
        phase.value = 'idle';
      }
    } finally {
      checkingUpdate.value = false;
    }
  }

  function ensureSessionUpdateCheck() {
    if (sessionUpdateCheckStarted) return;
    sessionUpdateCheckStarted = true;
    void checkUpdate({ silent: true });
  }

  function applyInstallResult(result: {
    success: boolean;
    message: string;
    installLogPath?: string | null;
    installLogExcerpt?: string | null;
  }): boolean {
    lastMessage.value = result.message;
    installLogPath.value = result.installLogPath ?? null;
    installLogExcerpt.value = result.installLogExcerpt ?? null;
    phase.value = result.success ? 'complete' : 'error';
    if (!result.success) {
      error.value = result.message;
    }
    return result.success;
  }

  async function installOrUpdate(
    sourceOrUrl?: GameBarWidgetDownloadSource | string | null,
  ): Promise<boolean> {
    await ensureProgressListener();
    busy.value = true;
    error.value = null;
    lastMessage.value = null;
    installLogPath.value = null;
    installLogExcerpt.value = null;
    phase.value = 'downloading';
    try {
      const downloadUrl = resolveDownloadUrl(sourceOrUrl);
      const result = await installOrUpdateGameBarWidget(downloadUrl);
      const success = applyInstallResult(result);
      await refreshStatus();
      if (!sessionUpdateCheckStarted) {
        sessionUpdateCheckStarted = true;
      }
      updateCheck.value = await checkGameBarWidgetUpdate();
      return success;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      phase.value = 'error';
      return false;
    } finally {
      busy.value = false;
    }
  }

  function resolveDownloadUrl(
    sourceOrUrl?: GameBarWidgetDownloadSource | string | null,
  ): string | null {
    if (!sourceOrUrl) return null;
    if (sourceOrUrl === 'cdn' || sourceOrUrl === 'github') {
      return getDownloadUrlForSource(sourceOrUrl);
    }
    return sourceOrUrl;
  }

  function getDownloadUrlForSource(source: GameBarWidgetDownloadSource): string | null {
    const check = updateCheck.value;
    if (!check) return null;
    if (source === 'cdn') {
      return check.cdnDownloadUrl ?? check.downloadUrl;
    }
    return check.githubDownloadUrl;
  }

  async function installFromLocal(sourcePath: string): Promise<boolean> {
    await ensureProgressListener();
    busy.value = true;
    error.value = null;
    lastMessage.value = null;
    installLogPath.value = null;
    installLogExcerpt.value = null;
    phase.value = 'extracting';
    try {
      const result = await installGameBarWidgetFromLocal(sourcePath);
      const success = applyInstallResult(result);
      await refreshStatus();
      return success;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      phase.value = 'error';
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function uninstall() {
    busy.value = true;
    error.value = null;
    try {
      await uninstallGameBarWidget();
      await refreshStatus();
      lastMessage.value = '已卸载 Widget';
      phase.value = 'idle';
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      phase.value = 'error';
    } finally {
      busy.value = false;
    }
  }

  function copyDiagnostics(): Promise<void> {
    const lines = [
      'CS 匹配助手 小组件诊断',
      `gameBarInstalled: ${status.value?.gameBarInstalled ?? 'unknown'}`,
      `installed: ${status.value?.installed ?? 'unknown'}`,
      `installedVersion: ${status.value?.installedVersion ?? '-'}`,
      `loopbackConfigured: ${status.value?.loopbackConfigured ?? 'unknown'}`,
      `latestVersion: ${updateCheck.value?.latestVersion ?? '-'}`,
      `cdnDownloadUrl: ${updateCheck.value?.cdnDownloadUrl ?? '-'}`,
      `githubDownloadUrl: ${updateCheck.value?.githubDownloadUrl ?? '-'}`,
      `downloadUrl: ${updateCheck.value?.downloadUrl ?? '-'}`,
      `hasUpdate: ${updateCheck.value?.hasUpdate ?? '-'}`,
      `phase: ${phase.value}`,
      `error: ${error.value ?? '-'}`,
      `progress: ${progress.value ? formatWidgetProgressMessage(progress.value) : '-'}`,
      `installLogPath: ${installLogPath.value ?? '-'}`,
      `installLogExcerpt: ${installLogExcerpt.value ?? '-'}`,
    ];
    return navigator.clipboard.writeText(lines.join('\n'));
  }

  async function pickAndInstallFromLocal(): Promise<boolean> {
    const selected = await openFileDialog({
      directory: false,
      multiple: false,
      filters: [{ name: '小组件安装包', extensions: ['zip'] }],
      title: '选择小组件 zip 安装包',
    });
    if (typeof selected !== 'string') return false;
    if (!selected.toLowerCase().endsWith('.zip')) {
      error.value = '请选择 .zip 格式的安装包';
      phase.value = 'error';
      return false;
    }
    return installFromLocal(selected);
  }

  async function pickAndInstallFromLocalFolder(): Promise<boolean> {
    const selected = await openFileDialog({
      directory: true,
      multiple: false,
      title: '选择已解压的小组件文件夹（内含 install.ps1）',
    });
    if (typeof selected !== 'string') return false;
    return installFromLocal(selected);
  }

  async function copyDownloadUrl(
    source: GameBarWidgetDownloadSource = 'cdn',
  ): Promise<boolean> {
    let url = getDownloadUrlForSource(source);
    if (!url) {
      await checkUpdate();
      url = getDownloadUrlForSource(source);
    }
    if (!url) return false;
    await navigator.clipboard.writeText(url);
    return true;
  }

  if (autoInit) {
    void refreshStatus();
    ensureSessionUpdateCheck();
  }

  onUnmounted(() => {
    unlistenProgress?.();
  });

  return {
    status,
    updateCheck,
    phase,
    progress,
    busy,
    statusRefreshing,
    checkingUpdate,
    error,
    lastMessage,
    installLogPath,
    installLogExcerpt,
    refreshStatus,
    checkUpdate,
    ensureSessionUpdateCheck,
    installOrUpdate,
    installFromLocal,
    pickAndInstallFromLocal,
    pickAndInstallFromLocalFolder,
    uninstall,
    copyDiagnostics,
    copyDownloadUrl,
    getDownloadUrlForSource,
    formatWidgetProgressMessage,
  };
}

export function useDebugGameBarWidget() {
  const widgetZipPath = ref('');
  const actionError = ref('');
  const useRealInstall = ref(false);
  const simulationOutcome = ref<'success' | 'download-fail' | 'install-fail'>('success');
  let simulateRunId = 0;

  const baseWidget = useGameBarWidget({ autoInit: false });

  function resolveInstallSource(
    sourceOrUrl?: GameBarWidgetDownloadSource | string | null,
  ): GameBarWidgetDownloadSource {
    if (sourceOrUrl === 'cdn' || sourceOrUrl === 'github') return sourceOrUrl;
    return 'cdn';
  }

  async function installOrUpdate(
    sourceOrUrl?: GameBarWidgetDownloadSource | string | null,
  ): Promise<boolean> {
    if (useRealInstall.value) {
      return baseWidget.installOrUpdate(sourceOrUrl);
    }
    const source = resolveInstallSource(sourceOrUrl);
    const outcome = simulationOutcome.value;
    await simulateOnlineInstall(source, outcome);
    simulationOutcome.value = 'success';
    return outcome === 'success';
  }

  const widget: ReturnType<typeof useGameBarWidget> = {
    ...baseWidget,
    installOrUpdate,
  };

  function cancelSimulation() {
    simulateRunId += 1;
  }

  function sleep(ms: number, runId: number) {
    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        if (runId === simulateRunId) resolve();
      }, ms);
    });
  }

  async function fetchRealDownloadUrls() {
    actionError.value = '';
    await baseWidget.checkUpdate();
    if (baseWidget.updateCheck.value?.error) {
      actionError.value = baseWidget.updateCheck.value.error;
    }
  }

  function applyMockDownloadUrls() {
    actionError.value = '';
    baseWidget.updateCheck.value = MOCK_GAMEBAR_WIDGET_UPDATE_CHECK;
  }

  async function simulateOnlineInstall(
    source: GameBarWidgetDownloadSource,
    outcome: 'success' | 'download-fail' | 'install-fail' = 'success',
  ) {
    cancelSimulation();
    const runId = simulateRunId;
    actionError.value = '';

    if (!baseWidget.updateCheck.value) {
      applyMockDownloadUrls();
    }

    const label = source === 'cdn' ? '国内 CDN' : 'GitHub 发布页';
    const url =
      baseWidget.getDownloadUrlForSource(source) ??
      (source === 'cdn'
        ? MOCK_GAMEBAR_WIDGET_UPDATE_CHECK.cdnDownloadUrl
        : MOCK_GAMEBAR_WIDGET_UPDATE_CHECK.githubDownloadUrl);

    baseWidget.busy.value = true;
    baseWidget.error.value = null;
    baseWidget.lastMessage.value = null;
    baseWidget.installLogPath.value = null;
    baseWidget.installLogExcerpt.value = null;

    const setProgress = (event: GameBarWidgetProgressEvent, nextPhase: GameBarWidgetPhase) => {
      if (runId !== simulateRunId) return false;
      baseWidget.phase.value = nextPhase;
      baseWidget.progress.value = event;
      return true;
    };

    const totalBytes = 8_500_000;
    if (
      !setProgress(
        {
          phase: 'downloading',
          downloadedBytes: 0,
          totalBytes,
          percent: 0,
          message: `【模拟】正在从 ${label} 下载…\n${url ?? '-'}`,
        },
        'downloading',
      )
    ) {
      return;
    }

    for (const pct of [15, 38, 62, 86, 100]) {
      await sleep(280, runId);
      if (runId !== simulateRunId) return;
      if (outcome === 'download-fail' && pct === 38) {
        baseWidget.progress.value = null;
        baseWidget.error.value = '【模拟】下载 Widget 失败: HTTP 503 Service Unavailable';
        baseWidget.phase.value = 'error';
        baseWidget.busy.value = false;
        return;
      }
      baseWidget.progress.value = {
        phase: 'downloading',
        downloadedBytes: Math.floor((totalBytes * pct) / 100),
        totalBytes,
        percent: pct,
        message: `【模拟】正在从 ${label} 下载… ${pct}%`,
      };
    }

    await sleep(400, runId);
    if (runId !== simulateRunId) return;
    if (
      !setProgress(
        {
          phase: 'verifying',
          downloadedBytes: totalBytes,
          totalBytes,
          percent: 100,
          message: '【模拟】正在校验安装包…',
        },
        'verifying',
      )
    ) {
      return;
    }

    await sleep(500, runId);
    if (runId !== simulateRunId) return;
    if (
      !setProgress(
        {
          phase: 'extracting',
          downloadedBytes: totalBytes,
          totalBytes,
          percent: 100,
          message: '【模拟】正在解压安装包…',
        },
        'extracting',
      )
    ) {
      return;
    }

    await sleep(500, runId);
    if (runId !== simulateRunId) return;
    baseWidget.phase.value = 'installing';
    for (let sec = 1; sec <= 3; sec += 1) {
      baseWidget.progress.value = {
        phase: 'installing',
        downloadedBytes: 0,
        totalBytes: null,
        percent: null,
        message: `【模拟】正在安装小组件，请勿关闭 PowerShell 窗口（已等待 0 分 ${sec} 秒）。若出现错误提示也请耐心等待。`,
      };
      await sleep(1000, runId);
      if (runId !== simulateRunId) return;
      if (outcome === 'install-fail' && sec === 2) {
        baseWidget.progress.value = null;
        baseWidget.error.value = '【模拟】安装失败（退出码 1）\n请在 UAC 中点「是」，并勿关闭弹出的 PowerShell 窗口。';
        baseWidget.installLogPath.value = '%LOCALAPPDATA%\\CSMatchHelper\\gamebar-widget\\install.log';
        baseWidget.installLogExcerpt.value =
          '【模拟日志】正在请求管理员权限…\nAdd-AppxPackage : 部署失败，HRESULT 0x80073D02';
        baseWidget.phase.value = 'error';
        baseWidget.busy.value = false;
        return;
      }
    }

    if (runId !== simulateRunId) return;
    baseWidget.lastMessage.value = `【模拟】已通过 ${label} 完成下载并安装`;
    baseWidget.progress.value = {
      phase: 'complete',
      downloadedBytes: totalBytes,
      totalBytes,
      percent: 100,
      message: baseWidget.lastMessage.value,
    };
    baseWidget.phase.value = 'complete';
    baseWidget.busy.value = false;
  }

  async function pickWidgetZip() {
    actionError.value = '';
    const selected = await openFileDialog({
      directory: false,
      multiple: false,
      filters: [{ name: 'Widget Zip', extensions: ['zip'] }],
      title: '选择 CSMatchHelperGameBarWidget zip',
    });
    if (typeof selected === 'string') {
      widgetZipPath.value = selected;
    }
  }

  async function installSelectedZip() {
    actionError.value = '';
    const path = widgetZipPath.value.trim();
    if (!path) {
      actionError.value = '请先选择 Widget zip 文件';
      return;
    }
    if (!path.toLowerCase().endsWith('.zip')) {
      actionError.value = '仅支持 .zip 安装包';
      return;
    }
    await baseWidget.installFromLocal(path);
  }

  async function uninstallWidget() {
    actionError.value = '';
    try {
      await baseWidget.uninstall();
    } catch (err) {
      actionError.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function init() {
    await baseWidget.refreshStatus();
    applyMockDownloadUrls();
  }

  function presetSimulationOutcome(outcome: 'success' | 'download-fail' | 'install-fail') {
    simulationOutcome.value = outcome;
    useRealInstall.value = false;
  }

  onUnmounted(() => {
    cancelSimulation();
  });

  return {
    widget,
    widgetZipPath,
    actionError,
    useRealInstall,
    simulationOutcome,
    pickWidgetZip,
    installSelectedZip,
    uninstallWidget,
    refreshStatus: baseWidget.refreshStatus,
    copyDiagnostics: baseWidget.copyDiagnostics,
    fetchRealDownloadUrls,
    applyMockDownloadUrls,
    presetSimulationOutcome,
    cancelSimulation,
    init,
  };
}
