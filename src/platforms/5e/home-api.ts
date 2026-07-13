import { fetch5ePlayerHome, fetch5ePlayerHomeBatch } from '@core/platform/5e';
import { numOrUndef } from './field-mapper';
import type { P5eApiPayload, P5eMatchBundle } from './types';

export interface P5eHomeSeasonData {
  rating?: number;
  adr?: number;
  rws?: number;
  matchTotal?: number;
  perWinMatch?: number;
  winMatchTotal?: number;
  lossMatchTotal?: number;
  avgRating?: number;
  perHeadshot?: number;
  kast?: number;
  impact?: number;
  losingStreak?: number;
  kill?: number;
  death?: number;
}

export interface P5eHomeData {
  seasonData?: P5eHomeSeasonData;
  eloMode?: Record<string, unknown>;
  uinfo?: Record<string, unknown>;
  career?: Record<string, unknown>;
  plusinfo?: Record<string, unknown>;
  matchList?: number[];
}

const HOME_API_URL =
  'https://gate.5eplay.com/cranenew/http/api/data/v3/player/home';

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

/** 将 Rust/网关原始错误转为用户可读文案；签名失效时提示反馈开发者 */
export function formatP5eHomeEnrichError(raw: string): string {
  const lower = raw.toLowerCase();
  const looksLikeSignatureFailure =
    lower.includes('gate_signature_failed')
    || lower.includes('签名验证失败')
    || lower.includes('签名或网关')
    || lower.includes('invalid key')
    || lower.includes('x-ca')
    || lower.includes('hmac')
    || /\b401\b/.test(lower)
    || /\b403\b/.test(lower);

  if (looksLikeSignatureFailure) {
    return '5E 接口签名验证失败（可能因 5E 客户端更新导致密钥失效），赛季 Rating 无法获取。请将此情况反馈给开发者更新签名配置。';
  }

  if (lower.includes('批量拉取无有效数据') || lower.includes('批量拉取失败')) {
    return '5E player/home 数据拉取失败，赛季 Rating 可能不准确。若持续出现，请反馈给开发者。';
  }

  return raw;
}

const homeCache = new Map<string, Promise<unknown>>();

function homeCacheKey(uuid: string): string {
  return uuid;
}

export function fetchP5eHomeCached(uuid: string): Promise<unknown> {
  const key = homeCacheKey(uuid);
  let pending = homeCache.get(key);
  if (!pending) {
    pending = fetch5ePlayerHome(uuid).catch((err) => {
      homeCache.delete(key);
      throw err;
    });
    homeCache.set(key, pending);
  }
  return pending;
}

function parseSeasonBlock(raw: unknown): P5eHomeSeasonData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  return {
    rating: numOrUndef(row.rating),
    adr: numOrUndef(row.adr),
    rws: numOrUndef(row.rws),
    matchTotal: numOrUndef(row.match_total),
    perWinMatch: numOrUndef(row.per_win_match),
    winMatchTotal: numOrUndef(row.win_match_total),
    lossMatchTotal: numOrUndef(row.loss_match_total),
    avgRating: numOrUndef(row.avg_rating),
    perHeadshot: numOrUndef(row.per_headshot),
    kast: numOrUndef(row.kast),
    impact: numOrUndef(row.impact),
    losingStreak: numOrUndef(row.losing_streak),
    kill: numOrUndef(row.kill),
    death: numOrUndef(row.death),
  };
}

export function parseP5eHomeResponseBody(body: unknown): P5eHomeData | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const data = (body as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;

  const modeKey = '9';
  const eloInfo = record.elo_info;
  let eloMode: Record<string, unknown> | undefined;
  if (eloInfo && typeof eloInfo === 'object') {
    const modes = (eloInfo as Record<string, unknown>).modes;
    if (modes && typeof modes === 'object') {
      const mode = (modes as Record<string, unknown>)[modeKey];
      if (mode && typeof mode === 'object') {
        eloMode = mode as Record<string, unknown>;
      }
    }
  }

  const matchListRaw = record.match_list;
  const matchList = Array.isArray(matchListRaw)
    ? matchListRaw.map((v) => Number(v)).filter((n) => !Number.isNaN(n))
    : undefined;

  return {
    seasonData: parseSeasonBlock(record.season_data),
    eloMode,
    uinfo:
      record.uinfo && typeof record.uinfo === 'object'
        ? (record.uinfo as Record<string, unknown>)
        : undefined,
    career:
      record.career && typeof record.career === 'object'
        ? (record.career as Record<string, unknown>)
        : undefined,
    plusinfo:
      record.plusinfo && typeof record.plusinfo === 'object'
        ? (record.plusinfo as Record<string, unknown>)
        : undefined,
    matchList,
  };
}

export function parseP5eHomePayload(payload: P5eApiPayload | undefined): P5eHomeData | undefined {
  if (!payload) return undefined;
  return parseP5eHomeResponseBody(payload.responseBody);
}

export function getP5eHomeData(bundle: P5eMatchBundle, uuid: string): P5eHomeData | undefined {
  const payload = bundle.playerHome?.[uuid];
  return parseP5eHomePayload(payload);
}

/** match_list: 1=胜, 0=负, 2=平（与 specialData 近几场顺序一致） */
export function recentResultsFromMatchList(
  matchList: number[] | undefined,
  count = 5,
): Array<'win' | 'lose' | 'draw'> {
  if (!matchList?.length) return [];
  const out: Array<'win' | 'lose' | 'draw'> = [];
  for (const code of matchList) {
    if (out.length >= count) break;
    if (code === 1) out.push('win');
    else if (code === 0) out.push('lose');
    else if (code === 2) out.push('draw');
  }
  return out;
}

/** 批量拉取 player/home 并写入 bundle（HMAC 签名，无需登录 Cookie） */
export async function enrichP5eBundleWithPlayerHome(
  bundle: P5eMatchBundle,
): Promise<P5eMatchBundle> {
  if (bundle.playerHome && Object.keys(bundle.playerHome).length >= bundle.uuids.length) {
    return bundle;
  }

  const missing = bundle.uuids.filter((uuid) => !bundle.playerHome?.[uuid]);
  if (!missing.length) return bundle;

  const homeUrl = (uuid: string) => `${HOME_API_URL}?uuid=${uuid}`;

  try {
    const batch = await withRetry(() => fetch5ePlayerHomeBatch(missing));
    const playerHome: Record<string, P5eApiPayload> = { ...(bundle.playerHome ?? {}) };

    for (const uuid of missing) {
      const responseBody = batch[uuid];
      if (!responseBody || typeof responseBody !== 'object') continue;
      playerHome[uuid] = {
        url: homeUrl(uuid),
        requestBody: null,
        responseBody,
      };
    }

    const stillMissing = missing.filter((uuid) => !playerHome[uuid]);
    for (const uuid of stillMissing) {
      try {
        const responseBody = await withRetry(() => fetch5ePlayerHome(uuid));
        if (responseBody && typeof responseBody === 'object') {
          playerHome[uuid] = {
            url: homeUrl(uuid),
            requestBody: null,
            responseBody,
          };
        }
      } catch {
        // 单 uuid 失败不影响其余玩家
      }
    }

    if (!Object.keys(playerHome).length) {
      return {
        ...bundle,
        homeEnrichError: formatP5eHomeEnrichError('player/home 批量拉取无有效数据'),
      };
    }

    return { ...bundle, playerHome };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const friendly = formatP5eHomeEnrichError(message);
    console.warn('[5e home enrich]', friendly);
    return { ...bundle, homeEnrichError: friendly };
  }
}

/** 仅用于测试 */
export function clearP5eHomeCacheForTests() {
  homeCache.clear();
}
