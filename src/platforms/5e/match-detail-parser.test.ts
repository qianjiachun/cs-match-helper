import { describe, expect, it } from 'vitest';
import {
  buildUuidTeamSideMap,
  calcFirstKillSuccessRate,
  calcHsRate,
  calcKd,
  hasMatchDetailTeams,
} from './match-detail-parser';
import type { P5eMatchBundle } from './types';

const UUID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeBundleWithGroups(): P5eMatchBundle {
  return {
    platformGameId: '5e-groups',
    uuids: [UUID_A, UUID_B],
    matchMode: [9],
    capturedAt: new Date().toISOString(),
    matchDetail: {
      data: {
        group_1: [{ user_info: { user_data: { uuid: UUID_A } } }],
        group_2: [{ user_info: { user_data: { uuid: UUID_B } } }],
      },
    },
  };
}

describe('P5e match detail parser', () => {
  it('builds uuid team side map from group_1 and group_2', () => {
    const map = buildUuidTeamSideMap(makeBundleWithGroups());
    expect(map.get(UUID_A)).toBe(1);
    expect(map.get(UUID_B)).toBe(2);
    expect(hasMatchDetailTeams(makeBundleWithGroups())).toBe(false);
  });

  it('calculates fight-derived stats', () => {
    const fight = { kill: 18, death: 9, per_headshot: 0.5, first_kill: 2, first_death: 3 };
    expect(calcKd(fight)).toBe(2);
    expect(calcHsRate(fight)).toBe(0.5);
    expect(calcFirstKillSuccessRate(fight)).toBeCloseTo(2 / 5);
  });
});
