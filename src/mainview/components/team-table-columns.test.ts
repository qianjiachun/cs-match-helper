import { describe, expect, it } from 'vitest';
import { getDefaultVisibleColumnKeys, getStorageKeyForPlatform, getTeamTableColumnDefs } from './team-table-columns';
import { cellValueClass } from './team-table-shared';
import type { MatchPlayer } from '@core/match/models';

describe('team table columns by platform', () => {
  it('uses the current Perfect stats defaults and removes unsupported legacy columns', () => {
    const keys = getDefaultVisibleColumnKeys('perfect');
    expect(keys).toEqual([
      'nickname', 'score', 'seasonRating', 'rating', 'adpr', 'kd', 'hsRate', 'rws',
      'mapPool', 'primaryWeapon', 'weAvg',
    ]);
    expect(keys).not.toContain('rapidStopSuccessRate');
    expect(keys).not.toContain('reactionTime');
    expect(keys).not.toContain('recentWins');
    expect(getTeamTableColumnDefs('perfect').find((column) => column.key === 'hsRate')?.label).toBe('爆头率');
    expect(getTeamTableColumnDefs('perfect').find((column) => column.key === 'seasonRating')?.label).toBe('Rating');
    expect(getTeamTableColumnDefs('perfect').find((column) => column.key === 'rating')?.label).toBe('近期 Rating');
    expect(getTeamTableColumnDefs('perfect').find((column) => column.key === 'mapPool')?.width).toBe('11%');
    expect(getStorageKeyForPlatform('perfect')).toContain('v9');
  });

  it('does not color-code K/D', () => {
    const high = { steamId: '1', nickname: 'high', teamSide: 0, isSingle: true, radar: {}, recentResults: [], recentRatings: [], tags: [], kd: 2 } satisfies MatchPlayer;
    const low = { steamId: '2', nickname: 'low', teamSide: 0, isSingle: true, radar: {}, recentResults: [], recentRatings: [], tags: [], kd: 0.5 } satisfies MatchPlayer;
    expect(cellValueClass('kd', high)).toBe('text-slate-700');
    expect(cellValueClass('kd', low)).toBe('text-slate-700');
  });

  it('uses the legacy WE threshold colors for recent and season WE', () => {
    const player = {
      steamId: '76561198104088654', nickname: 'test', teamSide: 0, isSingle: true,
      radar: {}, recentResults: [], recentRatings: [], tags: [], weAvg: 8.1, seasonWe: 7.9,
    } satisfies MatchPlayer;
    expect(cellValueClass('weAvg', player)).toContain('emerald');
    expect(cellValueClass('seasonWe', player)).toContain('rose');
  });

  it('uses 5e default columns with combat and recent form', () => {
    const keys = getDefaultVisibleColumnKeys('5e');
    expect(keys).toEqual([
      'nickname',
      'score',
      'seasonRating',
      'rating',
      'adpr',
      'weRaw',
      'kd',
      'hsRate',
      'recentWins',
    ]);
    expect(keys).not.toContain('mapWinRate');
    expect(keys).not.toContain('rankLevel');
    expect(keys).not.toContain('rankNum');
  });
});
