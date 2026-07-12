import { describe, expect, it } from 'vitest';
import {
  isP5eMatchingBatchUrl,
  isP5eWhitelistedUrl,
  parseMatchingBatchMapSignal,
  sameUuidSet,
} from './events';

const TEAM1 = [
  'aaaaaaaa-bbbb-cccc-dddd-111111111111',
  'aaaaaaaa-bbbb-cccc-dddd-222222222222',
  'aaaaaaaa-bbbb-cccc-dddd-333333333333',
  'aaaaaaaa-bbbb-cccc-dddd-444444444444',
  'aaaaaaaa-bbbb-cccc-dddd-555555555555',
];
const TEAM2 = [
  'bbbbbbbb-cccc-dddd-eeee-111111111111',
  'bbbbbbbb-cccc-dddd-eeee-222222222222',
  'bbbbbbbb-cccc-dddd-eeee-333333333333',
  'bbbbbbbb-cccc-dddd-eeee-444444444444',
  'bbbbbbbb-cccc-dddd-eeee-555555555555',
];

describe('matching/batch map signal', () => {
  it('recognizes matching/batch as whitelisted url', () => {
    const url = 'https://gate.5eplay.com/cranenew/http/api/match/matching/batch';
    expect(isP5eMatchingBatchUrl(url)).toBe(true);
    expect(isP5eWhitelistedUrl(url)).toBe(true);
  });

  it('parses valid game_map and 10 unique uuids', () => {
    const signal = parseMatchingBatchMapSignal({
      game_map: 'de_dust2',
      t1_uuids: TEAM1,
      t2_uuids: TEAM2,
    });
    expect(signal).toEqual({
      mapName: 'de_dust2',
      uuids: [...TEAM1, ...TEAM2],
      t1Uuids: TEAM1,
      t2Uuids: TEAM2,
    });
  });

  it('rejects empty map or invalid teams', () => {
    expect(
      parseMatchingBatchMapSignal({
        game_map: '',
        t1_uuids: TEAM1,
        t2_uuids: TEAM2,
      }),
    ).toBeNull();
    expect(
      parseMatchingBatchMapSignal({
        game_map: 'de_dust2',
        t1_uuids: TEAM1.slice(0, 4),
        t2_uuids: TEAM2,
      }),
    ).toBeNull();
    expect(
      parseMatchingBatchMapSignal({
        game_map: 'de_dust2',
        t1_uuids: TEAM1,
        t2_uuids: [...TEAM2.slice(0, 4), TEAM1[0]],
      }),
    ).toBeNull();
  });

  it('compares uuid sets regardless of order', () => {
    expect(sameUuidSet([...TEAM1, ...TEAM2], [...TEAM2, ...TEAM1])).toBe(true);
    expect(sameUuidSet([...TEAM1, ...TEAM2], [...TEAM1, ...TEAM2.slice(0, 4), TEAM1[0]])).toBe(false);
  });
});
