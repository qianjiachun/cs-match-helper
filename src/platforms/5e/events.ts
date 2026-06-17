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

export function classifyP5eUrl(url: string): P5eApiKind | null {
  const lower = url.toLowerCase();
  for (const { kind, pattern } of WHITELIST_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return kind;
  }
  return null;
}

export function isP5eWhitelistedUrl(url: string): boolean {
  return classifyP5eUrl(url) != null;
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
  if (!isP5eWhitelistedUrl(event.url)) return null;
  return {
    kind: 'http',
    url: event.url,
    method: event.method,
    capturedAt: event.capturedAt,
    requestBody: event.requestBody,
    responseBody: event.responseBody,
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
