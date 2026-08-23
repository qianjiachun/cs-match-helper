import { describe, expect, it } from 'vitest';
import fixture from '@platforms/perfect/fixtures/perfect-9220102482485790732-api.json';
import { buildMatchSummary, buildPerfectAiAnalysisRequest } from './prompt';
import { normalizePerfectPlayerStats } from '@platforms/perfect/player-api';
import { createReadyPlayer, mergePerfectStats } from '@platforms/perfect/session';
import type { MatchRecord } from '@core/match/models';

describe('new Perfect AI prompt', () => {
  it('contains compact new stats and excludes raw histories and comments', () => {
    const steamId = fixture.steamIds[0];
    const snapshot = fixture.players[steamId as keyof typeof fixture.players];
    const player = mergePerfectStats(createReadyPlayer(steamId), normalizePerfectPlayerStats(snapshot.stats.body, steamId));
    player.teamSide = 1;
    player.score = 2400;
    player.currentSStars = 12;
    player.peakScore = 2400;
    player.peakSStars = 28;
    player.peakSeason = 'S23';
    player.rapidStopSuccessRate = 0.64;
    const record: MatchRecord = {
      id: fixture.matchId, platformId: 'perfect', data: { shouldNotLeak: fixture },
      summary: { playerCount: 1, mapName: 'de_dust2' },
      detail: {
        platformId: 'perfect', mapName: 'de_dust2', source: 'ladder-events', perfectSessionPhase: 'assigned',
        teams: [{ side: 'A', id: 1, players: [player], singleCount: 1, partyGroups: [] }],
        unassigned: [], hasExtraInfo: false, parseWarnings: [], statsSettled: true,
      },
    };
    const summary = buildMatchSummary(record);
    const prompt = buildPerfectAiAnalysisRequest(record).userPrompt;
    expect(summary.fastSummary.dataQuality.statsSuccess).toBe(1);
    expect(prompt).toContain('evidenceCatalog');
    expect(prompt).toContain('mapWinRate');
    expect(prompt).toContain('weaponSpecialty');
    expect(prompt).toContain('currentRank');
    expect(prompt).toContain('peakRank');
    expect(prompt).toContain('S 28 星');
    expect(prompt).toContain('"schemaVersion": 3');
    expect(prompt).toContain('playerSignals');
    expect(prompt).toContain('就必须输出玩家信号');
    expect(prompt).toContain('watch 只用于客户端转换旧历史');
    expect(prompt).not.toContain('historyPwRatings');
    expect(prompt).not.toContain('historyRws');
    expect(prompt).not.toContain('weList');
    expect(prompt).not.toContain('recentPwRating');
    expect(prompt).not.toContain('PW Rating');
    expect(prompt).not.toContain('commentDTOS');
    expect(prompt).not.toContain('representativeMaps');
    expect(prompt).not.toContain('hotWeapons');
    expect(prompt).not.toContain('deepContext');
    expect(prompt).not.toContain('zqId');
    expect(prompt).not.toContain('zq_id');
    expect(prompt).not.toContain('buy_count');
    expect(prompt).not.toContain('throw_count');
    expect(prompt).not.toContain('pickup_count');
    expect(prompt).not.toContain('we_raw');
    expect(prompt).not.toContain('pw_rating_ct_avg_raw');
    expect(prompt.length).toBeLessThan(25 * 1024);
  });

  it('summarizes season combat groups for Perfect players', () => {
    const steamId = '76561199667272550';
    const stats = normalizePerfectPlayerStats({
      statusCode: 0,
      data: {
        steamId,
        ladder: {
          adpr: 110, kast_total: 259, round_count: 309, kill_num: 345, death_num: 172,
          first_kill_num: 64, first_death_num: 24, first_kill_win_round: 50, first_hurt_num: 64,
          flash_assist_count: 17, trade_frag_count: 62, trade_frag_try_count: 157,
          '1v1_num': 8, '1v1_total': 11, '1vx_rate': 0.26, match_mvp_num: 7, mvp_num: 62,
          pw_rating_ct_avg: 1.6, pw_rating_t_avg: 1.55, pw_rating_avg_change: -0.01,
          sniper_kill_num: 89, time_to_kill_total: 87352, time_to_kill_count: 185,
        },
        map: [{
          map: 'de_dust2', total_num: '5', win_num: '4', pri_avg: '12.6', pistol_we_sum: '114',
          sniper_kill_num: '31', kill_num: '109', ct_rounds_num: '48', ct_win_rounds: '33',
          t_rounds_num: '43', t_win_rounds: '24',
        }],
        radar_new: {
          fire_power: { score: '98', detail: { we_raw: '12.5', pistol_round_rating_raw: '11.2' } },
          item: { score: '80', detail: { flashbang_flash_rate_raw: '0.99' } },
        },
        weapon: [{ name: 'awp', kill_num: 85, avg_kills_per_round: 1.6, match_num: 12 }],
      },
    }, steamId);
    const player = mergePerfectStats(createReadyPlayer(steamId), stats);
    player.teamSide = 1;
    const record: MatchRecord = {
      id: 'combat-summary', platformId: 'perfect', data: {},
      summary: { playerCount: 1, mapName: 'de_dust2' },
      detail: {
        platformId: 'perfect', mapName: 'de_dust2', source: 'ladder-events', perfectSessionPhase: 'assigned',
        teams: [{ side: 'A', id: 1, players: [player], singleCount: 1, partyGroups: [] }],
        unassigned: [], hasExtraInfo: false, parseWarnings: [], statsSettled: true,
      },
    };
    const summarized = buildMatchSummary(record).deepContext.teams[0].players[0];
    expect(summarized).toMatchObject({
      kast: expect.any(Number),
      sides: { ct: { rating: 1.6, rounds: 48 }, t: { rating: 1.55, rounds: 43 } },
      opening: { winAfterOpeningKill: expect.any(Number) },
      utility: { flashAssistPerRound: expect.any(Number) },
      aim: { avgTimeToKillMs: expect.any(Number), pistolRating: 11.2 },
      sniper: { killShare: expect.any(Number) },
      clutch: { allRate: 0.26, v1: { wins: 8, attempts: 11 } },
      form: { ratingChange: -0.01 },
    });
    expect(summarized.currentMap).toMatchObject({ priAvg: 12.6, pistolWe: 114, sniperKillShare: expect.any(Number) });
    const prompt = buildPerfectAiAnalysisRequest(record).userPrompt;
    expect(prompt).toContain('sides');
    expect(prompt).toContain('openingProfile');
    expect(prompt).not.toContain('zqId');
    expect(prompt).not.toContain('flashbang_buy');
    expect(prompt).not.toContain('utility_damage_per_rounds_raw');
  });

  it('keeps a ten-player request compact and adds viewer perspective without changing evidence identity', () => {
    const players = fixture.steamIds.map((steamId, index) => {
      const snapshot = fixture.players[steamId as keyof typeof fixture.players];
      const player = mergePerfectStats(createReadyPlayer(steamId), normalizePerfectPlayerStats(snapshot.stats.body, steamId));
      player.teamSide = index < 5 ? 1 : 2;
      return player;
    });
    const record: MatchRecord = {
      id: fixture.matchId,
      platformId: 'perfect',
      data: {},
      summary: { playerCount: 10, mapName: 'de_dust2' },
      detail: {
        platformId: 'perfect', mapName: 'de_dust2', source: 'ladder-events', perfectSessionPhase: 'assigned',
        teams: [
          { side: 'A', id: 1, players: players.slice(0, 5), singleCount: 5, partyGroups: [] },
          { side: 'B', id: 2, players: players.slice(5), singleCount: 5, partyGroups: [] },
        ],
        unassigned: [], hasExtraInfo: false, parseWarnings: [], statsSettled: true,
      },
    };
    const neutral = buildPerfectAiAnalysisRequest(record);
    const perspective = buildPerfectAiAnalysisRequest(record, 'zh-CN', fixture.steamIds[0]);
    expect(neutral.userPrompt.length).toBeLessThan(25 * 1024);
    expect(perspective.userPrompt).toContain('"perspective":{"selfSide":"A","opponentSide":"B"}');
    expect(perspective.userPrompt).toContain('"inputFingerprint":"ai3-');
  });
});
