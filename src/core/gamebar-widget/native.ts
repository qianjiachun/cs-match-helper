import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  GameBarWidgetConnectionRepairResult,
  GameBarWidgetConnectionStatus,
  GameBarWidgetInstallResult,
  GameBarWidgetProgressEvent,
  GameBarWidgetRuntimeVerificationResult,
  GameBarWidgetStatus,
  GameBarWidgetUpdateCheck,
} from './types';

export async function getGameBarWidgetStatus(): Promise<GameBarWidgetStatus> {
  return invoke<GameBarWidgetStatus>('get_gamebar_widget_status');
}

export async function checkGameBarWidgetUpdate(): Promise<GameBarWidgetUpdateCheck> {
  return invoke<GameBarWidgetUpdateCheck>('check_gamebar_widget_update');
}

export async function installOrUpdateGameBarWidget(
  downloadUrl?: string | null,
  locale?: 'zh-CN' | 'en-US',
): Promise<GameBarWidgetInstallResult> {
  return invoke<GameBarWidgetInstallResult>('install_or_update_gamebar_widget', {
    downloadUrl: downloadUrl ?? null,
    locale: locale ?? null,
  });
}

export async function getGameBarWidgetConnectionStatus(): Promise<GameBarWidgetConnectionStatus> {
  return invoke<GameBarWidgetConnectionStatus>('get_gamebar_widget_connection_status');
}

export async function repairGameBarWidgetConnection(): Promise<GameBarWidgetConnectionRepairResult> {
  return invoke<GameBarWidgetConnectionRepairResult>('repair_gamebar_widget_connection');
}

export async function installGameBarWidgetFromLocal(
  sourcePath: string,
  locale?: 'zh-CN' | 'en-US',
): Promise<GameBarWidgetInstallResult> {
  return invoke<GameBarWidgetInstallResult>('install_gamebar_widget_from_local', {
    sourcePath,
    locale: locale ?? null,
  });
}

export async function findGameBarWidgetDevDist(): Promise<string | null> {
  return invoke<string | null>('find_gamebar_widget_dev_dist');
}

export async function uninstallGameBarWidget(): Promise<void> {
  return invoke<void>('uninstall_gamebar_widget');
}

export async function openSmartAppControlSettings(): Promise<void> {
  return invoke<void>('open_smart_app_control_settings');
}

export async function verifyGameBarWidgetRuntime(): Promise<GameBarWidgetRuntimeVerificationResult> {
  return invoke<GameBarWidgetRuntimeVerificationResult>('verify_gamebar_widget_runtime');
}

export async function onGameBarWidgetProgress(
  handler: (event: GameBarWidgetProgressEvent) => void,
): Promise<() => void> {
  const unlisten = await listen<GameBarWidgetProgressEvent>('gamebar-widget-progress', (payload) => {
    handler(payload.payload);
  });
  return unlisten;
}

export async function onGameBarWidgetConnectionStatus(
  handler: (status: GameBarWidgetConnectionStatus) => void,
): Promise<() => void> {
  return listen<GameBarWidgetConnectionStatus>('gamebar-widget-connection-status', (event) => {
    handler(event.payload);
  });
}
