import { describe, expect, it } from 'vitest';
import type { MatchPlayer, MatchRecord } from '@core/match/models';
import { isPerfectAiAnalysisReady } from './perfect-readiness';

function player(index: number, state: 'loading' | 'loaded' | 'error' = 'loaded'): MatchPlayer {
  return {
    steamId: `7656119800000000${index}`,
    nickname: `Player ${index}`,
    teamSide: index < 5 ? 1 : 2,
    isSingle: true,
    radar: {},
    recentResults: [],
    recentRatings: [],
    tags: [],
    perfectLoadState: {
      stats: state,
      internalComments: 'idle',
      boardIdentity: 'idle',
      platformComments: 'idle',
    },
  };
}

function record(): MatchRecord {
  const players = Array.from({ length: 10 }, (_, index) => player(index));
  return {
    id: '9220102482485790732',
    platformId: 'perfect',
    time: '',
    level: 'INFO',
    category: 'test',
    data: {},
    summary: { playerCount: 10, mapName: 'de_dust2' },
    detail: {
      platformId: 'perfect',
      source: 'ladder-events',
      mapName: 'de_dust2',
      teams: [
        { id: 1, side: 'A', players: players.slice(0, 5), singleCount: 5, partyGroups: [] },
        { id: 2, side: 'B', players: players.slice(5), singleCount: 5, partyGroups: [] },
      ],
      unassigned: [],
      hasExtraInfo: false,
      parseWarnings: [],
      perfectSessionPhase: 'assigned',
      readyCount: 10,
      expectedPlayerCount: 10,
      statsLoadedCount: 10,
      statsSettledCount: 10,
      statsSettled: true,
    },
  };
}

describe('Perfect AI readiness', () => {
  it('waits for team assignment, map and all ten terminal stats states', () => {
    const value = record();
    expect(isPerfectAiAnalysisReady(value)).toBe(true);

    value.detail.perfectSessionPhase = 'all-ready';
    expect(isPerfectAiAnalysisReady(value)).toBe(false);
    value.detail.perfectSessionPhase = 'assigned';

    value.detail.teams[0].players[0].perfectLoadState!.stats = 'loading';
    expect(isPerfectAiAnalysisReady(value)).toBe(false);
  });

  it('accepts failed stats as terminal but rejects incomplete team structures', () => {
    const value = record();
    value.detail.teams[0].players[0].perfectLoadState!.stats = 'error';
    value.detail.statsLoadedCount = 9;
    expect(isPerfectAiAnalysisReady(value)).toBe(true);

    value.detail.unassigned.push(value.detail.teams[1].players.pop()!);
    expect(isPerfectAiAnalysisReady(value)).toBe(false);
  });

  it('does not constrain legacy or other-platform records', () => {
    const value = record();
    value.detail.source = 'legacy-create-game';
    value.detail.teams = [];
    expect(isPerfectAiAnalysisReady(value)).toBe(true);
  });
});
