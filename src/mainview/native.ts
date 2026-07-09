import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { homeDir } from '@tauri-apps/api/path';
import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
import type {
  AiAnalysisDeltaEvent,
  AiAnalysisDoneEvent,
  AiAnalysisErrorEvent,
  AiAnalysisStartEvent,
  AiSettingsPublic,
  SaveAiSettingsInput,
  StartAiAnalysisInput,
} from '@core/ai/types';
import type { DownloadUpdateResult, UpdateCheckResult, UpdateProgressEvent } from '@core/update/types';
import type { ChangelogReleaseDetail, ChangelogReleaseSummary } from '@core/update/changelog';
import type { LogLinePayload, WatcherStatus } from '@core/types';
import { getActivePlatform } from '@platforms/registry';

const appWindow = getCurrentWindow();

function waitForFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 首帧绘制完成后再显示主窗口，并做一次 1px resize 以规避 WebView2 首帧白屏。 */
export async function showMainWindowAfterFirstPaint(): Promise<void> {
  await waitForFirstPaint();
  await appWindow.show();

  try {
    const size = await appWindow.innerSize();
    await appWindow.setSize(new PhysicalSize(size.width + 1, size.height));
    await appWindow.setSize(new PhysicalSize(size.width, size.height));
  } catch {
    // resize nudge 失败不影响正常使用
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function minimizeWindow(): Promise<void> {
  await appWindow.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await appWindow.toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  await appWindow.close();
}

export async function closeApp(): Promise<void> {
  await invoke('close_app');
}

export async function getLogStatus(): Promise<WatcherStatus> {
  return invoke<WatcherStatus>('get_log_status');
}

export async function readLatestLogLines(logDir: string): Promise<string[]> {
  return invoke<string[]>('read_latest_log_lines', { logDir });
}

export async function startLogWatch(logDir?: string): Promise<void> {
  const dir = logDir ?? getActivePlatform().buildLogDir(await homeDir());
  await invoke('start_log_watch', { logDir: dir });
}

export async function stopLogWatch(): Promise<void> {
  await invoke('stop_log_watch');
}

export async function onLogLine(
  handler: (line: LogLinePayload) => void,
): Promise<UnlistenFn> {
  return listen<LogLinePayload>('log-line', (event) => {
    handler(event.payload);
  });
}

export async function onWatcherStatus(
  handler: (status: WatcherStatus) => void,
): Promise<UnlistenFn> {
  return listen<WatcherStatus>('watcher-status', (event) => {
    handler(event.payload);
  });
}

export async function getAiSettingsPath(): Promise<string> {
  return invoke<string>('get_ai_settings_path');
}

export async function loadAiSettings(): Promise<AiSettingsPublic> {
  return invoke<AiSettingsPublic>('load_ai_settings');
}

export async function saveAiSettings(input: SaveAiSettingsInput): Promise<AiSettingsPublic> {
  return invoke<AiSettingsPublic>('save_ai_settings', { input });
}

export async function startAiAnalysis(input: StartAiAnalysisInput): Promise<void> {
  await invoke('start_ai_analysis', { input });
}

export async function cancelAiAnalysis(): Promise<void> {
  await invoke('cancel_ai_analysis');
}

export async function onAiAnalysisStart(
  handler: (event: AiAnalysisStartEvent) => void,
): Promise<UnlistenFn> {
  return listen<AiAnalysisStartEvent>('ai-analysis-start', (event) => {
    handler(event.payload);
  });
}

export async function onAiAnalysisDelta(
  handler: (event: AiAnalysisDeltaEvent) => void,
): Promise<UnlistenFn> {
  return listen<AiAnalysisDeltaEvent>('ai-analysis-delta', (event) => {
    handler(event.payload);
  });
}

export async function onAiAnalysisDone(
  handler: (event: AiAnalysisDoneEvent) => void,
): Promise<UnlistenFn> {
  return listen<AiAnalysisDoneEvent>('ai-analysis-done', (event) => {
    handler(event.payload);
  });
}

export async function onAiAnalysisError(
  handler: (event: AiAnalysisErrorEvent) => void,
): Promise<UnlistenFn> {
  return listen<AiAnalysisErrorEvent>('ai-analysis-error', (event) => {
    handler(event.payload);
  });
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>('get_app_version');
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>('check_for_update');
}

export async function listChangelogReleases(): Promise<ChangelogReleaseSummary[]> {
  return invoke('list_changelog_releases');
}

export async function getChangelogRelease(tag: string): Promise<ChangelogReleaseDetail> {
  return invoke('get_changelog_release', { tag });
}

export async function downloadUpdate(version: string): Promise<DownloadUpdateResult> {
  return invoke<DownloadUpdateResult>('download_update', { version });
}

export async function applyUpdateAndRestart(newExePath: string): Promise<void> {
  await invoke('apply_update_and_restart', { newExePath });
}

export async function onUpdateProgress(
  handler: (event: UpdateProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<UpdateProgressEvent>('update-progress', (event) => {
    handler(event.payload);
  });
}

export async function getCommentClientKey(): Promise<string> {
  return invoke<string>('get_comment_client_key');
}
