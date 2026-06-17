import type { P5eMatchBundle } from './types';
import type { P5eMatchDetailResponse } from './match-api';
import { numOrUndef } from './field-mapper';

export interface P5ePlayerMatchEntry {
  fight?: Record<string, unknown>;
  sts?: Record<string, unknown>;
  level_info?: Record<string, unknown>;
  user_info?: Record<string, unknown>;
}

function asRecord(raw: unknown): Record<string, unknown> | undefined {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined;
}

export function getMatchDetailData(bundle: P5eMatchBundle): Record<string, unknown> | undefined {
  const detail = bundle.matchDetail as P5eMatchDetailResponse | undefined;
  return asRecord(detail?.data);
}

export function resolveMapDescFromMatchDetail(bundle: P5eMatchBundle): string | undefined {
  const main = asRecord(getMatchDetailData(bundle)?.main);
  const desc = main?.map_desc;
  return typeof desc === 'string' && desc.trim() ? desc.trim() : undefined;
}

function parseGroupEntries(raw: unknown): P5ePlayerMatchEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      fight: asRecord(item.fight),
      sts: asRecord(item.sts),
      level_info: asRecord(item.level_info),
      user_info: asRecord(item.user_info),
    }));
}

export function extractUuidFromMatchEntry(
  entry: P5ePlayerMatchEntry,
  uidToUuid?: Map<string, string>,
): string | undefined {
  const userInfo = asRecord(entry.user_info);
  const userData = asRecord(userInfo?.user_data);
  const uuid = userData?.uuid;
  if (typeof uuid === 'string' && uuid.length > 0) return uuid;

  const fight = asRecord(entry.fight);
  const uid = fight?.uid;
  if (uid != null && uidToUuid) {
    const mapped = uidToUuid.get(String(uid));
    if (mapped) return mapped;
  }
  return undefined;
}

export function extractSteamIdFromMatchEntry(entry: P5ePlayerMatchEntry): string | undefined {
  const userInfo = asRecord(entry.user_info);
  const userData = asRecord(userInfo?.user_data);
  const steam = asRecord(userData?.steam);
  const steamId = steam?.steamId ?? userData?.steam_id;
  return typeof steamId === 'string' && steamId.length > 0 ? steamId : undefined;
}

export function extractNicknameFromMatchEntry(entry: P5ePlayerMatchEntry): string | undefined {
  const userInfo = asRecord(entry.user_info);
  const userData = asRecord(userInfo?.user_data);
  const username = userData?.username;
  return typeof username === 'string' && username.trim() ? username.trim() : undefined;
}

export function extractAvatarFromMatchEntry(entry: P5ePlayerMatchEntry): string | undefined {
  const userInfo = asRecord(entry.user_info);
  const userData = asRecord(userInfo?.user_data);
  const profile = asRecord(userData?.profile);
  const avatar = profile?.avatarUrl ?? userData?.avatar_url;
  return typeof avatar === 'string' && avatar.length > 0 ? avatar : undefined;
}

function getUserApiData(bundle: P5eMatchBundle): Record<string, Record<string, unknown>> | undefined {
  const body = bundle.userInfo?.responseBody;
  if (!body || typeof body !== 'object') return undefined;
  const data = (body as Record<string, unknown>).data;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, Record<string, unknown>>)
    : undefined;
}

/** fight.uid / sts.uid → bundle uuid */
export function buildUidToUuidMap(bundle: P5eMatchBundle): Map<string, string> {
  const map = new Map<string, string>();
  const data = getUserApiData(bundle);
  if (!data) return map;
  for (const [uuid, row] of Object.entries(data)) {
    const uid = row?.uid;
    if (uid != null && String(uid).length > 0) map.set(String(uid), uuid);
  }
  return map;
}

/** uuid → 1 | 2，来自 group_1 / group_2 */
export function buildUuidTeamSideMap(bundle: P5eMatchBundle): Map<string, number> {
  const map = new Map<string, number>();
  const data = getMatchDetailData(bundle);
  if (!data) return map;

  const uidToUuid = buildUidToUuidMap(bundle);

  for (const entry of parseGroupEntries(data.group_1)) {
    const uuid = extractUuidFromMatchEntry(entry, uidToUuid);
    if (uuid) map.set(uuid, 1);
  }
  for (const entry of parseGroupEntries(data.group_2)) {
    const uuid = extractUuidFromMatchEntry(entry, uidToUuid);
    if (uuid) map.set(uuid, 2);
  }
  return map;
}

/** 全部 10 人按 match 详情 5v5 分队时才可信 */
export function isCompleteMatchDetailTeams(bundle: P5eMatchBundle): boolean {
  const sideMap = buildUuidTeamSideMap(bundle);
  if (sideMap.size < bundle.uuids.length) return false;
  const allMapped = bundle.uuids.every((uuid) => sideMap.has(uuid));
  if (!allMapped) return false;
  const side1 = bundle.uuids.filter((uuid) => sideMap.get(uuid) === 1).length;
  const side2 = bundle.uuids.filter((uuid) => sideMap.get(uuid) === 2).length;
  return side1 === 5 && side2 === 5;
}

export function getMatchEntryForUuid(
  bundle: P5eMatchBundle,
  uuid: string,
): P5ePlayerMatchEntry | undefined {
  const data = getMatchDetailData(bundle);
  if (!data) return undefined;

  const uidToUuid = buildUidToUuidMap(bundle);

  for (const entry of [
    ...parseGroupEntries(data.group_1),
    ...parseGroupEntries(data.group_2),
  ]) {
    if (extractUuidFromMatchEntry(entry, uidToUuid) === uuid) return entry;
  }
  return undefined;
}

export function hasMatchDetailTeams(bundle: P5eMatchBundle): boolean {
  return isCompleteMatchDetailTeams(bundle);
}

export function calcKd(fight?: Record<string, unknown>): number | undefined {
  if (!fight) return undefined;
  const kill = numOrUndef(fight.kill);
  const death = numOrUndef(fight.death);
  if (kill == null) return undefined;
  const denom = Math.max(death ?? 0, 1);
  return Math.round((kill / denom) * 100) / 100;
}

export function calcHsRate(fight?: Record<string, unknown>): number | undefined {
  if (!fight) return undefined;
  const perHeadshot = numOrUndef(fight.per_headshot);
  if (perHeadshot != null) return perHeadshot > 1 ? perHeadshot / 100 : perHeadshot;
  const kill = numOrUndef(fight.kill);
  const headshot = numOrUndef(fight.headshot);
  if (kill == null || kill <= 0 || headshot == null) return undefined;
  return headshot / kill;
}

export function calcFirstKillSuccessRate(fight?: Record<string, unknown>): number | undefined {
  if (!fight) return undefined;
  const firstKill = numOrUndef(fight.first_kill);
  const firstDeath = numOrUndef(fight.first_death);
  if (firstKill == null && firstDeath == null) return undefined;
  const denom = Math.max((firstKill ?? 0) + (firstDeath ?? 0), 1);
  return (firstKill ?? 0) / denom;
}

export function parseUserSpecialLevel9(userData?: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = userData?.special_data;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const level9 = parsed.csgo_level_id_9;
    return asRecord(level9);
  } catch {
    return undefined;
  }
}
