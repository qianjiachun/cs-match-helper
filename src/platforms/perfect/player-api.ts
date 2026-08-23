import { fetchPerfectPlayerStatsRaw, searchPerfectBoardUserRaw } from '../../mainview/native';
import type { PerfectHotMap, PerfectWeaponSummary } from '@core/match/models';
import type { PerfectBoardUser, PerfectPlayerStats } from './types';
import { buildPerfectSeasonCombat, ratio } from './season-combat';

const BOARD_CACHE_KEY = 'cs-match-helper.perfect-board-id-cache-v1';
const MAX_CONCURRENT_PLAYERS = 4;

type JsonObject = Record<string, unknown>;
type ScheduledTask<T> = { run: () => Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void };

export interface PerfectPlayerStatsResult {
  raw: unknown;
  stats: PerfectPlayerStats;
}

const statsInFlight = new Map<string, Promise<PerfectPlayerStatsResult>>();
const boardInFlight = new Map<string, Promise<PerfectBoardUser | null>>();
const queue: ScheduledTask<unknown>[] = [];
let activeTasks = 0;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numericArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(numberValue).filter((item): item is number => item != null);
}

function average(values: number[]): number | undefined {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function objectValue(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function unwrapData(raw: unknown): JsonObject {
  if (!isObject(raw)) throw new Error('Invalid Perfect response');
  const statusCode = numberValue(raw.statusCode);
  if (statusCode != null && statusCode !== 0) {
    throw new Error(stringValue(raw.errorMessage) ?? `Perfect API status ${statusCode}`);
  }
  if (!isObject(raw.data)) throw new Error('Perfect response has no player data');
  return raw.data;
}

function normalizeHotMaps(value: unknown): PerfectHotMap[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const mapInfo = objectValue(item.map_info);
    const map = stringValue(item.map);
    const totalMatch = numberValue(item.totalMatch ?? item.total_num);
    if (!map || totalMatch == null || totalMatch < 0) return [];
    return [{
      map,
      mapName: stringValue(item.mapName ?? mapInfo.name_cn),
      mapImage: stringValue(item.mapImage ?? mapInfo.image ?? mapInfo.background),
      mapLogo: stringValue(item.mapLogo ?? mapInfo.logo),
      totalMatch,
      winCount: numberValue(item.winCount ?? item.win_num) ?? 0,
      totalKill: numberValue(item.totalKill ?? item.kill_num),
      adr: numberValue(item.adpr ?? item.adr),
      rating: numberValue(item.pw_rating_avg),
      rws: numberValue(item.rws_avg),
      totalAdr: numberValue(item.totalAdr),
      ratingSum: numberValue(item.ratingSum),
      rwsSum: numberValue(item.rwsSum),
      deathNum: numberValue(item.deathNum ?? item.death_num),
      firstKillNum: numberValue(item.firstKillNum ?? item.first_kill_num),
      firstDeathNum: numberValue(item.firstDeathNum ?? item.first_death_num),
      headshotKillNum: numberValue(item.headshotKillNum ?? item.headshot_kill_num),
      matchMvpNum: numberValue(item.matchMvpNum ?? item.match_mvp_num),
      twoKillNum: numberValue(item.twoKillNum ?? item.two_kill_num),
      threeKillNum: numberValue(item.threeKillNum ?? item.three_kill_num),
      fourKillNum: numberValue(item.fourKillNum ?? item.four_kill_num),
      fiveKillNum: numberValue(item.fiveKillNum ?? item.five_kill_num),
      roundCount: numberValue(item.roundCount ?? item.round_count),
      winRoundCount: numberValue(item.winRoundCount ?? item.win_round_count),
      ctRoundCount: numberValue(item.ctRoundCount ?? item.ct_rounds_num),
      ctWinRoundCount: numberValue(item.ctWinRoundCount ?? item.ct_win_rounds),
      tRoundCount: numberValue(item.tRoundCount ?? item.t_rounds_num),
      tWinRoundCount: numberValue(item.tWinRoundCount ?? item.t_win_rounds),
      sniperKillNum: numberValue(item.sniperKillNum ?? item.sniper_kill_num),
      teamKillNum: numberValue(item.teamKillNum ?? item.team_kill_num),
      firePower: numberValue(item.firePower ?? item.fire_power),
      priAvg: numberValue(item.priAvg ?? item.pri_avg),
      pistolWeSum: numberValue(item.pistolWeSum ?? item.pistol_we_sum),
      clutch1v1: numberValue(item.clutch1v1 ?? item['1v1_num']),
      clutch1v2: numberValue(item.clutch1v2 ?? item['1v2_num']),
      clutch1v3: numberValue(item.clutch1v3 ?? item['1v3_num']),
      clutch1v4: numberValue(item.clutch1v4 ?? item['1v4_num']),
      clutch1v5: numberValue(item.clutch1v5 ?? item['1v5_num']),
    }];
  });
}

function normalizeWeapons(value: unknown): PerfectWeaponSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const weaponInfo = objectValue(item.weapon_info);
    const name = stringValue(item.name ?? item.weaponName);
    const killNum = numberValue(item.killNum ?? item.weaponKill ?? item.kill_num);
    if (!name || killNum == null || killNum < 0) return [];
    return [{
      name,
      nameZh: stringValue(item.nameZh ?? item.weaponName ?? weaponInfo.name_cn),
      image: stringValue(item.image ?? item.weaponImage ?? weaponInfo.image ?? weaponInfo.user_page_image),
      killNum,
      matchNum: numberValue(item.matchNum ?? item.match_num),
      headshotSum: numberValue(item.headshotSum ?? item.weaponHeadShot ?? item.headshot_sum),
      headshotRate: numberValue(item.headshotRate ?? item.headshot_rate),
      damageSum: numberValue(item.damageSum ?? item.damage_sum),
      avgDamage: numberValue(item.avgDamage ?? item.avg_damage),
      avgKillNum: numberValue(item.avgKillNum ?? item.avg_kill_num),
      firstShotAccuracy: numberValue(item.firstShotAccuracy ?? item.first_shot_accuracy),
      avgTimeToKill: numberValue(item.avgTimeToKill ?? item.avg_time_to_kill),
      sprayAccuracy: numberValue(item.sprayAccuracy ?? item.spray_accuracy),
      rapidStopSuccessRate: numberValue(item.rapidStopSuccessRate ?? item.rapid_stop_success_rate),
      levelAvgTimeToKill: stringValue(item.levelAvgTimeToKill ?? item.level_avg_time_to_kill),
      levelAccuracy: stringValue(item.levelAccuracy ?? item.level_accuracy),
      levelAvgDamage: stringValue(item.levelAvgDamage ?? item.level_avg_damage),
      levelHeadshotRate: stringValue(item.levelHeadshotRate ?? item.level_headshot_rate),
      levelAvgKillNum: stringValue(item.levelAvgKillNum ?? item.level_avg_kill_num),
      levelRapidStopSuccessRate: stringValue(item.levelRapidStopSuccessRate ?? item.level_rapid_stop_success_rate),
      avgKillsPerRound: numberValue(item.avgKillsPerRound ?? item.avg_kills_per_round),
    }];
  }).sort((a, b) => b.killNum - a.killNum).slice(0, 8);
}

function normalizeRadar(value: unknown): PerfectPlayerStats['radar'] {
  if (!isObject(value)) return undefined;
  const normalized: NonNullable<PerfectPlayerStats['radar']> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isObject(raw)) continue;
    const score = numberValue(raw.score);
    if (score == null) continue;
    normalized[key] = { score, level: stringValue(raw.level) };
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

export function normalizePerfectPlayerStats(raw: unknown, expectedSteamId?: string): PerfectPlayerStats {
  const data = unwrapData(raw);
  const user = objectValue(data.user);
  const matchmaking = objectValue(data.matchmaking);
  const ladder = objectValue(data.ladder);
  const radar = objectValue(data.radar_new);
  const steamId = stringValue(data.steamId ?? user.steamId ?? user.uid) ?? expectedSteamId;
  if (!steamId || (expectedSteamId && steamId !== expectedSteamId)) {
    throw new Error('Perfect stats SteamID mismatch');
  }

  const history = numericArray(data.historyPwRatings).slice(0, 10);
  const recentPwRating = average(history);
  const recentStandardRatings = numericArray(data.historyRatings).slice(0, 10);
  const recentRwsValues = numericArray(data.historyRws).slice(0, 10);
  const recentWeValues = numericArray(data.weList).slice(0, 10);
  const recentScores = numericArray(data.historyScores).filter((value) => value > 0).slice(0, 10);
  const seasonPwRating = numberValue(data.pwRating ?? ladder.pw_rating_avg);
  const delta = recentPwRating != null && seasonPwRating != null ? recentPwRating - seasonPwRating : 0;
  const marksmanship = objectValue(radar.marksmanship);
  const firePower = objectValue(radar.fire_power);
  const firePowerDetail = objectValue(firePower.detail);
  const first = objectValue(radar.first);
  const sniper = objectValue(radar.sniper);
  const item = objectValue(radar.item);
  const ladderKills = numberValue(ladder.kill_num);
  const ladderDeaths = numberValue(ladder.death_num);
  const clutchValues = ['1v1_num', '1v2_num', '1v3_num', '1v4_num', '1v5_num']
    .map((key) => numberValue(ladder[key]))
    .filter((value): value is number => value != null);
  const capturedClutchWins = clutchValues.length
    ? clutchValues.reduce((sum, value) => sum + value, 0)
    : undefined;
  const combat = buildPerfectSeasonCombat(ladder, radar, data);

  return {
    steamId,
    zqId: stringValue(data.zqId ?? data.zQId ?? user.zqId ?? user.zQId),
    partialFailure: stringValue(data.partialFailure),
    seasonId: stringValue(data.seasonId ?? ladder.season),
    name: stringValue(data.name ?? user.name ?? user.nickname),
    avatar: stringValue(data.avatar ?? user.avatar),
    pvpScore: numberValue(data.pvpScore ?? matchmaking.score ?? ladder.score),
    currentSStars: numberValue(data.stars ?? ladder.curr_s_stars),
    allSeasonMaxScore: numberValue(data.all_season_max_score ?? ladder.all_season_max_score),
    allSeasonMaxStars: numberValue(data.all_season_max_star ?? ladder.all_season_max_star),
    allSeasonMaxScoreSeason: stringValue(data.all_season_max_score_season),
    seasonMatches: numberValue(data.cnt ?? ladder.match_count),
    kd: numberValue(data.kd) ?? ratio(ladderKills, ladderDeaths),
    winRate: numberValue(data.winRate ?? ladder.win_rate),
    standardRating: numberValue(data.rating ?? ladder.rating_avg),
    recentStandardRating: average(recentStandardRatings),
    recentStandardRatings,
    commonRating: numberValue(data.commonRating),
    pwRating: seasonPwRating,
    recentPwRating,
    recentPwRatings: history,
    ratingTrend: Math.abs(delta) < 0.03 ? 'flat' : delta > 0 ? 'up' : 'down',
    rws: numberValue(data.rws ?? ladder.rws_avg),
    recentRws: average(recentRwsValues),
    recentRwsValues,
    adr: numberValue(data.adr ?? ladder.adpr),
    headShotRatio: numberValue(data.headShotRatio ?? ladder.hs_kill_rate),
    firstKillSuccessRate: numberValue(data.firstKillSuccessRate)
      ?? ratio(ladder.first_kill_win_round, ladder.first_kill_num),
    rapidStopSuccessRate: numberValue(data.rapidStopSuccessRate)
      ?? ratio(ladder.rapid_stop_success_count, ladder.rapid_stop_try_count),
    reactionTime: numberValue(data.reactionTime)
      ?? ratio(ladder.reaction_time_total, ladder.reaction_time_count),
    entryKillRatio: numberValue(data.entryKillRatio) ?? ratio(ladder.first_kill_num, ladder.round_count),
    vs1WinRate: numberValue(data.vs1WinRate ?? ladder['1vx_rate']),
    kast: combat.kast,
    tradeFragRate: combat.tradeFragRate,
    clutch1v1Rate: combat.clutch1v1Rate,
    clutch1v1Attempts: combat.clutch1v1Attempts,
    matchMvpCount: combat.matchMvpCount,
    roundMvpCount: combat.roundMvpCount,
    seasonWinNum: combat.seasonWinNum,
    seasonDrawNum: combat.seasonDrawNum,
    combat,
    avgWe: numberValue(firePowerDetail.we_raw ?? data.avgWe),
    recentWe: average(recentWeValues),
    recentWeValues,
    recentScores,
    eloTrend: recentScores.length >= 2 ? recentScores[0] - recentScores[recentScores.length - 1] : undefined,
    kills: numberValue(data.kills ?? ladder.kill_num),
    deaths: numberValue(data.deaths ?? ladder.death_num),
    assists: numberValue(data.assists ?? ladder.assist_num),
    mvpCount: combat.matchMvpCount ?? numberValue(data.mvpCount),
    clutch1v1Total: numberValue(ladder['1v1_total']),
    clutch1v2Total: numberValue(ladder['1v2_total']),
    clutch1v3Total: numberValue(ladder['1v3_total']),
    clutch1v4Total: numberValue(ladder['1v4_total']),
    clutch1v5Total: numberValue(ladder['1v5_total']),
    clutchWins: numberValue(data.endingWin) ?? capturedClutchWins,
    clutch1v1: numberValue(data.vs1 ?? ladder['1v1_num']),
    clutch1v2: numberValue(data.vs2 ?? ladder['1v2_num']),
    clutch1v3: numberValue(data.vs3 ?? ladder['1v3_num']),
    clutch1v4: numberValue(data.vs4 ?? ladder['1v4_num']),
    clutch1v5: numberValue(data.vs5 ?? ladder['1v5_num']),
    multiKill2: numberValue(data.k2 ?? ladder.two_kill_num),
    multiKill3: numberValue(data.k3 ?? ladder.three_kill_num),
    multiKill4: numberValue(data.k4 ?? ladder.four_kill_num),
    multiKill5: numberValue(data.k5 ?? ladder.five_kill_num),
    hotMaps: normalizeHotMaps(Array.isArray(data.map) ? data.map : data.hotMaps),
    abilityProfile: {
      shot: numberValue(data.shot ?? marksmanship.score),
      victory: numberValue(data.victory ?? firePower.score),
      breach: numberValue(data.breach ?? first.score),
      snipe: numberValue(data.snipe ?? sniper.score),
      prop: numberValue(data.prop ?? item.score),
      summary: stringValue(data.summary ?? radar.description),
    },
    radar: normalizeRadar(data.radar_new),
    primaryWeapons: normalizeWeapons(
      Array.isArray(data.weapon)
        ? data.weapon
        : Array.isArray(data.hotWeapons2) && data.hotWeapons2.length ? data.hotWeapons2 : data.hotWeapons,
    ),
  };
}

function pumpQueue() {
  while (activeTasks < MAX_CONCURRENT_PLAYERS && queue.length) {
    const task = queue.shift()!;
    activeTasks += 1;
    void task.run().then(task.resolve, task.reject).finally(() => {
      activeTasks -= 1;
      pumpQueue();
    });
  }
}

function schedule<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ run, resolve, reject } as ScheduledTask<unknown>);
    pumpQueue();
  });
}

export function fetchPerfectPlayerStatsDetailed(steamId: string): Promise<PerfectPlayerStatsResult> {
  const existing = statsInFlight.get(steamId);
  if (existing) return existing;
  const request = schedule(async () => {
    const raw = await fetchPerfectPlayerStatsRaw(steamId);
    return {
      raw,
      stats: normalizePerfectPlayerStats(raw, steamId),
    };
  }).finally(() => statsInFlight.delete(steamId));
  statsInFlight.set(steamId, request);
  return request;
}

export function fetchPerfectPlayerStats(steamId: string): Promise<PerfectPlayerStats> {
  return fetchPerfectPlayerStatsDetailed(steamId).then((result) => result.stats);
}

function readBoardCache(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOARD_CACHE_KEY) ?? '{}') as unknown;
    if (!isObject(parsed)) return {};
    const cache: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') cache[key] = value;
    }
    return cache;
  } catch {
    return {};
  }
}

function writeBoardCache(cache: Record<string, string>) {
  try {
    localStorage.setItem(BOARD_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache failures must not block live player enrichment.
  }
}

export function getCachedPerfectBoardId(steamId: string): string | undefined {
  return readBoardCache()[steamId];
}

export function normalizePerfectBoardSearch(raw: unknown, steamId: string): PerfectBoardUser | null {
  if (!isObject(raw) || numberValue(raw.code) !== 0 || !Array.isArray(raw.result)) {
    throw new Error('Invalid Perfect board search response');
  }
  const exact: PerfectBoardUser[] = [];
  for (const group of raw.result) {
    if (!isObject(group) || group.itemType !== 'USER' || !Array.isArray(group.data)) continue;
    for (const item of group.data) {
      if (!isObject(item) || item.steamId64Str !== steamId) continue;
      const rawId = item.wanmeiId;
      const wanmeiId = typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0
        ? String(rawId)
        : typeof rawId === 'string' && /^\d+$/.test(rawId) && rawId !== '0' ? rawId : undefined;
      if (!wanmeiId) continue;
      exact.push({ steamId, wanmeiId, name: stringValue(item.name), avatar: stringValue(item.avatar) });
    }
  }
  if (!exact.length) return null;
  const ids = new Set(exact.map((item) => item.wanmeiId));
  if (ids.size !== 1) throw new Error('Ambiguous Perfect board identity');
  return exact[0];
}

export function resolvePerfectBoardUser(steamId: string): Promise<PerfectBoardUser | null> {
  const cached = getCachedPerfectBoardId(steamId);
  if (cached) return Promise.resolve({ steamId, wanmeiId: cached });
  const existing = boardInFlight.get(steamId);
  if (existing) return existing;
  const request = schedule(async () => {
    const user = normalizePerfectBoardSearch(await searchPerfectBoardUserRaw(steamId), steamId);
    if (user) writeBoardCache({ ...readBoardCache(), [steamId]: user.wanmeiId });
    return user;
  }).finally(() => boardInFlight.delete(steamId));
  boardInFlight.set(steamId, request);
  return request;
}
