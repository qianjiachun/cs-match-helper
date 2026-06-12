import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { homeDir } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type {
  AiAnalysisDeltaEvent,
  AiAnalysisDoneEvent,
  AiAnalysisErrorEvent,
  AiAnalysisStartEvent,
  AiSettingsPublic,
  SaveAiSettingsInput,
  StartAiAnalysisInput,
} from '@core/ai/types';
import type { UpdateCheckResult } from '@core/update/types';
import type { LogLinePayload, WatcherStatus } from '@core/types';
import { getActivePlatform } from '@platforms/registry';

const appWindow = getCurrentWindow();

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

export async function getLogStatus(): Promise<WatcherStatus> {
  return invoke<WatcherStatus>('get_log_status');
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
