export interface GameBarWidgetStatus {
  installed: boolean;
  installedVersion: string | null;
  packageFamilyName: string | null;
  loopbackConfigured: boolean;
  displayName: string;
  gameBarInstalled: boolean;
  /** 打开 Xbox 游戏栏的快捷键，如 Win+G */
  gameBarOpenShortcut: string;
  /** 是否从注册表读取（false 表示回退为默认 Win+G） */
  gameBarOpenShortcutFromRegistry: boolean;
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
  | 'complete'
  | 'error';

export function formatWidgetProgressMessage(event: GameBarWidgetProgressEvent): string {
  if (event.message) return event.message;
  switch (event.phase) {
    case 'downloading':
      return event.percent != null
        ? `正在下载安装包… ${event.percent.toFixed(0)}%`
        : '正在下载安装包…';
    case 'verifying':
      return '正在检查安装包是否完整…';
    case 'extracting':
      return '正在打开安装包…';
    case 'installing':
      return '正在安装，请保持安装窗口开启；若出现系统提示也请耐心等待，通常几分钟内可完成。';
    case 'complete':
      return '安装完成';
    default:
      return '处理中…';
  }
}
