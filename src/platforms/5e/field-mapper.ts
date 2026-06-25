import type { MatchPlayer } from '@core/match/models';
import type { P5eMatchBundle } from './types';
import {
  buildUuidTeamSideMap,
  calcFirstKillSuccessRate,
  calcHsRate,
  calcKd,
  extractAvatarFromMatchEntry,
  extractNicknameFromMatchEntry,
  extractSteamIdFromMatchEntry,
  getMatchEntryForUuid,
  hasMatchDetailTeams,
  parseUserSpecialLevel9,
} from './match-detail-parser';

export const P5E_AVATAR_CDN = 'https://oss-arena.5eplay.com/';

export interface P5eMapStats {
  mapName: string;
  matchTotal?: number;
  winTotal?: number;
  perWin?: number;
  recentPerWin?: number;
  rating?: number;
  adr?: number;
  rws?: number;
  level?: number;
  dexterity?: number;
}

export interface P5eSpecialStats {
  recentResults: Array<'win' | 'lose' | 'draw'>;
  recentWinRate?: number;
  recentDrawCount: number;
  latest10WinNum?: number;
  latest10TotalNum?: number;
  continuedWins?: number;
  recentRatings: number[];
}

export function numOrUndef(raw: unknown): number | undefined {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() && !Number.isNaN(Number(raw))) return Number(raw);
  return undefined;
}

export function roundScore(n: number | undefined): number | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  return Math.round(n * 100) / 100;
}

export function normalizeP5eAvatar(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `${P5E_AVATAR_CDN}${trimmed.replace(/^\//, '')}`;
}

function getApiData(
  payload: { responseBody?: unknown } | undefined,
): Record<string, Record<string, unknown>> | undefined {
  const root = payload?.responseBody;
  if (!root || typeof root !== 'object') return undefined;

  const asRecord = root as Record<string, unknown>;
  const data = asRecord.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, Record<string, unknown>>;
  }

  const keys = Object.keys(asRecord);
  if (keys.length > 0 && keys[0].includes('-')) {
    return asRecord as Record<string, Record<string, unknown>>;
  }

  return undefined;
}

function getUserRecord(
  payload: { responseBody?: unknown } | undefined,
  uuid: string,
): Record<string, unknown> | undefined {
  const data = getApiData(payload);
  if (!data) return undefined;

  const direct = data[uuid];
  if (direct && typeof direct === 'object') return direct;

  for (const value of Object.values(data)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    if (record.uuid === uuid) return record;
  }

  return undefined;
}

function pickUsername(
  userData: Record<string, unknown> | undefined,
  matchNickname: string | undefined,
  index: number,
): string {
  if (matchNickname) return matchNickname;
  const raw = userData?.username;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return `玩家${index + 1}`;
}

function mapFromMatchDetail(bundle: P5eMatchBundle): string | undefined {
  const detail = bundle.matchDetail;
  if (!detail || typeof detail !== 'object') return undefined;
  const data = (detail as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return undefined;
  const main = (data as Record<string, unknown>).main;
  if (!main || typeof main !== 'object') return undefined;
  const map = (main as Record<string, unknown>).map;
  return typeof map === 'string' && map.length > 0 ? map : undefined;
}

export function resolveMatchMap(bundle: P5eMatchBundle): string | undefined {
  if (bundle.mapName) return bundle.mapName;
  const fromMatch = mapFromMatchDetail(bundle);
  if (fromMatch) return fromMatch;

  const data = getApiData(bundle.mapExt);
  if (!data) return undefined;

  const votes = new Map<string, number>();
  for (const uuid of bundle.uuids) {
    const playerMaps = data[uuid];
    if (!playerMaps || typeof playerMaps !== 'object') continue;
    for (const [mapName, raw] of Object.entries(playerMaps)) {
      if (!raw || typeof raw !== 'object') continue;
      const total = numOrUndef((raw as Record<string, unknown>).matchTotal) ?? 0;
      if (total > 0) votes.set(mapName, (votes.get(mapName) ?? 0) + 1);
    }
  }

  let bestMap: string | undefined;
  let bestVotes = 0;
  for (const [mapName, count] of votes) {
    if (count > bestVotes) {
      bestVotes = count;
      bestMap = mapName;
    }
  }
  return bestMap;
}

function parseMapEntry(mapName: string, raw: Record<string, unknown>): P5eMapStats {
  return {
    mapName,
    matchTotal: numOrUndef(raw.matchTotal),
    winTotal: numOrUndef(raw.winTotal),
    perWin: numOrUndef(raw.perWin),
    recentPerWin: numOrUndef(raw.recentPerWin),
    rating: numOrUndef(raw.rating),
    adr: numOrUndef(raw.adr),
    rws: numOrUndef(raw.rws),
    level: numOrUndef(raw.level),
    dexterity: numOrUndef(raw.dexterity),
  };
}

export function pickMapStats(
  mapData: Record<string, unknown> | undefined,
  preferredMap?: string,
): P5eMapStats | undefined {
  if (!mapData) return undefined;

  if (preferredMap && mapData[preferredMap] && typeof mapData[preferredMap] === 'object') {
    return parseMapEntry(preferredMap, mapData[preferredMap] as Record<string, unknown>);
  }

  let best: P5eMapStats | undefined;
  for (const [mapName, raw] of Object.entries(mapData)) {
    if (!raw || typeof raw !== 'object') continue;
    const parsed = parseMapEntry(mapName, raw as Record<string, unknown>);
    const total = parsed.matchTotal ?? 0;
    if (total <= 0) continue;
    if (!best || (parsed.matchTotal ?? 0) > (best.matchTotal ?? 0)) {
      best = parsed;
    }
  }
  return best;
}

export function parseP5eSpecialData(raw: unknown): P5eSpecialStats {
  const empty: P5eSpecialStats = {
    recentResults: [],
    recentDrawCount: 0,
    recentRatings: [],
  };
  if (typeof raw !== 'string' || !raw.trim()) return empty;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const list = Array.isArray(parsed.match_data) ? parsed.match_data : [];
    const recentResults: Array<'win' | 'lose' | 'draw'> = [];
    const recentRatings: number[] = [];

    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const matchId = typeof row.match_id === 'string' ? row.match_id : '';
      const isWin = numOrUndef(row.is_win);
      const changeElo = numOrUndef(row.change_elo);

      if (matchId) {
        if (isWin === 1) recentResults.push('win');
        else if (isWin === -1) recentResults.push('lose');
        else recentResults.push('draw');
        if (changeElo != null) recentRatings.push(changeElo);
      }
    }

    const wins = recentResults.filter((r) => r === 'win').length;
    const losses = recentResults.filter((r) => r === 'lose').length;
    const draws = recentResults.filter((r) => r === 'draw').length;
    const counted = wins + losses;

    let continuedWins = 0;
    for (const result of recentResults) {
      if (result === 'win') continuedWins += 1;
      else break;
    }

    return {
      recentResults,
      recentWinRate: counted > 0 ? wins / counted : undefined,
      recentDrawCount: draws,
      latest10WinNum: wins,
      latest10TotalNum: recentResults.length,
      continuedWins: continuedWins > 0 ? continuedWins : undefined,
      recentRatings,
    };
  } catch {
    return empty;
  }
}

function parseLevel9Rating(userData?: Record<string, unknown>): number | undefined {
  const level9 = parseUserSpecialLevel9(userData);
  if (!level9) return undefined;
  return numOrUndef(level9.rating);
}

function isP5eVip(userData?: Record<string, unknown>): boolean {
  if (!userData) return false;
  if (numOrUndef(userData.is_plus) === 1) return true;
  if ((numOrUndef(userData.vip_level) ?? 0) > 0) return true;
  return (numOrUndef(userData.vip_grade) ?? 0) > 1;
}

export function buildP5ePlayer(
  uuid: string,
  index: number,
  bundle: P5eMatchBundle,
  matchMap?: string,
  teamSideOverride?: number,
): MatchPlayer {
  const mapName = matchMap ?? resolveMatchMap(bundle);
  const matchEntry = getMatchEntryForUuid(bundle, uuid);
  const fight = matchEntry?.fight;
  const sts = matchEntry?.sts;
  const levelInfo = matchEntry?.level_info;

  const userData = getUserRecord(bundle.userInfo, uuid);
  const eloData = getApiData(bundle.eloInfo)?.[uuid];
  const modeKey = String(bundle.matchMode?.[0] ?? '9');
  const modeInfo = (eloData?.modes as Record<string, Record<string, unknown>> | undefined)?.[modeKey];

  const playerMaps = getApiData(bundle.mapExt)?.[uuid];
  const mapStats = pickMapStats(playerMaps, mapName);

  const special = parseP5eSpecialData(modeInfo?.specialData);

  const matchNickname = extractNicknameFromMatchEntry(matchEntry ?? {});
  const steamId =
    extractSteamIdFromMatchEntry(matchEntry ?? {})
    ?? String(userData?.steam_id ?? '');
  const nickname = pickUsername(userData, matchNickname, index);

  const score =
    roundScore(numOrUndef(modeInfo?.elo))
    ?? roundScore(numOrUndef(userData?.csgo_elo_9))
    ?? roundScore(numOrUndef(userData?.csgo_elo));

  const fightRating = numOrUndef(fight?.rating);
  const level9Rating = parseLevel9Rating(userData);
  const mapRating = mapStats?.rating;
  const csgoRating = numOrUndef(userData?.csgo_rating);

  const seasonRating = fightRating ?? mapRating;
  const rating =
    level9Rating
    ?? mapRating
    ?? (csgoRating && csgoRating > 0 ? csgoRating : undefined);

  const adpr = numOrUndef(fight?.adr) ?? mapStats?.adr;
  const weRaw = numOrUndef(fight?.rws) ?? mapStats?.rws;
  const kd = calcKd(fight);
  const hsRate = calcHsRate(fight);
  const firstKillSuccessRate = calcFirstKillSuccessRate(fight);

  const mapTotal = mapStats?.matchTotal;
  const mapWin = mapStats?.winTotal;
  const mapWinRate =
    mapStats?.perWin != null
      ? mapStats.perWin
      : mapTotal && mapTotal > 0 && mapWin != null
        ? mapWin / mapTotal
        : undefined;

  const recentWinRate = special.recentWinRate ?? mapStats?.recentPerWin ?? mapStats?.perWin;

  const levelId = numOrUndef(modeInfo?.levelId) ?? numOrUndef(levelInfo?.level_id);
  const rank = numOrUndef(sts?.rank) ?? numOrUndef(levelInfo?.rank) ?? numOrUndef(modeInfo?.rank);
  const maxElo = roundScore(numOrUndef(modeInfo?.maxElo));
  const season = typeof modeInfo?.season === 'string' ? modeInfo.season : undefined;
  const eloChange = roundScore(numOrUndef(sts?.change_elo));

  const levelName =
    typeof levelInfo?.level_name === 'string' && levelInfo.level_name.trim()
      ? levelInfo.level_name.trim()
      : undefined;

  const tags: string[] = [];
  if (season) tags.push(season);
  if (levelName) tags.push(levelName);
  else if (levelId != null && levelId > 0) tags.push(`Lv.${levelId}`);
  if (rank != null && rank > 0) tags.push(`#${rank}`);
  if (maxElo != null && maxElo > 0 && score != null && maxElo > score) {
    tags.push(`峰值 ${maxElo}`);
  }
  if (eloChange != null && eloChange !== 0) {
    tags.push(eloChange > 0 ? `+${eloChange} ELO` : `${eloChange} ELO`);
  }
  if (mapStats?.level != null && mapStats.level > 0) {
    tags.push(`地图 Lv.${mapStats.level}`);
  }
  if (numOrUndef(userData?.is_plus) === 1) tags.push('Plus');
  const credit = numOrUndef(userData?.credit_score);
  if (credit != null && credit < 100000) tags.push(`信用 ${Math.round(credit / 1000)}k`);

  let rankLevel: string | undefined;
  if (levelName) rankLevel = levelName;
  else if (levelId != null && levelId > 0) rankLevel = `${season ?? '5e'} Lv.${levelId}`;
  else rankLevel = season;

  const rankNum = rank != null && rank > 0 ? Math.round(rank) : undefined;

  let rankDesc: string | undefined;
  if (levelName && rank != null && rank > 0) {
    rankDesc = `${levelName} #${rank}`;
  } else if (levelName) {
    rankDesc = levelName;
  } else if (levelId != null && levelId > 0) {
    rankDesc = `${season ?? '5e'} Lv.${levelId}${rank != null && rank > 0 ? ` #${rank}` : ''}`;
  } else {
    rankDesc = season;
  }

  const teamSideMap = buildUuidTeamSideMap(bundle);
  const useDetailTeams = hasMatchDetailTeams(bundle);
  const mappedSide = teamSideMap.get(uuid);
  const teamSide =
    teamSideOverride
    ?? mappedSide
    ?? (useDetailTeams ? 0 : index < 5 ? 1 : 2);

  const matchAvatar = extractAvatarFromMatchEntry(matchEntry ?? {});

  const domainRaw = userData?.domain;
  const platformBoardId =
    typeof domainRaw === 'string' && domainRaw.trim() ? domainRaw.trim().toLowerCase() : undefined;

  return {
    steamId: steamId || `5e-${uuid.slice(0, 8)}`,
    nickname,
    avatar: normalizeP5eAvatar(matchAvatar ?? userData?.avatar_url),
    score,
    teamSide,
    isSingle: false,
    isVip: isP5eVip(userData),
    rating,
    seasonRating,
    adpr,
    kd,
    hsRate,
    firstKillSuccessRate,
    weRaw,
    recentWinRate,
    recentDrawCount: special.recentDrawCount,
    seasonTotalNum: numOrUndef(modeInfo?.matchTotal) ?? numOrUndef(userData?.csgo_match_count_9),
    mapWinRate,
    mapWinNum: mapWin,
    mapTotalNum: mapTotal,
    mapSampleLow: mapTotal != null && mapTotal > 0 && mapTotal < 3,
    latest10WinNum: special.latest10WinNum,
    latest10TotalNum: special.latest10TotalNum,
    continuedWins: special.continuedWins,
    eloChange,
    rankDesc,
    rankLevel,
    rankNum,
    radar: {},
    recentResults: special.recentResults,
    recentRatings: special.recentRatings,
    tags,
    platformBoardId,
  };
}
