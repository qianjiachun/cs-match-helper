import type { P5eApiKind, P5eHttpEvent, P5eRawEvent } from './types';

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-ca-signature',
  'x-ca-key',
  'pttoken',
  'pt-token',
]);

const WHITELIST_PATTERNS: { kind: P5eApiKind; pattern: string }[] = [
  { kind: 'userInfo', pattern: '/api/user/info' },
  { kind: 'eloInfo', pattern: '/player/elo/info/batch' },
  { kind: 'mapExt', pattern: '/player/map-ext/batch' },
];

const MATCHING_BATCH_PATH = '/api/match/matching/batch';
const GATE_DEBUG_HOST = 'gate.5eplay.com';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface P5eMatchingBatchMapSignal {
  mapName: string;
  uuids: string[];
  t1Uuids: string[];
  t2Uuids: string[];
}

export function isP5eGateDebugUrl(url: string): boolean {
  return url.toLowerCase().includes(GATE_DEBUG_HOST);
}

export function isP5eMatchingBatchUrl(url: string): boolean {
  return url.toLowerCase().includes(MATCHING_BATCH_PATH);
}

export function isP5eWhitelistedUrl(url: string): boolean {
  return classifyP5eUrl(url) != null || isP5eMatchingBatchUrl(url);
}

export function classifyP5eUrl(url: string): P5eApiKind | null {
  const lower = url.toLowerCase();
  for (const { kind, pattern } of WHITELIST_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return kind;
  }
  return null;
}

export function shouldAcceptP5eHttpEvent(event: P5eHttpEvent): boolean {
  if (isP5eWhitelistedUrl(event.url)) return true;
  if (event.gateDebug && isP5eGateDebugUrl(event.url)) return true;
  return false;
}

export function stripSensitiveHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!headers) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

export function sanitizeP5eHttpEvent(event: P5eHttpEvent): P5eHttpEvent | null {
  if (!shouldAcceptP5eHttpEvent(event)) return null;
  return {
    kind: 'http',
    url: event.url,
    method: event.method,
    capturedAt: event.capturedAt,
    requestBody: event.requestBody,
    responseBody: event.responseBody,
    gateDebug: event.gateDebug,
    captureError: event.captureError,
  };
}

export function parseP5eNdjsonLine(line: string): P5eRawEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.curl) return null;
    const response = parsed.response as Record<string, unknown> | undefined;
    const url = String(parsed.url ?? response?.url ?? '');
    if (!url || !isP5eWhitelistedUrl(url)) return null;
    const requestBody = parseJsonMaybe(
      (parsed.request as Record<string, unknown> | undefined)?.postData
        ?? parsed.requestBody,
    );
    const responseBody = parseJsonMaybe(
      (parsed.response as Record<string, unknown> | undefined)?.body
        ?? parsed.responseBody,
    );
    return {
      kind: 'http',
      url,
      method: String(parsed.method ?? 'POST'),
      capturedAt: String(parsed.capturedAt ?? new Date().toISOString()),
      requestBody,
      responseBody,
    };
  } catch {
    return null;
  }
}

function parseJsonMaybe(raw: unknown): unknown {
  if (raw == null) return undefined;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function extractUuidsFromRequest(requestBody: unknown): string[] {
  if (!requestBody || typeof requestBody !== 'object') return [];
  const body = requestBody as Record<string, unknown>;
  const list = body.uuids ?? body.user;
  if (!Array.isArray(list)) return [];
  return list.filter((u): u is string => typeof u === 'string' && u.length > 0);
}

function parseUuidTeam(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length !== 5) return null;
  const uuids: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !UUID_RE.test(item)) return null;
    uuids.push(item);
  }
  return uuids;
}

/** 从 matching/batch 请求体解析本局地图；严格要求两队各 5 个唯一 UUID */
export function parseMatchingBatchMapSignal(
  requestBody: unknown,
): P5eMatchingBatchMapSignal | null {
  if (!requestBody || typeof requestBody !== 'object') return null;
  const body = requestBody as Record<string, unknown>;
  const mapName = typeof body.game_map === 'string' ? body.game_map.trim() : '';
  if (!mapName) return null;

  const t1Uuids = parseUuidTeam(body.t1_uuids);
  const t2Uuids = parseUuidTeam(body.t2_uuids);
  if (!t1Uuids || !t2Uuids) return null;

  const uuids = [...t1Uuids, ...t2Uuids];
  if (new Set(uuids).size !== 10) return null;

  return { mapName, uuids, t1Uuids, t2Uuids };
}

export function sameUuidSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  if (setB.size !== b.length) return false;
  for (const uuid of a) {
    if (!setB.has(uuid)) return false;
  }
  return true;
}
