import type { LogLine } from '@core/log/types';
import { decodeLogLine } from './log-decrypt';
import type { PerfectMatchEvent } from './types';

/** 启动时恢复对局的最大时效（毫秒） */
export const BOOTSTRAP_MATCH_MAX_AGE_MS = 60 * 60 * 1000;

export function parseLogLine(line: string): LogLine {
  const m = line.match(/^\[([^\]]+)\]\s+\[(\w+)\]\s+(\S+)\s+-\s+(.*)$/);
  if (!m) {
    return { raw: line, decoded: decodeLogLine(line) };
  }
  const message = m[4];
  return {
    time: m[1],
    level: m[2],
    category: m[3],
    message,
    decoded: decodeLogLine(message),
    raw: line,
  };
}

export function extractEmbeddedJson(decodedText: string): Record<string, unknown> | null {
  const jsonStart = decodedText.indexOf('{');
  if (jsonStart < 0) return null;
  try {
    const slice = decodedText.slice(jsonStart);
    const end = findJsonEnd(slice);
    if (end > 0) {
      return JSON.parse(slice.slice(0, end + 1)) as Record<string, unknown>;
    }
  } catch {
    // ignore malformed JSON
  }
  return null;
}

/** 从日志行中自后向前查找最近一次匹配成功事件 */
export function findLastMatchEventInLogLines(lines: string[]): {
  data: Record<string, unknown>;
  logLine: LogLine;
} | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const parsed = parseLogLine(raw);
    const eventData = extractMatchEvents(parsed.decoded);
    if (eventData) {
      return { data: eventData, logLine: parsed };
    }
  }
  return null;
}

/** 解析日志行中的时间戳 */
export function parseLogLineTime(time?: string): Date | null {
  if (!time?.trim()) return null;
  const trimmed = time.trim();

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;

  const timeOnly = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (timeOnly) {
    const now = new Date();
    const parsed = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(timeOnly[1]),
      Number(timeOnly[2]),
      Number(timeOnly[3]),
      Number(timeOnly[4]?.slice(0, 3) ?? 0),
    );
    // 跨午夜时日志时间可能略大于当前时刻
    if (parsed.getTime() > Date.now() + 60_000) {
      parsed.setDate(parsed.getDate() - 1);
    }
    return parsed;
  }

  const normalized = trimmed.replace(/\//g, '-');
  const fallback = new Date(normalized);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

/** 判断日志行是否在指定时效内（用于启动恢复，避免展示过旧对局） */
export function isLogLineWithinMaxAge(
  logLine: LogLine,
  maxAgeMs: number,
  now = Date.now(),
): boolean {
  const parsed = parseLogLineTime(logLine.time);
  if (!parsed) return false;
  return now - parsed.getTime() <= maxAgeMs;
}

export function extractMatchEvents(decodedText: string): Record<string, unknown> | null {
  const eventPatterns = [
    /MT_CREATE_GAME_NOT(?:IFY|F)/i,
    /recv\s+a\s+create\s+game(?:\([^)]*\))?\s+notify(?:\s+msg)?/i,
    /create\s+game(?:\([^)]*\))?\s+notify/i,
  ];

  const matchedByKeyword = eventPatterns.some((pattern) => pattern.test(decodedText));
  const embeddedJson = extractEmbeddedJson(decodedText);

  if (matchedByKeyword) {
    return embeddedJson ?? { raw: decodedText };
  }

  // 兜底：某些日志关键字会变化，但 JSON 结构仍保持稳定。
  if (embeddedJson && isLikelyCreateGamePayload(embeddedJson)) {
    return embeddedJson;
  }

  return null;
}

function pickString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Parse the progressive Perfect ladder flow while preserving legacy CreateGame payloads. */
export function extractPerfectMatchEvent(decodedText: string): PerfectMatchEvent | null {
  const matchId = decodedText.match(/setMatchId\s*:\s*(\d+)/i)?.[1]
    ?? decodedText.match(/\bmatch[_ ]id\b\s*[:=]\s*["']?(\d+)/i)?.[1];
  if (matchId) return { kind: 'match-id', matchId };

  const embedded = extractEmbeddedJson(decodedText);
  if (/\bready\s+notify\b/i.test(decodedText)) {
    const steamId = embedded ? pickString(embedded.ready_player_id) : undefined;
    if (steamId) return { kind: 'ready', steamId };
  }

  if (/\bgame\s+start\s+notify\b/i.test(decodedText) && embedded) {
    const gameInfo = embedded.game_info;
    if (gameInfo && typeof gameInfo === 'object' && !Array.isArray(gameInfo)) {
      return { kind: 'game-start', gameInfo: gameInfo as Record<string, unknown> };
    }
    return { kind: 'game-start', gameInfo: embedded };
  }

  if (/create\s+game\(match\s+sucess\)\s+notify/i.test(decodedText)) {
    return { kind: 'match-success' };
  }

  const legacy = extractMatchEvents(decodedText);
  if (legacy && isLikelyCreateGamePayload(legacy)) {
    return { kind: 'legacy-create-game', data: legacy };
  }
  return null;
}

export interface PerfectLogEventEntry {
  event: PerfectMatchEvent;
  logLine: LogLine;
}

/** Return the latest recoverable session, not merely the latest JSON-bearing line. */
export function findLatestPerfectSessionInLogLines(
  lines: string[],
  maxAgeMs = BOOTSTRAP_MATCH_MAX_AGE_MS,
  now = Date.now(),
): PerfectLogEventEntry[] {
  const entries: PerfectLogEventEntry[] = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const logLine = parseLogLine(raw);
    if (!isLogLineWithinMaxAge(logLine, maxAgeMs, now)) continue;
    const event = extractPerfectMatchEvent(logLine.decoded);
    if (event) entries.push({ event, logLine });
  }
  let start = -1;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const kind = entries[index].event.kind;
    if (kind === 'match-success' || kind === 'legacy-create-game') {
      start = index;
      if (index > 0 && entries[index - 1].event.kind === 'match-id') start = index - 1;
      break;
    }
  }
  if (start < 0) {
    start = entries.findIndex((entry) => entry.event.kind === 'ready' || entry.event.kind === 'game-start');
  }
  return start < 0 ? [] : entries.slice(start);
}

function isLikelyCreateGamePayload(data: Record<string, unknown>): boolean {
  const gameId = data.platform_game_id ?? data.platformGameId;
  if (typeof gameId !== 'string' || !gameId.trim()) {
    return false;
  }

  const mapName = data.map_name ?? data.mapName ?? data.map;
  const players = data.players ?? data.players_list ?? data.player_list;
  const hasMapName = typeof mapName === 'string' && mapName.trim().length > 0;
  const hasPlayers = Array.isArray(players) && players.length > 0;

  return hasMapName || hasPlayers;
}

function findJsonEnd(s: string): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
