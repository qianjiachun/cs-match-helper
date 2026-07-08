import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { LogLine } from '@core/log/types';
import { computePerfectReadyDeadline } from './ready-deadline';

function logLine(time: string): LogLine {
  return { time, level: 'INFO', category: 'test', decoded: '', raw: '' };
}

describe('computePerfectReadyDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('anchors to log line time + ready_left_time_ms', () => {
    const line = logLine('2026-07-06 12:00:00');
    const anchor = new Date('2026-07-06 12:00:00').getTime();
    expect(computePerfectReadyDeadline(line, 25_000)).toBe(anchor + 25_000);
  });

  it('supports HH:MM:SS log time on current day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T04:00:00.000Z'));
    const line = logLine('12:00:00');
    const anchor = new Date(2026, 6, 6, 12, 0, 0).getTime();
    expect(computePerfectReadyDeadline(line, 25_000)).toBe(anchor + 25_000);
  });

  it('returns undefined for missing or non-positive ready_left_time_ms', () => {
    const line = logLine('12:00:00');
    expect(computePerfectReadyDeadline(line, undefined)).toBeUndefined();
    expect(computePerfectReadyDeadline(line, 0)).toBeUndefined();
    expect(computePerfectReadyDeadline(line, -100)).toBeUndefined();
  });
});
