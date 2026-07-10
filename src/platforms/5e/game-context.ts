import type { P5eWsFrameEvent } from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isP5eCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export interface P5ePartyRoom {
  id: string;
  members: string[];
}

export interface P5eWsGameAnchor {
  gameId: string;
  team1Uuids: string[];
  team2Uuids: string[];
  /** uuid → 1 | 2 */
  teamSideByUuid: Record<string, 1 | 2>;
  partyRooms: Array<{ team: 1 | 2; room: P5ePartyRoom }>;
  readyUuids: string[];
  status?: number;
  gmiMapId?: number;
  selectedMapId?: number;
  capturedAt: string;
  eventHint: string;
}

function asRecord(raw: unknown): Record<string, unknown> | undefined {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined;
}

function flattenTeamMembers(team: Record<string, unknown> | undefined): string[] {
  const rooms = team?.rooms;
  if (!Array.isArray(rooms)) return [];
  const uuids: string[] = [];
  for (const roomRaw of rooms) {
    const room = asRecord(roomRaw);
    const members = room?.members;
    if (!Array.isArray(members)) continue;
    for (const member of members) {
      if (isP5eCanonicalUuid(member)) uuids.push(member);
    }
  }
  return uuids;
}

function collectPartyRooms(
  team: Record<string, unknown> | undefined,
  teamSide: 1 | 2,
): Array<{ team: 1 | 2; room: P5ePartyRoom }> {
  const rooms = team?.rooms;
  if (!Array.isArray(rooms)) return [];
  const out: Array<{ team: 1 | 2; room: P5ePartyRoom }> = [];
  for (const roomRaw of rooms) {
    const room = asRecord(roomRaw);
    if (!room) continue;
    const id = typeof room.id === 'string' ? room.id : '';
    const members = Array.isArray(room.members)
      ? room.members.filter(isP5eCanonicalUuid)
      : [];
    if (!id && members.length === 0) continue;
    out.push({ team: teamSide, room: { id, members } });
  }
  return out;
}

function parseReadyMembers(source: Record<string, unknown>): string[] {
  const ready = source.ready_members;
  if (!Array.isArray(ready)) return [];
  return ready.filter(isP5eCanonicalUuid);
}

function parseGameCtxObject(gameCtx: Record<string, unknown>): P5eWsGameAnchor | null {
  const gameId = typeof gameCtx.id === 'string' ? gameCtx.id.trim() : '';
  if (!gameId) return null;

  const gmi = asRecord(gameCtx.gmi);
  const team1Uuids = flattenTeamMembers(asRecord(gmi?.t1));
  const team2Uuids = flattenTeamMembers(asRecord(gmi?.t2));

  if (team1Uuids.length !== 5 || team2Uuids.length !== 5) return null;

  const all = [...team1Uuids, ...team2Uuids];
  if (new Set(all).size !== 10) return null;

  const teamSideByUuid: Record<string, 1 | 2> = {};
  for (const uuid of team1Uuids) teamSideByUuid[uuid] = 1;
  for (const uuid of team2Uuids) teamSideByUuid[uuid] = 2;

  const gmiMapId = numOrZero(gmi?.map);
  const selectedMapId = numOrZero(gmi?.selected_map);

  return {
    gameId,
    team1Uuids,
    team2Uuids,
    teamSideByUuid,
    partyRooms: [
      ...collectPartyRooms(asRecord(gmi?.t1), 1),
      ...collectPartyRooms(asRecord(gmi?.t2), 2),
    ],
    readyUuids: parseReadyMembers(gameCtx),
    status: typeof gameCtx.status === 'number' ? gameCtx.status : undefined,
    gmiMapId,
    selectedMapId,
    capturedAt: new Date().toISOString(),
    eventHint: 'game_ctx',
  };
}

function numOrZero(raw: unknown): number | undefined {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() && !Number.isNaN(Number(raw))) return Number(raw);
  return undefined;
}

export function parseGameContextFromJson(
  json: unknown,
  capturedAt?: string,
): P5eWsGameAnchor | null {
  const root = asRecord(json);
  if (!root) return null;

  const gameCtx =
    asRecord(root.game_ctx)
    ?? asRecord(root.game_ctx_update)
    ?? (root.id && root.gmi ? root : undefined);

  if (!gameCtx) return null;

  const anchor = parseGameCtxObject(gameCtx);
  if (!anchor) return null;
  if (capturedAt) anchor.capturedAt = capturedAt;

  const readyFromRoot = parseReadyMembers(root);
  if (readyFromRoot.length > 0) anchor.readyUuids = readyFromRoot;

  return anchor;
}

export function parseGameContextFromWsEvent(event: P5eWsFrameEvent): P5eWsGameAnchor | null {
  const sources = [event.decodedJson, event.innerJson].filter((v) => v != null);
  for (const source of sources) {
    const anchor = parseGameContextFromJson(source, event.capturedAt);
    if (anchor) {
      anchor.eventHint = event.eventHint ?? anchor.eventHint;
      return anchor;
    }
  }
  return null;
}

export function mergeGameAnchors(
  existing: P5eWsGameAnchor,
  incoming: P5eWsGameAnchor,
): P5eWsGameAnchor {
  if (existing.gameId !== incoming.gameId) return incoming;

  return {
    ...existing,
    readyUuids: incoming.readyUuids.length > 0 ? incoming.readyUuids : existing.readyUuids,
    status: incoming.status ?? existing.status,
    gmiMapId: incoming.gmiMapId ?? existing.gmiMapId,
    selectedMapId: incoming.selectedMapId ?? existing.selectedMapId,
    capturedAt: incoming.capturedAt || existing.capturedAt,
    eventHint: incoming.eventHint || existing.eventHint,
  };
}

/** 接受后实机样本确认前不硬编码地图表；非零 ID 仅作调试候选 */
export function resolveWsMapName(anchor?: P5eWsGameAnchor): string | undefined {
  if (!anchor) return undefined;
  const mapId = anchor.selectedMapId ?? anchor.gmiMapId;
  if (mapId == null || mapId === 0) return undefined;
  return P5E_WS_MAP_ID_TO_NAME[mapId];
}

/** 待接受后样本校准；确认前保持为空 */
export const P5E_WS_MAP_ID_TO_NAME: Record<number, string> = {};
