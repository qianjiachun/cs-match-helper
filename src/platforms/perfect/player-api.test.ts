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

  it('preserves a season-stats partial failure while keeping overview data', () => {
    const stats = normalizePerfectPlayerStats({
      statusCode: 0,
      data: {
        steamId: '76561198104088654',
        name: 'overview user',
        partialFailure: 'PERFECT_NETWORK: timeout',
      },
    });
    expect(stats.name).toBe('overview user');
    expect(stats.partialFailure).toBe('PERFECT_NETWORK: timeout');
  });

  it('maps the captured overview and season-stats response shape', () => {
    const stats = normalizePerfectPlayerStats({
      statusCode: 0,
      data: {
        user: {
          steamId: '76561198252573288',
          name: 'captured user',
          avatar: 'avatar.jpeg',
          zQId: '2931627',
        },
        matchmaking: { score: 1642 },
        all_season_max_score: 1926,
        all_season_max_score_season: 'S14',
        all_season_max_star: 0,
        ladder: {
          season: 'S24', match_count: 31, kill_num: 450, death_num: 461,
          assist_num: 183, win_rate: 0.4516129, pw_rating_avg: 1.0761288,
          rws_avg: 8.721936, adpr: 76.09677, hs_kill_rate: 0.4099099,
          first_kill_num: 48, round_count: 650, pri_avg: 8.358511,
          '1vx_rate': 0.18181819, '1v1_num': 10, '1v2_num': 6,
          '1v3_num': 0, '1v4_num': 0, '1v5_num': 0,
          two_kill_num: 86, three_kill_num: 27, four_kill_num: 3, five_kill_num: 0,
          mvp_num: 67, only_alive_count: 14,
          curr_s_stars: 0, first_kill_win_round: 32,
          rapid_stop_success_count: 705, rapid_stop_try_count: 1108,
          reaction_time_count: 355, reaction_time_total: 95756,
        },
        map: [{
          map: 'de_mirage', total_num: '19', win_num: '8', kill_num: '275',
          death_num: '276', adpr: '77.3684', pw_rating_avg: '1.1042',
          rws_avg: '8.9479', round_count: '393', win_round_count: '195',
          ct_rounds_num: '177', ct_win_rounds: '87', t_rounds_num: '216', t_win_rounds: '108',
          fire_power: '55', two_kill_num: '61', sniper_kill_num: '4',
          map_info: { name_cn: '荒漠迷城', image: 'map.png', logo: 'logo.png' },
        }],
        radar_new: {
          description: '精准打击的道具手',
          marksmanship: { score: '77' },
          fire_power: { score: '53', detail: { we_raw: '8.4' } },
          first: { score: '34' }, sniper: { score: '29' }, item: { score: '86' },
        },
        weapon: [{
          name: 'ak47', kill_num: 155, match_num: 31, headshot_rate: 0.348,
          avg_kill_num: 5, rapid_stop_success_rate: 0.776,
          level_rapid_stop_success_rate: 'A', spray_accuracy: 0.246,
          weapon_info: { name_cn: 'AK-47', image: 'ak.svg' },
        }],
      },
    }, '76561198252573288');

    expect(stats).toMatchObject({
      steamId: '76561198252573288', zqId: '2931627', name: 'captured user',
      pvpScore: 1642, seasonId: 'S24', seasonMatches: 31,
      currentSStars: 0, allSeasonMaxScore: 1926, allSeasonMaxStars: 0,
      allSeasonMaxScoreSeason: 'S14',
      winRate: 0.4516129, pwRating: 1.0761288, rws: 8.721936,
      avgWe: 8.4,
      kills: 450, deaths: 461, assists: 183, clutch1v1: 10, multiKill4: 3,
      clutchWins: 16,
    });
    expect(stats.kd).toBeCloseTo(450 / 461);
    expect(stats.firstKillSuccessRate).toBeCloseTo(32 / 48);
    expect(stats.rapidStopSuccessRate).toBeCloseTo(705 / 1108);
    expect(stats.reactionTime).toBeCloseTo(95756 / 355);
    expect(stats.avgWe).not.toBe(8.358511);
    expect(stats.mvpCount).toBeUndefined();
    expect(stats.roundMvpCount).toBe(67);
    expect(stats.hotMaps[0]).toMatchObject({
      map: 'de_mirage', mapName: '荒漠迷城', totalMatch: 19, winCount: 8,
      adr: 77.3684, rating: 1.1042, rws: 8.9479, roundCount: 393,
      ctRoundCount: 177, tRoundCount: 216, firePower: 55, twoKillNum: 61,
    });
    expect(stats.abilityProfile).toMatchObject({
      shot: 77, victory: 53, breach: 34, snipe: 29, prop: 86,
      summary: '精准打击的道具手',
    });
    expect(stats.radar).toMatchObject({
      marksmanship: { score: 77 }, item: { score: 86 },
    });
    expect(stats.primaryWeapons[0]).toMatchObject({
      name: 'ak47', nameZh: 'AK-47', image: 'ak.svg', killNum: 155,
      avgKillNum: 5, rapidStopSuccessRate: 0.776,
      levelRapidStopSuccessRate: 'A', sprayAccuracy: 0.246,
    });
  });

  it('derives season combat summaries from ladder and radar raw fields', () => {
    const stats = normalizePerfectPlayerStats({
      statusCode: 0,
      data: {
        steamId: '76561199667272550',
        all_season_max_score: 1935,
        all_season_max_score_season: 'S24',
        all_season_max_star: 0,
        ladder: {
          adpr: 110.0625, adpr_change: -1.0041656, assist_num: 88,
          '1v1_num': 8, '1v1_total': 11, '1v2_num': 1, '1v2_total': 6,
          '1v3_num': 2, '1v3_total': 15, '1v4_num': 0, '1v4_total': 7, '1v5_num': 0, '1v5_total': 3,
          '1vx_rate': 0.26190478, death_num: 172, first_death_num: 24, first_hurt_num: 64,
          first_kill_num: 64, first_kill_win_round: 50, flash_assist_count: 17,
          kast_total: 259, kill_num: 345, match_count: 16, match_mvp_num: 7, mvp_num: 62,
          only_alive_count: 10, pw_rating_avg: 1.58125, pw_rating_avg_change: -0.01275003,
          pw_rating_ct_avg: 1.60625, pw_rating_t_avg: 1.5575001, round_count: 309,
          rws_avg: 16.946249, rws_avg_change: -0.31708336, sniper_first_kill: 26,
          sniper_hold_round_count: 33, sniper_kill_num: 89, sniper_kill_round: 54,
          sniper_multiple_kill_round: 19, sniper_reaction_time_count: 45, sniper_reaction_time_total: 13490,
          time_to_kill_count: 185, time_to_kill_total: 87352, trade_frag_count: 62, trade_frag_try_count: 157,
          win_num: 13, win_rate: 0.8125, win_rate_change: -0.054166675,
          kd_change: -0.113904476, sm_hit_count: 927, sm_shot_count: 4627,
          curr_s_stars: 0, score: 1922, pri_avg: 12.503019,
        },
        map: [{
          map: 'de_mirage', total_num: '5', win_num: '4', pri_avg: '12.6477706', pistol_we_sum: '114.633586',
          sniper_kill_num: '31', kill_num: '109', ct_rounds_num: '48', ct_win_rounds: '33',
          t_rounds_num: '43', t_win_rounds: '24', '1v1_num': '1',
        }],
        radar_new: {
          fire_power: { score: '98', detail: { we_raw: '12.5', pistol_round_rating_raw: '11.2' } },
          first: { score: '91', detail: { win_after_opening_kill_raw: '0.781' } },
          item: { score: '80', detail: { flashbang_flash_rate_raw: '0.99', utility_damage_per_rounds_raw: '2.52' } },
        },
        weapon: [{ name: 'awp', kill_num: 85, avg_kills_per_round: 1.6346154, match_num: 12 }],
      },
    }, '76561199667272550');

    expect(stats.kast).toBeCloseTo(259 / 309);
    expect(stats.tradeFragRate).toBeCloseTo(62 / 157);
    expect(stats.clutch1v1Rate).toBeCloseTo(8 / 11);
    expect(stats.clutch1v1Attempts).toBe(11);
    expect(stats.mvpCount).toBe(7);
    expect(stats.roundMvpCount).toBe(62);
    expect(stats.vs1WinRate).toBeCloseTo(0.26190478);
    expect(stats.combat?.sides).toMatchObject({ ct: { rating: 1.60625 }, t: { rating: 1.5575001 } });
    expect(stats.combat?.aim?.avgTimeToKillMs).toBeCloseTo(87352 / 185);
    expect(stats.combat?.aim?.pistolRating).toBe(11.2);
    expect(stats.combat?.sniper?.killShare).toBeCloseTo(89 / 345);
    expect(stats.combat?.form?.adrChange).toBeCloseTo(-1.0041656);
    expect(stats.avgWe).toBe(12.5);
    expect(stats.avgWe).not.toBe(12.503019);
    expect(stats.hotMaps[0]).toMatchObject({ priAvg: 12.6477706, pistolWeSum: 114.633586, clutch1v1: 1 });
    expect(stats.primaryWeapons[0]?.avgKillsPerRound).toBeCloseTo(1.6346154);
  });
});
