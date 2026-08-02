import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '@core/match/models';
import { shouldReplayMatchReveal } from './match-reveal-policy';

function record(source: MatchRecord['detail']['source'], platformId: 'perfect' | '5e'): MatchRecord {
  return {
    id: 'next',
    platformId,
    time: '',
    level: 'INFO',
    category: 'test',
    data: {},
    summary: { playerCount: 0 },
    detail: {
      platformId,
      source,
      teams: [],
      unassigned: [],
      hasExtraInfo: false,
      parseWarnings: [],
    },
  };
}

describe('match reveal policy', () => {
  it('never replays the whole panel for progressive Perfect id corrections', () => {
    const value = record('ladder-events', 'perfect');
    expect(shouldReplayMatchReveal(value, '922-new', 'perfect-1')).toBe(false);
    expect(shouldReplayMatchReveal(value, '922-new', '922-stale')).toBe(false);
  });

  it('keeps whole-panel reveals for real id changes on other flows', () => {
    expect(shouldReplayMatchReveal(record(undefined, '5e'), 'next', 'previous')).toBe(true);
    expect(shouldReplayMatchReveal(record(undefined, '5e'), 'same', 'same')).toBe(false);
  });
});
