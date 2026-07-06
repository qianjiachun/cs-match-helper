import { fetch5eMatchDetail } from '@core/platform/5e';
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

/** 通过 match 接口实时拉取地图并写入 bundle */
export async function enrichP5eBundleWithLiveMap(bundle: P5eMatchBundle): Promise<P5eMatchBundle> {
  if (bundle.mapName) return bundle;

  const cachedMap = resolveMapFromMatchDetail(bundle.matchDetail as P5eMatchDetailResponse | undefined);
  if (cachedMap) return { ...bundle, mapName: cachedMap };

  const matchCode = bundle.matchCode ?? pickLatestMatchCode(extractP5eMatchCodes(bundle));
  if (!matchCode) return bundle;

  try {
    const detail = await withRetry(() => fetchP5eMatchDetailCached(matchCode));
    const mapName = resolveMapFromMatchDetail(detail);
    return {
      ...bundle,
      matchCode,
      matchDetail: detail,
      mapName: mapName ?? bundle.mapName,
    };
  } catch {
    return { ...bundle, matchCode };
  }
}

const matchDetailCache = new Map<string, Promise<P5eMatchDetailResponse>>();

/** 同一 match_code 只发起一次网络请求（并发调用共享同一 Promise） */
export function fetchP5eMatchDetailCached(matchCode: string): Promise<P5eMatchDetailResponse> {
  const code = matchCode.trim();
  let pending = matchDetailCache.get(code);
  if (!pending) {
    pending = fetch5eMatchDetail(code)
      .then((response) => response as P5eMatchDetailResponse)
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
