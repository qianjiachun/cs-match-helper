import { describe, expect, it } from 'vitest';
import { normalizePerfectBoardSearch, normalizePerfectPlayerStats } from './player-api';

describe('Perfect player API normalization', () => {
  it('parses zero values and uses only the latest ten valid PW ratings', () => {
    const values = [1.2, null, '1.1', 0, ...Array.from({ length: 20 }, () => 2)];
    const stats = normalizePerfectPlayerStats({ statusCode: 0, data: { steamId: '76561198104088654', pwRating: 1.1, kd: 0, historyPwRatings: values } });
    expect(stats.kd).toBe(0);
    expect(stats.recentPwRatings).toHaveLength(10);
    expect(stats.recentPwRating).toBeCloseTo(1.63);
  });

  it('derives recent WE, RWS and ELO trend independently and preserves rich map and weapon fields', () => {
    const stats = normalizePerfectPlayerStats({ statusCode: 0, data: {
      steamId: '76561198104088654', avgWe: 12.5, weList: [10, null, '12', 0, 8],
      historyRws: [9, '11', null, 10], historyScores: [1922, 1900, 0, 1880],
      commonRating: 1.01, historyRatings: [1.2, 1.0], kills: 100, deaths: 80, assists: 30, mvpCount: 20, k2: 10, k3: 4, k4: 2, k5: 1,
      endingWin: 8, vs1: 4, vs2: 2, vs3: 1, vs4: 1, vs5: 0,
      hotMaps: [{ map: 'de_dust2', mapName: '炙热沙城Ⅱ', mapLogo: 'map.png', totalMatch: 5, winCount: 3, totalKill: 60, deathNum: 40, rwsSum: 55 }],
      hotWeapons2: [{ name: 'ak47', nameZh: 'AK47', image: 'ak.png', killNum: 50, matchNum: 5, headshotRate: 0.5, firstShotAccuracy: 0.3, avgTimeToKill: 450, levelAccuracy: 'A' }],
    } });
    expect(stats.recentWeValues).toEqual([10, 12, 0, 8]);
    expect(stats.recentWe).toBe(7.5);
    expect(stats.avgWe).toBe(12.5);
    expect(stats.recentRws).toBe(10);
    expect(stats.recentStandardRating).toBe(1.1);
    expect(stats.eloTrend).toBe(42);
    expect(stats).toMatchObject({ clutchWins: 8, clutch1v1: 4, clutch1v2: 2, clutch1v3: 1, clutch1v4: 1, clutch1v5: 0 });
    expect(stats.hotMaps[0]).toMatchObject({ mapLogo: 'map.png', totalKill: 60, deathNum: 40, rwsSum: 55 });
    expect(stats.primaryWeapons[0]).toMatchObject({ headshotRate: 0.5, firstShotAccuracy: 0.3, avgTimeToKill: 450, levelAccuracy: 'A' });
  });

  it('matches steamId64Str exactly and rejects conflicting IDs', () => {
    const group = (data: unknown[]) => ({ code: 0, result: [{ itemType: 'USER', data }] });
    expect(normalizePerfectBoardSearch(group([{ steamId64Str: '76561198104088654', wanmeiId: 29668019 }]), '76561198104088654')?.wanmeiId).toBe('29668019');
    expect(normalizePerfectBoardSearch(group([{ steamId64: 76561198104088654, wanmeiId: 1 }]), '76561198104088654')).toBeNull();
    expect(() => normalizePerfectBoardSearch(group([
      { steamId64Str: '76561198104088654', wanmeiId: 1 },
      { steamId64Str: '76561198104088654', wanmeiId: 2 },
    ]), '76561198104088654')).toThrow(/Ambiguous/);
  });

  it('falls back to the compact hotWeapons shape', () => {
    const stats = normalizePerfectPlayerStats({ statusCode: 0, data: {
      steamId: '76561198104088654',
      hotWeapons: [{ weaponName: 'AK47', weaponImage: 'ak.png', weaponKill: 18, weaponHeadShot: 9 }],
    } });
    expect(stats.primaryWeapons[0]).toMatchObject({ name: 'AK47', nameZh: 'AK47', image: 'ak.png', killNum: 18, headshotSum: 9 });
  });
});
