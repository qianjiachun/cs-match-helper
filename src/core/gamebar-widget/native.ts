import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  GameBarWidgetInstallResult,
  GameBarWidgetProgressEvent,
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
): Promise<GameBarWidgetInstallResult> {
  return invoke<GameBarWidgetInstallResult>('install_or_update_gamebar_widget', {
    downloadUrl: downloadUrl ?? null,
  });
}

export async function installGameBarWidgetFromLocal(
  sourcePath: string,
): Promise<GameBarWidgetInstallResult> {
  return invoke<GameBarWidgetInstallResult>('install_gamebar_widget_from_local', {
    sourcePath,
  });
}

export async function findGameBarWidgetDevDist(): Promise<string | null> {
  return invoke<string | null>('find_gamebar_widget_dev_dist');
}

export async function uninstallGameBarWidget(): Promise<void> {
  return invoke<void>('uninstall_gamebar_widget');
}

export async function onGameBarWidgetProgress(
  handler: (event: GameBarWidgetProgressEvent) => void,
): Promise<() => void> {
  const unlisten = await listen<GameBarWidgetProgressEvent>('gamebar-widget-progress', (payload) => {
    handler(payload.payload);
  });
  return unlisten;
}
