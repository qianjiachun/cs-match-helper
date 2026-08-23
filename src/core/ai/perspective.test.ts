import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '@core/match/models';
import {
  canonicalizePerspectiveText,
  displayPerspectiveText,
  resolveSelfSide,
  sideRelationshipLabel,
} from './perspective';

function record(platformId: 'perfect' | '5e' = 'perfect'): MatchRecord {
  return {
    id: 'perspective-test',
    platformId,
    data: {},
    summary: { playerCount: 2 },
    detail: {
      platformId,
      hasExtraInfo: false,
      parseWarnings: [],
      unassigned: [],
      teams: [
        {
          side: 'A', id: 1, singleCount: 1, partyGroups: [],
          players: [{ steamId: 'self-a', nickname: 'A', teamSide: 1, isSingle: true, radar: {}, recentResults: [], recentRatings: [], tags: [] }],
        },
        {
          side: 'B', id: 2, singleCount: 1, partyGroups: [],
          players: [{ steamId: 'self-b', nickname: 'B', teamSide: 2, isSingle: true, radar: {}, recentResults: [], recentRatings: [], tags: [] }],
        },
      ],
    },
  };
}

describe('AI viewer perspective', () => {
  it('resolves an exact Perfect roster match on either side', () => {
    expect(resolveSelfSide(record(), 'self-a')).toBe('A');
    expect(resolveSelfSide(record(), 'self-b')).toBe('B');
  });

  it('stays neutral for absent, duplicate, and 5E players', () => {
    expect(resolveSelfSide(record(), 'absent')).toBeNull();
    const duplicate = record();
    duplicate.detail.teams[1].players.push({ ...duplicate.detail.teams[0].players[0], teamSide: 2 });
    expect(resolveSelfSide(duplicate, 'self-a')).toBeNull();
    expect(resolveSelfSide(record('5e'), 'self-a')).toBeNull();
  });

  it('stores canonical A/B prose and maps it for the current viewer only at display time', () => {
    expect(canonicalizePerspectiveText('我方强度领先，对方地图更熟', 'B')).toBe('B 队强度领先，A 队地图更熟');
    expect(displayPerspectiveText('B 队强度领先，Team A 地图更熟', 'B')).toBe('我方强度领先，对方地图更熟');
    expect(sideRelationshipLabel('A', null)).toBe('A 队');
    expect(sideRelationshipLabel('A', 'A')).toBe('我方');
  });
});
