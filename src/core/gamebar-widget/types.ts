export interface GameBarWidgetStatus {
  installed: boolean;
  installedVersion: string | null;
  packageFamilyName: string | null;
  loopbackConfigured: boolean;
  loopbackState: GameBarWidgetLoopbackState;
  loopbackError: string | null;
  displayName: string;
  gameBarInstalled: boolean;
  /** 打开 Xbox 游戏栏的快捷键，如 Win+G */
  gameBarOpenShortcut: string;
  /** 是否从注册表读取（false 表示回退为默认 Win+G） */
  gameBarOpenShortcutFromRegistry: boolean;
  trust: GameBarWidgetTrustStatus;
}

export type GameBarWidgetLoopbackState = 'configured' | 'missing' | 'unknown';

export type GameBarWidgetConnectionState =
  | 'stopped'
  | 'starting'
  | 'listening'
  | 'connected'
  | 'recovering'
  | 'failed';

export interface GameBarWidgetConnectionStatus {
  state: GameBarWidgetConnectionState;
  port: number | null;
  retryAttempt: number;
  issueCode: 'ipcPortsUnavailable' | 'ipcServerStartFailed' | null;
  lastError: string | null;
  lastConnectedAt: number | null;
  occupiedPorts: number[];
  blockingProcesses: string[];
  discoveryWarning: string | null;
}

export interface GameBarWidgetConnectionRepairResult {
  success: boolean;
  loopbackState: GameBarWidgetLoopbackState;
  issueCode: string | null;
  requiredAction: string | null;
  retryable: boolean;
  message: string;
  error: string | null;
}

export type GameBarWidgetSetupBlocker =
  | 'gameBarMissing'
  | 'widgetMissing'
  | 'smartAppControl'
  | 'codeIntegrity'
  | 'trustInvalid'
  | 'loopbackRepairFailed'
  | 'ipcFailed';

export function getGameBarWidgetSetupBlocker(
  status: GameBarWidgetStatus | null | undefined,
  connection: GameBarWidgetConnectionStatus | null | undefined,
  recording: boolean,
  latestIssueCode?: string | null,
): GameBarWidgetSetupBlocker | null {
  if (!status?.gameBarInstalled) return 'gameBarMissing';
  if (!status.installed) return 'widgetMissing';
  if (status.trust.runtimeState === 'blockedBySmartAppControl') return 'smartAppControl';
  if (status.trust.runtimeState === 'blockedByCodeIntegrity') return 'codeIntegrity';
  if (
    !status.trust.trustedPeople ||
    status.trust.msixStatus !== 'Valid' ||
    status.trust.catalogStatus !== 'Valid'
  ) {
    return 'trustInvalid';
  }
  if (!recording) return null;
  if (connection?.state === 'connected' || connection?.lastConnectedAt != null) return null;
  if (
    latestIssueCode === 'loopbackRepairFailed' ||
    latestIssueCode === 'uacCancelled'
  ) {
    return 'loopbackRepairFailed';
  }
  if (connection?.state === 'failed') return 'ipcFailed';
  return null;
}

export type GameBarWidgetRuntimeState =
  | 'notInstalled'
  | 'blockedBySmartAppControl'
  | 'blockedByCodeIntegrity'
  | 'installedUnverified'
  | 'running';

export type SmartAppControlState = 'on' | 'evaluation' | 'off' | 'notApplicable' | 'unknown';

export interface CodeIntegrityBlockEvent {
  eventId: number;
  timeCreated: string;
  targetFile: string | null;
  message: string;
}

export interface GameBarWidgetTrustStatus {
  publisher: string;
  signatureThumbprint: string;
  signatureKind: string | null;
  trustedPeople: boolean;
  msixStatus: string;
  catalogStatus: string;
  smartAppControlState: SmartAppControlState;
  wdacState: 'enforced' | 'audit' | 'off' | 'notApplicable' | 'unknown';
  recentCodeIntegrityEvent: CodeIntegrityBlockEvent | null;
  runtimeState: GameBarWidgetRuntimeState;
  runtimeVerified: boolean;
}

export function isGameBarWidgetReady(
  status: GameBarWidgetStatus | null | undefined,
  connection?: GameBarWidgetConnectionStatus | null,
): boolean {
  const connectionProvesLoopback =
    connection?.state === 'connected' || connection?.lastConnectedAt != null;
  const loopbackIsUsable =
    status?.loopbackState !== 'missing' || connectionProvesLoopback;
  return Boolean(
    status?.gameBarInstalled &&
      status.installed &&
      loopbackIsUsable &&
      status.trust.trustedPeople &&
      status.trust.msixStatus === 'Valid' &&
      status.trust.catalogStatus === 'Valid' &&
      (status.trust.runtimeState === 'running' ||
        status.trust.runtimeState === 'installedUnverified'),
  );
}

export interface GameBarWidgetUpdateCheck {
  installedVersion: string | null;
  latestVersion: string | null;
  hasUpdate: boolean;
  /** 默认安装源（CDN） */
  downloadUrl: string | null;
  cdnDownloadUrl: string | null;
  githubDownloadUrl: string | null;
  sha256: string | null;
  zipFileName: string | null;
  error: string | null;
}

export type GameBarWidgetDownloadSource = 'cdn' | 'github';

export interface GameBarWidgetInstallResult {
  success: boolean;
  installedVersion: string | null;
  message: string;
  installLogPath?: string | null;
  installLogExcerpt?: string | null;
  issueCode: string | null;
  requiredAction: string | null;
  retryable: boolean;
  blockingPackages: string[];
}

export interface GameBarWidgetRuntimeVerificationResult {
  success: boolean;
  runtimeState: GameBarWidgetRuntimeState;
  issueCode: string | null;
  requiredAction: string | null;
  retryable: boolean;
  message: string;
  codeIntegrityEvent: CodeIntegrityBlockEvent | null;
}

export interface GameBarWidgetProgressEvent {
  phase: string;
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
  message: string | null;
}

export type GameBarWidgetPhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'uninstalling'
  | 'complete'
  | 'error';

export function formatWidgetProgressMessage(
  event: GameBarWidgetProgressEvent,
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (event.message) return event.message;
  const en = locale === 'en-US';
  switch (event.phase) {
    case 'downloading':
      return event.percent != null
        ? (en ? `Downloading package… ${event.percent.toFixed(0)}%` : `正在下载安装包… ${event.percent.toFixed(0)}%`)
        : (en ? 'Downloading package…' : '正在下载安装包…');
    case 'verifying':
      return en ? 'Verifying package…' : '正在检查安装包是否完整…';
    case 'extracting':
      return en ? 'Opening package…' : '正在打开安装包…';
    case 'installing':
      return en ? 'Installing. Keep the setup window open; this normally takes a few minutes.' : '正在安装，请保持安装窗口开启；若出现系统提示也请耐心等待，通常几分钟内可完成。';
    case 'complete':
      return en ? 'Installation complete' : '安装完成';
    default:
      return en ? 'Working…' : '处理中…';
  }
}
