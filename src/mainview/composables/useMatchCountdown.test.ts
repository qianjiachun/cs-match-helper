import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getMatchCountdownSec } from './useMatchCountdown';

describe('getMatchCountdownSec', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows remaining seconds from deadline', () => {
    const now = Date.now();
    expect(getMatchCountdownSec(now + 30_000, now)).toBe(30);
  });

  it('shows 00:00 equivalent when deadline has passed', () => {
    const now = Date.now();
    expect(getMatchCountdownSec(now - 1_000, now)).toBe(0);
  });

  it('reflects UI mount delay (5s late shows ~25s)', () => {
    const serverAnchor = Date.now();
    const deadline = serverAnchor + 30_000;
    vi.advanceTimersByTime(5_000);
    expect(getMatchCountdownSec(deadline)).toBe(25);
  });

  it('ticks down as time advances', () => {
    const start = Date.now();
    const deadline = start + 10_000;
    expect(getMatchCountdownSec(deadline, start)).toBe(10);
    expect(getMatchCountdownSec(deadline, start + 3_000)).toBe(7);
  });

  it('returns 0 for invalid deadline', () => {
    expect(getMatchCountdownSec(undefined)).toBe(0);
    expect(getMatchCountdownSec(Number.NaN)).toBe(0);
  });
});
