import { describe, expect, it } from 'vitest';
import type { MatchPlayer } from '@core/match/models';
import { getPerfectMapFamiliarity, getPerfectMapMetrics, isPerfectMapStrong } from './map-pool';

function player(totalMatch: number, winCount: number, seasonMatches = 20): MatchPlayer {
  return {
    steamId: '76561198104088654', nickname: 'test', teamSide: 0, isSingle: true,
    radar: {}, recentResults: [], recentRatings: [], tags: [],
    seasonTotalNum: seasonMatches, seasonRating: 1, seasonWinRate: 0.5,
    hotMaps: [{ map: 'de_dust2', totalMatch, winCount, ratingSum: totalMatch * 1.2, totalAdr: totalMatch * 85 }],
  };
}

describe('Perfect map familiarity', () => {
  it('uses conservative current-season evidence for familiarity labels', () => {
    expect(getPerfectMapFamiliarity(player(5, 5, 5), 'de_dust2').tier).toBe('experienced');
    expect(getPerfectMapFamiliarity(player(10, 5, 20), 'de_dust2').tier).toBe('skilled');
    expect(getPerfectMapFamiliarity(player(25, 13, 100), 'de_dust2').tier).toBe('specialist');
    expect(getPerfectMapFamiliarity(player(25, 13, 200), 'de_dust2').tier).toBe('skilled');
    expect(getPerfectMapFamiliarity(player(40, 20, 400), 'de_dust2').tier).toBe('specialist');
    expect(getPerfectMapFamiliarity(player(5, 3, 20), 'de_dust2').tier).toBe('experienced');
    expect(getPerfectMapFamiliarity(player(3, 2, 20), 'de_dust2').tier).toBe('limited');
    expect(getPerfectMapFamiliarity(player(2, 2, 20), 'de_dust2').tier).toBe('limited');
    expect(getPerfectMapFamiliarity(player(10, 5), 'de_mirage').tier).toBe('none');
  });

  it('keeps strong performance separate and requires a credible sample', () => {
    expect(isPerfectMapStrong(player(9, 8, 40), 'de_dust2')).toBe(false);
    expect(isPerfectMapStrong(player(10, 6, 40), 'de_dust2')).toBe(true);
  });

  it('derives current-map combat metrics without inventing missing values', () => {
    const value = player(5, 3, 20);
    Object.assign(value.hotMaps![0], {
      totalKill: 60, deathNum: 40, rwsSum: 55, firstKillNum: 12, firstDeathNum: 8, headshotKillNum: 30,
    });
    expect(getPerfectMapMetrics(value, value.hotMaps![0])).toMatchObject({
      kd: 1.5, rws: 11, openingDuelRate: 0.6, headshotRate: 0.5,
    });
  });

  it('uses new season-stats map averages directly instead of dividing by matches again', () => {
    const value = player(19, 8, 31);
    Object.assign(value.hotMaps![0], {
      adr: 77.3684,
      rating: 1.1042,
      rws: 8.9479,
      roundCount: 393,
      winRoundCount: 195,
      ctRoundCount: 177,
      ctWinRoundCount: 87,
      tRoundCount: 216,
      tWinRoundCount: 108,
      firePower: 55,
    });
    expect(getPerfectMapMetrics(value, value.hotMaps![0])).toMatchObject({
      adr: 77.3684,
      rating: 1.1042,
      rws: 8.9479,
      roundWinRate: 195 / 393,
      ctRoundWinRate: 87 / 177,
      tRoundWinRate: 0.5,
      firePower: 55,
    });
  });
});
