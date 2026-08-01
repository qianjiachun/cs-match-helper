import type { LogLine } from '@core/log/types';
import { parseLogLineTime } from './log-parser';

export const PERFECT_READY_WINDOW_MS = 30_000;

export function createPerfectReadyDeadline(now = Date.now()): number {
  return now + PERFECT_READY_WINDOW_MS;
}

export function computePerfectReadyDeadline(
  logLine: LogLine,
  readyLeftTimeMs?: number,
): number | undefined {
  if (!readyLeftTimeMs || readyLeftTimeMs <= 0) return undefined;
  const anchor = parseLogLineTime(logLine.time)?.getTime() ?? Date.now();
  return anchor + readyLeftTimeMs;
}
