import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { P5eCdpStatus, P5eHttpEvent, P5eLaunchResult, P5eProbeResult } from '@platforms/5e/types';

export type {
  P5eCdpPhase,
  P5eCdpStatus,
  P5eHttpEvent,
  P5eLaunchResult,
  P5eMatchBundle,
  P5eProbeResult,
  P5eRawEvent,
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

export async function probe5eEnvironment(): Promise<P5eProbeResult> {
  return invoke<P5eProbeResult>('probe_5e_cdp_active');
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

export async function on5eCdpEvent(
  handler: (event: P5eHttpEvent) => void,
): Promise<UnlistenFn> {
  return listen<P5eHttpEvent>('5e-cdp-event', (ev) => handler(ev.payload));
}

export async function on5eCdpStatus(
  handler: (status: P5eCdpStatus) => void,
): Promise<UnlistenFn> {
  return listen<P5eCdpStatus>('5e-cdp-status', (ev) => handler(ev.payload));
}

export async function fetch5eMatchDetail(matchCode: string): Promise<unknown> {
  return invoke<unknown>('fetch_5e_match_detail', { matchCode });
}
