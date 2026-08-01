import { fetchPerfectPlayerStatsRaw, searchPerfectBoardUserRaw } from '../../mainview/native';
import type { PerfectHotMap, PerfectWeaponSummary } from '@core/match/models';
import type { PerfectBoardUser, PerfectPlayerStats } from './types';

const BOARD_CACHE_KEY = 'cs-match-helper.perfect-board-id-cache-v1';
const MAX_CONCURRENT_PLAYERS = 4;

type JsonObject = Record<string, unknown>;
type ScheduledTask<T> = { run: () => Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void };

const statsInFlight = new Map<string, Promise<PerfectPlayerStats>>();
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
    const map = stringValue(item.map);
    const totalMatch = numberValue(item.totalMatch);
    if (!map || totalMatch == null || totalMatch < 0) return [];
    return [{
      map,
      mapName: stringValue(item.mapName),
      mapImage: stringValue(item.mapImage),
      mapLogo: stringValue(item.mapLogo),
      totalMatch,
      winCount: numberValue(item.winCount) ?? 0,
      totalKill: numberValue(item.totalKill),
      totalAdr: numberValue(item.totalAdr),
      ratingSum: numberValue(item.ratingSum),
      rwsSum: numberValue(item.rwsSum),
      deathNum: numberValue(item.deathNum),
      firstKillNum: numberValue(item.firstKillNum),
      firstDeathNum: numberValue(item.firstDeathNum),
      headshotKillNum: numberValue(item.headshotKillNum),
      matchMvpNum: numberValue(item.matchMvpNum),
      threeKillNum: numberValue(item.threeKillNum),
      fourKillNum: numberValue(item.fourKillNum),
      fiveKillNum: numberValue(item.fiveKillNum),
    }];
  });
}

function normalizeWeapons(value: unknown): PerfectWeaponSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const name = stringValue(item.name ?? item.weaponName);
    const killNum = numberValue(item.killNum ?? item.weaponKill);
    if (!name || killNum == null || killNum < 0) return [];
    return [{
      name,
      nameZh: stringValue(item.nameZh ?? item.weaponName),
      image: stringValue(item.image ?? item.weaponImage),
      killNum,
      matchNum: numberValue(item.matchNum),
      headshotSum: numberValue(item.headshotSum ?? item.weaponHeadShot),
      headshotRate: numberValue(item.headshotRate),
      damageSum: numberValue(item.damageSum),
      avgDamage: numberValue(item.avgDamage),
      firstShotAccuracy: numberValue(item.firstShotAccuracy),
      avgTimeToKill: numberValue(item.avgTimeToKill),
      sprayAccuracy: numberValue(item.sprayAccuracy),
      levelAvgTimeToKill: stringValue(item.levelAvgTimeToKill),
      levelAccuracy: stringValue(item.levelAccuracy),
      levelAvgDamage: stringValue(item.levelAvgDamage),
      levelHeadshotRate: stringValue(item.levelHeadshotRate),
      levelAvgKillNum: stringValue(item.levelAvgKillNum),
    }];
  }).sort((a, b) => b.killNum - a.killNum).slice(0, 8);
}

export function normalizePerfectPlayerStats(raw: unknown, expectedSteamId?: string): PerfectPlayerStats {
  const data = unwrapData(raw);
  const steamId = stringValue(data.steamId) ?? expectedSteamId;
  if (!steamId || (expectedSteamId && steamId !== expectedSteamId)) {
    throw new Error('Perfect stats SteamID mismatch');
  }

  const history = numericArray(data.historyPwRatings).slice(0, 10);
  const recentPwRating = average(history);
  const recentStandardRatings = numericArray(data.historyRatings).slice(0, 10);
  const recentRwsValues = numericArray(data.historyRws).slice(0, 10);
  const recentWeValues = numericArray(data.weList).slice(0, 10);
  const recentScores = numericArray(data.historyScores).filter((value) => value > 0).slice(0, 10);
  const seasonPwRating = numberValue(data.pwRating);
  const delta = recentPwRating != null && seasonPwRating != null ? recentPwRating - seasonPwRating : 0;

  return {
    steamId,
    seasonId: stringValue(data.seasonId),
    name: stringValue(data.name),
    avatar: stringValue(data.avatar),
    pvpScore: numberValue(data.pvpScore),
    seasonMatches: numberValue(data.cnt),
    kd: numberValue(data.kd),
    winRate: numberValue(data.winRate),
    standardRating: numberValue(data.rating),
    recentStandardRating: average(recentStandardRatings),
    recentStandardRatings,
    commonRating: numberValue(data.commonRating),
    pwRating: seasonPwRating,
    recentPwRating,
    recentPwRatings: history,
    ratingTrend: Math.abs(delta) < 0.03 ? 'flat' : delta > 0 ? 'up' : 'down',
    rws: numberValue(data.rws),
    recentRws: average(recentRwsValues),
    recentRwsValues,
    adr: numberValue(data.adr),
    headShotRatio: numberValue(data.headShotRatio),
    entryKillRatio: numberValue(data.entryKillRatio),
    vs1WinRate: numberValue(data.vs1WinRate),
    avgWe: numberValue(data.avgWe),
    recentWe: average(recentWeValues),
    recentWeValues,
    recentScores,
    eloTrend: recentScores.length >= 2 ? recentScores[0] - recentScores[recentScores.length - 1] : undefined,
    kills: numberValue(data.kills),
    deaths: numberValue(data.deaths),
    assists: numberValue(data.assists),
    mvpCount: numberValue(data.mvpCount),
    clutchWins: numberValue(data.endingWin),
    clutch1v1: numberValue(data.vs1),
    clutch1v2: numberValue(data.vs2),
    clutch1v3: numberValue(data.vs3),
    clutch1v4: numberValue(data.vs4),
    clutch1v5: numberValue(data.vs5),
    multiKill2: numberValue(data.k2),
    multiKill3: numberValue(data.k3),
    multiKill4: numberValue(data.k4),
    multiKill5: numberValue(data.k5),
    hotMaps: normalizeHotMaps(data.hotMaps),
    abilityProfile: {
      shot: numberValue(data.shot),
      victory: numberValue(data.victory),
      breach: numberValue(data.breach),
      snipe: numberValue(data.snipe),
      prop: numberValue(data.prop),
      summary: stringValue(data.summary),
    },
    primaryWeapons: normalizeWeapons(
      Array.isArray(data.hotWeapons2) && data.hotWeapons2.length ? data.hotWeapons2 : data.hotWeapons,
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

export function fetchPerfectPlayerStats(steamId: string): Promise<PerfectPlayerStats> {
  const existing = statsInFlight.get(steamId);
  if (existing) return existing;
  const request = schedule(async () => normalizePerfectPlayerStats(
    await fetchPerfectPlayerStatsRaw(steamId),
    steamId,
  )).finally(() => statsInFlight.delete(steamId));
  statsInFlight.set(steamId, request);
  return request;
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
