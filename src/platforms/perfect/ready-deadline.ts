import type { LogLine } from '@core/log/types';
import { parseLogLineTime } from './log-parser';

export function computePerfectReadyDeadline(
  logLine: LogLine,
  readyLeftTimeMs?: number,
): number | undefined {
  if (!readyLeftTimeMs || readyLeftTimeMs <= 0) return undefined;
  const anchor = parseLogLineTime(logLine.time)?.getTime() ?? Date.now();
  return anchor + readyLeftTimeMs;
}
