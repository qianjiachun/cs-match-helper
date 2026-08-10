import {
  checkGameBarWidgetUpdate,
  getGameBarWidgetConnectionStatus,
  getGameBarWidgetStatus,
  installGameBarWidgetFromLocal,
  installOrUpdateGameBarWidget,
  onGameBarWidgetProgress,
  onGameBarWidgetConnectionStatus,
  openSmartAppControlSettings,
  repairGameBarWidgetConnection,
  uninstallGameBarWidget,
  verifyGameBarWidgetRuntime,
} from '@core/gamebar-widget/native';
import type {
  GameBarWidgetDownloadSource,
  GameBarWidgetConnectionStatus,
  GameBarWidgetPhase,
  GameBarWidgetProgressEvent,
  GameBarWidgetStatus,
  GameBarWidgetUpdateCheck,
} from '@core/gamebar-widget/types';
import { MOCK_GAMEBAR_WIDGET_UPDATE_CHECK } from '@core/gamebar-widget/mock-update-check';
import { formatWidgetProgressMessage } from '@core/gamebar-widget/types';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { computed, onUnmounted, ref } from 'vue';
import { currentLocale, localize as l, localizeErrorMessage } from '../i18n';

let sessionUpdateCheckStarted = false;

export function useGameBarWidget(options?: { autoInit?: boolean }) {
  const autoInit = options?.autoInit ?? true;
  const status = ref<GameBarWidgetStatus | null>(null);
  const updateCheck = ref<GameBarWidgetUpdateCheck | null>(null);
  const phase = ref<GameBarWidgetPhase>('idle');
  const progress = ref<GameBarWidgetProgressEvent | null>(null);
  const busy = ref(false);
  const statusRefreshing = ref(false);
  const statusLoaded = ref(false);
  const checkingUpdate = ref(false);
  const error = ref<string | null>(null);
  const lastMessage = ref<string | null>(null);
  const installLogPath = ref<string | null>(null);
  const installLogExcerpt = ref<string | null>(null);
  const installIssueCode = ref<string | null>(null);
  const installRequiredAction = ref<string | null>(null);
  const installRetryable = ref(true);
  const installBlockingPackages = ref<string[]>([]);
  const runtimeVerifying = ref(false);
  const connectionStatus = ref<GameBarWidgetConnectionStatus | null>(null);
  const connectionRepairing = ref(false);

  let unlistenProgress: (() => void) | null = null;
  let progressListenerPromise: Promise<void> | null = null;
  let unlistenConnectionStatus: (() => void) | null = null;
  let connectionListenerPromise: Promise<void> | null = null;
  let statusRefreshPromise: Promise<void> | null = null;
  let updateCheckRequestId = 0;

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

  async function ensureConnectionListener() {
    if (unlistenConnectionStatus) return;
    if (!connectionListenerPromise) {
      connectionListenerPromise = onGameBarWidgetConnectionStatus((next) => {
        connectionStatus.value = next;
        if (
          next.state === 'connected' &&
          ['loopbackRepairFailed', 'uacCancelled', 'ipcPortsUnavailable', 'ipcServerStartFailed'].includes(
            installIssueCode.value ?? '',
          )
        ) {
          installIssueCode.value = null;
          installRequiredAction.value = null;
          error.value = null;
          if (phase.value === 'error') phase.value = 'idle';
        }
        if (next.state === 'connected' && status.value?.loopbackState !== 'configured') {
          void refreshStatus().catch(() => undefined);
        }
      }).then((unlisten) => {
        unlistenConnectionStatus = unlisten;
      });
    }
    await connectionListenerPromise;
  }

  function refreshStatus(): Promise<void> {
    if (statusRefreshPromise) return statusRefreshPromise;
    statusRefreshing.value = true;
    statusRefreshPromise = (async () => {
      try {
        status.value = await getGameBarWidgetStatus();
      } finally {
        statusRefreshing.value = false;
        statusLoaded.value = true;
        statusRefreshPromise = null;
      }
    })();
    return statusRefreshPromise;
  }

  async function refreshConnectionStatus() {
    await ensureConnectionListener();
    connectionStatus.value = await getGameBarWidgetConnectionStatus();
  }

  async function refreshStatusUntilSettled() {
    const delays = [0, 250, 500, 1000, 2000];
    for (const delay of delays) {
      if (delay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
      await refreshStatus();
      if (!status.value?.installed || status.value.loopbackState === 'configured') return;
    }
  }

  async function refreshUpdateCheckValue() {
    const requestId = ++updateCheckRequestId;
    let next: GameBarWidgetUpdateCheck;
    try {
      next = await checkGameBarWidgetUpdate();
    } catch (err) {
      next = {
        installedVersion: status.value?.installedVersion ?? null,
        latestVersion: null,
        hasUpdate: false,
        downloadUrl: null,
        cdnDownloadUrl: null,
        githubDownloadUrl: null,
        sha256: null,
        zipFileName: null,
        error: localizeErrorMessage(err),
      };
    }
    if (requestId === updateCheckRequestId) {
      updateCheck.value = next;
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
      await refreshUpdateCheckValue();
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
    issueCode?: string | null;
    requiredAction?: string | null;
    retryable?: boolean;
    blockingPackages?: string[];
  }): boolean {
    lastMessage.value = localizeErrorMessage(result.message);
    installLogPath.value = result.installLogPath ?? null;
    installLogExcerpt.value = result.installLogExcerpt ?? null;
    installIssueCode.value = result.issueCode ?? null;
    installRequiredAction.value = result.requiredAction ?? null;
    installRetryable.value = result.retryable ?? true;
    installBlockingPackages.value = result.blockingPackages ?? [];
    phase.value = result.success ? 'complete' : 'error';
    if (!result.success) {
      error.value = localizeErrorMessage(result.message);
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
    installIssueCode.value = null;
    installRequiredAction.value = null;
    installBlockingPackages.value = [];
    phase.value = 'downloading';
    try {
      const downloadUrl = resolveDownloadUrl(sourceOrUrl);
      const result = await installOrUpdateGameBarWidget(downloadUrl, currentLocale());
      const success = applyInstallResult(result);
      if (success) await refreshStatusUntilSettled();
      else await refreshStatus();
      if (!sessionUpdateCheckStarted) {
        sessionUpdateCheckStarted = true;
      }
      await refreshUpdateCheckValue();
      return success;
    } catch (err) {
      error.value = localizeErrorMessage(err);
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
    installIssueCode.value = null;
    installRequiredAction.value = null;
    installBlockingPackages.value = [];
    phase.value = 'extracting';
    try {
      const result = await installGameBarWidgetFromLocal(sourcePath, currentLocale());
      const success = applyInstallResult(result);
      if (success) await refreshStatusUntilSettled();
      else await refreshStatus();
      await refreshUpdateCheckValue();
      return success;
    } catch (err) {
      error.value = localizeErrorMessage(err);
      phase.value = 'error';
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function uninstall(): Promise<boolean> {
    busy.value = true;
    error.value = null;
    progress.value = null;
    lastMessage.value = null;
    phase.value = 'uninstalling';
    try {
      await uninstallGameBarWidget();
      await refreshStatus();
      lastMessage.value = l('已卸载 Widget', 'Widget uninstalled');
      installIssueCode.value = null;
      installRequiredAction.value = null;
      installBlockingPackages.value = [];
      phase.value = 'idle';
      return true;
    } catch (err) {
      error.value = localizeErrorMessage(err);
      phase.value = 'error';
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function openSmartAppControl() {
    try {
      await openSmartAppControlSettings();
    } catch (err) {
      error.value = localizeErrorMessage(err);
    }
  }

  async function repairConnection(): Promise<boolean> {
    if (connectionRepairing.value) return false;
    connectionRepairing.value = true;
    error.value = null;
    installIssueCode.value = null;
    installRequiredAction.value = null;
    try {
      const result = await repairGameBarWidgetConnection();
      lastMessage.value = localizeErrorMessage(result.message);
      installIssueCode.value = result.issueCode;
      installRequiredAction.value = result.requiredAction;
      installRetryable.value = result.retryable;
      if (!result.success && result.issueCode !== 'uacCancelled') {
        error.value = localizeErrorMessage(result.error ?? result.message);
        phase.value = 'error';
      } else if (result.success) {
        phase.value = 'complete';
      }
      await refreshStatusUntilSettled();
      return result.success;
    } catch (err) {
      error.value = localizeErrorMessage(err);
      installIssueCode.value = 'loopbackRepairFailed';
      installRequiredAction.value = 'retryOrReinstall';
      phase.value = 'error';
      return false;
    } finally {
      connectionRepairing.value = false;
    }
  }

  async function verifyRuntime(): Promise<boolean> {
    runtimeVerifying.value = true;
    error.value = null;
    try {
      const result = await verifyGameBarWidgetRuntime();
      lastMessage.value = localizeErrorMessage(result.message);
      installIssueCode.value = result.issueCode;
      installRequiredAction.value = result.requiredAction;
      installRetryable.value = result.retryable;
      if (!result.success) error.value = localizeErrorMessage(result.message);
      await refreshStatus();
      return result.success;
    } catch (err) {
      error.value = localizeErrorMessage(err);
      return false;
    } finally {
      runtimeVerifying.value = false;
    }
  }

  function copyDiagnostics(): Promise<void> {
    const lines = [
      l('CS 匹配助手小组件诊断', 'CS Match Helper Widget diagnostics'),
      `gameBarInstalled: ${status.value?.gameBarInstalled ?? 'unknown'}`,
      `gameBarOpenShortcut: ${status.value?.gameBarOpenShortcut ?? '-'}`,
      `gameBarOpenShortcutFromRegistry: ${status.value?.gameBarOpenShortcutFromRegistry ?? 'unknown'}`,
      `installed: ${status.value?.installed ?? 'unknown'}`,
      `installedVersion: ${status.value?.installedVersion ?? '-'}`,
      `loopbackConfigured: ${status.value?.loopbackConfigured ?? 'unknown'}`,
      `loopbackState: ${status.value?.loopbackState ?? 'unknown'}`,
      `loopbackError: ${status.value?.loopbackError ?? '-'}`,
      `ipcState: ${connectionStatus.value?.state ?? 'unknown'}`,
      `ipcPort: ${connectionStatus.value?.port ?? '-'}`,
      `ipcRetryAttempt: ${connectionStatus.value?.retryAttempt ?? '-'}`,
      `ipcIssueCode: ${connectionStatus.value?.issueCode ?? '-'}`,
      `ipcLastError: ${connectionStatus.value?.lastError ?? '-'}`,
      `ipcLastConnectedAt: ${connectionStatus.value?.lastConnectedAt ?? '-'}`,
      `ipcOccupiedPorts: ${connectionStatus.value?.occupiedPorts.join(', ') || '-'}`,
      `ipcBlockingProcesses: ${connectionStatus.value?.blockingProcesses.join(', ') || '-'}`,
      `ipcDiscoveryWarning: ${connectionStatus.value?.discoveryWarning ?? '-'}`,
      `publisher: ${status.value?.trust.publisher ?? '-'}`,
      `signatureThumbprint: ${status.value?.trust.signatureThumbprint ?? '-'}`,
      `signatureKind: ${status.value?.trust.signatureKind ?? '-'}`,
      `trustedPeople: ${status.value?.trust.trustedPeople ?? 'unknown'}`,
      `msixStatus: ${status.value?.trust.msixStatus ?? '-'}`,
      `catalogStatus: ${status.value?.trust.catalogStatus ?? '-'}`,
      `smartAppControl: ${status.value?.trust.smartAppControlState ?? 'unknown'}`,
      `wdac: ${status.value?.trust.wdacState ?? 'unknown'}`,
      `runtimeState: ${status.value?.trust.runtimeState ?? 'unknown'}`,
      `runtimeVerified: ${status.value?.trust.runtimeVerified ?? 'unknown'}`,
      `codeIntegrityEvent: ${status.value?.trust.recentCodeIntegrityEvent ? JSON.stringify(status.value.trust.recentCodeIntegrityEvent) : '-'}`,
      `latestVersion: ${updateCheck.value?.latestVersion ?? '-'}`,
      `cdnDownloadUrl: ${updateCheck.value?.cdnDownloadUrl ?? '-'}`,
      `githubDownloadUrl: ${updateCheck.value?.githubDownloadUrl ?? '-'}`,
      `downloadUrl: ${updateCheck.value?.downloadUrl ?? '-'}`,
      `hasUpdate: ${updateCheck.value?.hasUpdate ?? '-'}`,
      `updateCheckError: ${updateCheck.value?.error ?? '-'}`,
      `phase: ${phase.value}`,
      `error: ${error.value ?? '-'}`,
      `progress: ${progress.value ? formatWidgetProgressMessage(progress.value, currentLocale()) : '-'}`,
      `installLogPath: ${installLogPath.value ?? '-'}`,
      `installLogExcerpt: ${installLogExcerpt.value ?? '-'}`,
      `issueCode: ${installIssueCode.value ?? '-'}`,
      `requiredAction: ${installRequiredAction.value ?? '-'}`,
      `retryable: ${installRetryable.value}`,
      `blockingPackages: ${installBlockingPackages.value.length ? installBlockingPackages.value.join(', ') : '-'}`,
    ];
    return navigator.clipboard.writeText(lines.join('\n'));
  }

  async function pickAndInstallFromLocal(): Promise<boolean> {
    const selected = await openFileDialog({
      directory: false,
      multiple: false,
      filters: [{ name: l('小组件安装包', 'Widget package'), extensions: ['zip'] }],
      title: l('选择小组件 zip 安装包', 'Select Widget zip package'),
    });
    if (typeof selected !== 'string') return false;
    if (!selected.toLowerCase().endsWith('.zip')) {
      error.value = l('请选择 .zip 格式的安装包', 'Select a .zip package');
      phase.value = 'error';
      return false;
    }
    return installFromLocal(selected);
  }

  async function pickAndInstallFromLocalFolder(): Promise<boolean> {
    const selected = await openFileDialog({
      directory: true,
      multiple: false,
      title: l('选择已解压的小组件文件夹（内含 install.ps1）', 'Select the extracted Widget folder containing install.ps1'),
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

  const isDetecting = computed(
    () => statusRefreshing.value || checkingUpdate.value || !statusLoaded.value,
  );

  if (autoInit) {
    void refreshStatus();
    void refreshConnectionStatus();
    ensureSessionUpdateCheck();
  }

  onUnmounted(() => {
    unlistenProgress?.();
    unlistenConnectionStatus?.();
  });

  return {
    status,
    updateCheck,
    phase,
    progress,
    busy,
    statusRefreshing,
    statusLoaded,
    isDetecting,
    checkingUpdate,
    error,
    lastMessage,
    installLogPath,
    installLogExcerpt,
    installIssueCode,
    installRequiredAction,
    installRetryable,
    installBlockingPackages,
    runtimeVerifying,
    connectionStatus,
    connectionRepairing,
    refreshStatus,
    refreshConnectionStatus,
    checkUpdate,
    ensureSessionUpdateCheck,
    installOrUpdate,
    installFromLocal,
    pickAndInstallFromLocal,
    pickAndInstallFromLocalFolder,
    uninstall,
    openSmartAppControl,
    repairConnection,
    verifyRuntime,
    copyDiagnostics,
    copyDownloadUrl,
    getDownloadUrlForSource,
    formatWidgetProgressMessage: (event: GameBarWidgetProgressEvent) => formatWidgetProgressMessage(event, currentLocale()),
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

    const label = source === 'cdn' ? l('国内 CDN', 'regional CDN') : l('GitHub 发布页', 'GitHub Releases');
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
          message: l(`【模拟】正在从 ${label} 下载…\n${url ?? '-'}`, `[Simulation] Downloading from ${label}…\n${url ?? '-'}`),
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
        baseWidget.error.value = l('【模拟】下载 Widget 失败: HTTP 503 Service Unavailable', '[Simulation] Widget download failed: HTTP 503 Service Unavailable');
        baseWidget.phase.value = 'error';
        baseWidget.busy.value = false;
        return;
      }
      baseWidget.progress.value = {
        phase: 'downloading',
        downloadedBytes: Math.floor((totalBytes * pct) / 100),
        totalBytes,
        percent: pct,
        message: l(`【模拟】正在从 ${label} 下载… ${pct}%`, `[Simulation] Downloading from ${label}… ${pct}%`),
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
          message: l('【模拟】正在校验安装包…', '[Simulation] Verifying the package…'),
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
          message: l('【模拟】正在解压安装包…', '[Simulation] Extracting the package…'),
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
        message: l(`【模拟】正在安装小组件，请勿关闭 PowerShell 窗口（已等待 0 分 ${sec} 秒）。若出现错误提示也请耐心等待。`, `[Simulation] Installing the Widget. Keep the PowerShell window open (${sec}s elapsed), even if it briefly shows an error.`),
      };
      await sleep(1000, runId);
      if (runId !== simulateRunId) return;
      if (outcome === 'install-fail' && sec === 2) {
        baseWidget.progress.value = null;
        baseWidget.error.value = l('【模拟】安装失败（退出码 1）\n请在 UAC 中点「是」，并勿关闭弹出的 PowerShell 窗口。', '[Simulation] Installation failed (exit code 1).\nApprove the UAC prompt and keep the PowerShell window open.');
        baseWidget.installLogPath.value = '%LOCALAPPDATA%\\CSMatchHelper\\gamebar-widget\\install.log';
        baseWidget.installLogExcerpt.value =
          l('【模拟日志】正在请求管理员权限…\nAdd-AppxPackage : 部署失败，HRESULT 0x80073D02', '[Simulation log] Requesting administrator access…\nAdd-AppxPackage: deployment failed, HRESULT 0x80073D02');
        baseWidget.phase.value = 'error';
        baseWidget.busy.value = false;
        return;
      }
    }

    if (runId !== simulateRunId) return;
    baseWidget.lastMessage.value = l(`【模拟】已通过 ${label} 完成下载并安装`, `[Simulation] Downloaded from ${label} and installed successfully`);
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
      title: l('选择 CSMatchHelperGameBarWidget zip', 'Select a CSMatchHelperGameBarWidget zip'),
    });
    if (typeof selected === 'string') {
      widgetZipPath.value = selected;
    }
  }

  async function installSelectedZip() {
    actionError.value = '';
    const path = widgetZipPath.value.trim();
    if (!path) {
      actionError.value = l('请先选择 Widget zip 文件', 'Select a Widget zip file first');
      return;
    }
    if (!path.toLowerCase().endsWith('.zip')) {
      actionError.value = l('仅支持 .zip 安装包', 'Only .zip packages are supported');
      return;
    }
    await baseWidget.installFromLocal(path);
  }

  async function uninstallWidget() {
    actionError.value = '';
    try {
      await baseWidget.uninstall();
    } catch (err) {
      actionError.value = localizeErrorMessage(err);
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
    busy: baseWidget.busy,
    checkingUpdate: baseWidget.checkingUpdate,
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
