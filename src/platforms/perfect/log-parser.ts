import type { LogLine } from '@core/log/types';
import { decodeLogLine } from './log-decrypt';

/** 启动时恢复对局的最大时效（毫秒） */
export const BOOTSTRAP_MATCH_MAX_AGE_MS = 2 * 60 * 60 * 1000;

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
