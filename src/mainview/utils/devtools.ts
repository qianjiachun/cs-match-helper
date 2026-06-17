import { invoke } from '@tauri-apps/api/core';

export async function openAppDevtools(): Promise<void> {
  await invoke('open_app_devtools');
}

export async function closeAppDevtools(): Promise<void> {
  await invoke('close_app_devtools');
}
