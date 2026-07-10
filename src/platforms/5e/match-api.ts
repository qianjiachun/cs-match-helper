import { fetch5eMatchDetail } from '@core/platform/5e';
import { resolveWsMapName } from './game-context';
import {
  extractUuidFromMatchEntry,
  parseGroupEntries,
} from './match-detail-parser';
import type { P5eMatchBundle } from './types';

function parseMatchIdsFromSpecialData(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const list = Array.isArray(parsed.match_data) ? parsed.match_data : [];
    const ids: string[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const matchId = (item as Record<string, unknown>).match_id;
      if (typeof matchId === 'string' && matchId.length > 0) ids.push(matchId);
    }
    return ids;
  } catch {
    return [];
  }
}

export interface P5eMatchDetailMain {
  map?: string;
  map_desc?: string;
  match_code?: string;
}

export interface P5eMatchDetailResponse {
  code?: number;
  success?: boolean;
  data?: {
    main?: P5eMatchDetailMain;
    group_1?: unknown;
    group_2?: unknown;
    [key: string]: unknown;
  };
}

function getEloData(bundle: P5eMatchBundle): Record<string, unknown> | undefined {
  const body = bundle.eloInfo?.responseBody;
  if (!body || typeof body !== 'object') return undefined;
  const data = (body as Record<string, unknown>).data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
}

/** 从 elo batch 的 specialData.match_data 收集 match_code */
export function extractP5eMatchCodes(bundle: P5eMatchBundle): string[] {
  const data = getEloData(bundle);
  if (!data) return [];

  const codes: string[] = [];
  for (const uuid of bundle.uuids) {
    const row = data[uuid];
    if (!row || typeof row !== 'object') continue;
    const modes = (row as Record<string, unknown>).modes;
    if (!modes || typeof modes !== 'object') continue;
    const mode9 = (modes as Record<string, unknown>)['9'];
    if (!mode9 || typeof mode9 !== 'object') continue;
    const special = (mode9 as Record<string, unknown>).specialData;
    if (typeof special !== 'string' || !special) continue;
    codes.push(...parseMatchIdsFromSpecialData(special));
  }
  return codes;
}

/** 优先取最后一个有效 match_code（通常为最近对局） */
export function pickLatestMatchCode(codes: string[]): string | undefined {
  for (let i = codes.length - 1; i >= 0; i--) {
    const code = codes[i];
    if (code && /^g\d+-/.test(code)) return code;
  }
  return codes.find((c) => c && c.length > 0);
}

export function resolveMapFromMatchDetail(detail: P5eMatchDetailResponse | undefined): string | undefined {
  const map = detail?.data?.main?.map;
  return typeof map === 'string' && map.length > 0 ? map : undefined;
}

export function extractUuidsFromMatchDetail(detail: P5eMatchDetailResponse | undefined): string[] {
  const data = detail?.data;
  if (!data || typeof data !== 'object') return [];
  const uuids = new Set<string>();
  const uidToUuid = new Map<string, string>();

  for (const entry of [
    ...parseGroupEntries(data.group_1),
    ...parseGroupEntries(data.group_2),
  ]) {
    const uuid = extractUuidFromMatchEntry(entry, uidToUuid);
    if (uuid) uuids.add(uuid);
  }
  return [...uuids];
}

export interface P5eMatchDetailValidation {
  ok: boolean;
  reason?: string;
  matchCode?: string;
  mapName?: string;
}

export function validateP5eMatchDetail(
  detail: P5eMatchDetailResponse | undefined,
  bundle: P5eMatchBundle,
): P5eMatchDetailValidation {
  if (!detail?.data) return { ok: false, reason: 'empty_detail' };

  const detailUuids = extractUuidsFromMatchDetail(detail);
  const expected = new Set(bundle.uuids);
  if (detailUuids.length > 0) {
    if (detailUuids.length !== expected.size) {
      return { ok: false, reason: 'uuid_count_mismatch' };
    }
    for (const uuid of detailUuids) {
      if (!expected.has(uuid)) return { ok: false, reason: 'uuid_set_mismatch' };
    }
  }

  const matchCode = detail.data.main?.match_code;
  const gameId = bundle.gameId ?? bundle.wsAnchor?.gameId;
  if (gameId && typeof matchCode === 'string' && matchCode.length > 0) {
    if (matchCode !== gameId && !matchCodesMayCorrespond(gameId, matchCode)) {
      return { ok: false, reason: 'match_code_mismatch' };
    }
  }

  const mapName = resolveMapFromMatchDetail(detail);
  return {
    ok: true,
    matchCode: typeof matchCode === 'string' ? matchCode : undefined,
    mapName,
  };
}

/** 不做字符串截取猜测；仅允许完全一致或同局双 ID 完全相等 */
export function matchCodesMayCorrespond(gameId: string, matchCode: string): boolean {
  return gameId === matchCode;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { times?: number; delayMs?: number },
): Promise<T> {
  const times = options?.times ?? 2;
  const delayMs = options?.delayMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= times; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < times) await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastErr;
}

function resolveMatchDetailQueryId(bundle: P5eMatchBundle): string | undefined {
  return bundle.gameId ?? bundle.wsAnchor?.gameId ?? bundle.matchCode ?? pickLatestMatchCode(extractP5eMatchCodes(bundle));
}

/** 通过 match 接口实时拉取地图并写入 bundle */
export async function enrichP5eBundleWithLiveMap(bundle: P5eMatchBundle): Promise<P5eMatchBundle> {
  if (bundle.mapName) return bundle;

  const cachedValidation = validateP5eMatchDetail(
    bundle.matchDetail as P5eMatchDetailResponse | undefined,
    bundle,
  );
  if (cachedValidation.ok && cachedValidation.mapName) {
    return {
      ...bundle,
      matchCode: cachedValidation.matchCode ?? bundle.matchCode,
      mapName: cachedValidation.mapName,
    };
  }

  const queryId = resolveMatchDetailQueryId(bundle);
  if (!queryId) {
    const wsMap = resolveWsMapName(bundle.wsAnchor);
    return wsMap ? { ...bundle, mapName: wsMap } : bundle;
  }

  try {
    const detail = await withRetry(() => fetchP5eMatchDetailValidated(queryId, bundle));
    const validation = validateP5eMatchDetail(detail, bundle);
    if (!validation.ok) {
      const wsMap = resolveWsMapName(bundle.wsAnchor);
      return wsMap ? { ...bundle, mapName: wsMap } : bundle;
    }

    const gateMap = validation.mapName;
    const wsMap = resolveWsMapName(bundle.wsAnchor);
    let mapConflictWarning: string | undefined;
    let mapName = gateMap ?? wsMap;
    if (gateMap && wsMap && gateMap !== wsMap) {
      mapConflictWarning = `Gate 地图 ${gateMap} 与 WS 候选 ${wsMap} 不一致，已采用 Gate`;
      mapName = gateMap;
    }

    return {
      ...bundle,
      matchCode: validation.matchCode ?? bundle.matchCode,
      matchDetail: detail,
      mapName,
      mapConflictWarning,
    };
  } catch {
    const wsMap = resolveWsMapName(bundle.wsAnchor);
    return wsMap ? { ...bundle, mapName: wsMap } : bundle;
  }
}

const matchDetailCache = new Map<string, Promise<P5eMatchDetailResponse>>();

async function fetchP5eMatchDetailValidated(
  matchCode: string,
  bundle: P5eMatchBundle,
): Promise<P5eMatchDetailResponse> {
  const detail = await fetchP5eMatchDetailCached(matchCode, { allowNoMap: true });
  const validation = validateP5eMatchDetail(detail, bundle);
  if (!validation.ok) {
    matchDetailCache.delete(matchCode.trim());
    throw new Error(validation.reason ?? 'invalid_match_detail');
  }
  if (!validation.mapName) {
    matchDetailCache.delete(matchCode.trim());
    throw new Error('map_not_ready');
  }
  return detail;
}

/** 同一 match_code 只发起一次网络请求（并发调用共享同一 Promise） */
export function fetchP5eMatchDetailCached(
  matchCode: string,
  options?: { allowNoMap?: boolean },
): Promise<P5eMatchDetailResponse> {
  const code = matchCode.trim();
  let pending = matchDetailCache.get(code);
  if (!pending) {
    pending = fetch5eMatchDetail(code)
      .then((response) => {
        const detail = response as P5eMatchDetailResponse;
        if (!options?.allowNoMap && !resolveMapFromMatchDetail(detail)) {
          matchDetailCache.delete(code);
          throw new Error('map_not_ready');
        }
        return detail;
      })
      .catch((err) => {
        matchDetailCache.delete(code);
        throw err;
      });
    matchDetailCache.set(code, pending);
  }
  return pending;
}

/** 仅用于测试 */
export function clearP5eMatchDetailCacheForTests() {
  matchDetailCache.clear();
}
