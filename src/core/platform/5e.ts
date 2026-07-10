import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { P5eCdpStatus, P5eCdpEvent, P5eLaunchResult, P5eProbeResult } from '@platforms/5e/types';

export type {
  P5eCdpEvent,
  P5eCdpPhase,
  P5eCdpStatus,
  P5eHttpEvent,
  P5eLaunchResult,
  P5eMatchBundle,
  P5eProbeResult,
  P5eRawEvent,
  P5eWsEvent,
  P5eWsFrameEvent,
} from '@platforms/5e/types';

export async function launch5eWithCdp(options?: {
  port?: number;
  clientRoot?: string;
}): Promise<P5eLaunchResult> {
  return invoke<P5eLaunchResult>('launch_5e_with_cdp', {
    port: options?.port,
    clientRoot: options?.clientRoot,
  });
}

export async function probe5eEnvironment(options?: {
  clientRoot?: string;
}): Promise<P5eProbeResult> {
  return invoke<P5eProbeResult>('probe_5e_cdp_active', {
    clientRoot: options?.clientRoot,
  });
}

/** @deprecated 使用 probe5eEnvironment */
export async function probe5eExternalCdp(): Promise<boolean> {
  const probe = await probe5eEnvironment();
  return probe.externalRunning;
}

export async function start5eCdpCollector(options?: {
  port?: number;
  clientRoot?: string;
}): Promise<P5eCdpStatus> {
  return invoke<P5eCdpStatus>('start_5e_cdp_collector', {
    port: options?.port,
    clientRoot: options?.clientRoot,
  });
}

export async function stop5eCdpCollector(): Promise<P5eCdpStatus> {
  return invoke<P5eCdpStatus>('stop_5e_cdp_collector');
}

export async function get5eCdpStatus(): Promise<P5eCdpStatus> {
  return invoke<P5eCdpStatus>('get_5e_cdp_status');
}

export async function set5eCdpGateDebugMode(enabled: boolean): Promise<P5eCdpStatus> {
  return invoke<P5eCdpStatus>('set_5e_cdp_gate_debug_mode', { enabled });
}

export async function set5eCdpWsDebugMode(enabled: boolean): Promise<P5eCdpStatus> {
  return invoke<P5eCdpStatus>('set_5e_cdp_ws_debug_mode', { enabled });
}

export async function on5eCdpEvent(
  handler: (event: P5eCdpEvent) => void,
): Promise<UnlistenFn> {
  return listen<P5eCdpEvent>('5e-cdp-event', (ev) => handler(ev.payload));
}

export async function on5eCdpStatus(
  handler: (status: P5eCdpStatus) => void,
): Promise<UnlistenFn> {
  return listen<P5eCdpStatus>('5e-cdp-status', (ev) => handler(ev.payload));
}

export async function fetch5eMatchDetail(matchCode: string): Promise<unknown> {
  return invoke<unknown>('fetch_5e_match_detail', { matchCode });
}

export async function fetch5ePlayerHome(uuid: string): Promise<unknown> {
  return invoke<unknown>('fetch_5e_player_home', { uuid });
}

export async function fetch5ePlayerHomeBatch(
  uuids: string[],
): Promise<Record<string, unknown>> {
  const result = await invoke<Record<string, unknown>>('fetch_5e_player_home_batch', {
    uuids,
  });
  return result ?? {};
}
