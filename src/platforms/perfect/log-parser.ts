import type { LogLine } from '@core/log/types';
import { decodeLogLine } from './log-decrypt';

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
