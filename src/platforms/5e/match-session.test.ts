import { describe, expect, it, vi } from 'vitest';
import { parseGameContextFromJson } from './game-context';
import { P5eMatchSession } from './match-session';
import type { P5eHttpEvent, P5eWsFrameEvent } from './types';

const TEAM1 = [
  'aaaaaaaa-bbbb-cccc-dddd-111111111111',
  'aaaaaaaa-bbbb-cccc-dddd-222222222222',
  'aaaaaaaa-bbbb-cccc-dddd-333333333333',
  'aaaaaaaa-bbbb-cccc-dddd-444444444444',
  'aaaaaaaa-bbbb-cccc-dddd-555555555555',
];
const TEAM2 = [
  'bbbbbbbb-cccc-dddd-eeee-111111111111',
  'bbbbbbbb-cccc-dddd-eeee-222222222222',
  'bbbbbbbb-cccc-dddd-eeee-333333333333',
  'bbbbbbbb-cccc-dddd-eeee-444444444444',
  'bbbbbbbb-cccc-dddd-eeee-555555555555',
];
const ALL = [...TEAM1, ...TEAM2];
const OUTSIDER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const GAME_ID = 'g161-n-test-session';

function wsFrame(): P5eWsFrameEvent {
  return {
    kind: 'ws_frame',
    requestId: '1',
    url: 'wss://comet-client-arena.5eplay.com/',
    capturedAt: new Date().toISOString(),
    opcode: 2,
    decodedJson: {
      game_ctx: {
        id: GAME_ID,
        gmi: {
          t1: { rooms: [{ id: 'r1', members: TEAM1 }] },
          t2: { rooms: [{ id: 'r2', members: TEAM2 }] },
        },
      },
    },
    eventHint: 'game_ctx',
  };
}

function httpEvent(
  kind: 'userInfo' | 'eloInfo' | 'mapExt',
  uuids: string[],
  data: Record<string, unknown>,
): P5eHttpEvent {
  const urls = {
    userInfo: 'https://platform-api.5eplay.com/api/user/info',
    eloInfo: 'https://gate.5eplay.com/player/elo/info/batch',
    mapExt: 'https://gate.5eplay.com/player/map-ext/batch',
  };
  const bodyKey = kind === 'eloInfo' ? 'user' : 'uuids';
  return {
    kind: 'http',
    url: urls[kind],
    method: 'POST',
    capturedAt: new Date().toISOString(),
    requestBody: { [bodyKey]: uuids, match_mode: [9] },
    responseBody: { data },
  };
}

function rowsFor(uuids: string[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(uuids.map((u) => [u, { ok: true }]));
}

describe('P5eMatchSession', () => {
  it('anchors on ws game_ctx and merges split http batches', () => {
    const onMatch = vi.fn();
    const session = new P5eMatchSession({ onMatch });

    session.ingestHttp(httpEvent('userInfo', TEAM1, rowsFor(TEAM1)));
    expect(onMatch).not.toHaveBeenCalled();

    session.ingestWs(wsFrame());
    session.ingestHttp(httpEvent('userInfo', TEAM2, rowsFor(TEAM2)));
    session.ingestHttp(httpEvent('eloInfo', ALL, rowsFor(ALL)));
    session.ingestHttp(httpEvent('mapExt', ALL, rowsFor(ALL)));

    expect(onMatch).toHaveBeenCalledTimes(1);
    const bundle = onMatch.mock.calls[0][0];
    expect(bundle.gameId).toBe(GAME_ID);
    expect(bundle.uuids).toHaveLength(10);
    expect(bundle.incomplete).toBeFalsy();
  });

  it('filters outsider uuids from merge', () => {
    const onMatch = vi.fn();
    const session = new P5eMatchSession({ onMatch });
    session.ingestWs(wsFrame());
    session.ingestHttp(httpEvent('userInfo', [...TEAM1, OUTSIDER], {
      ...rowsFor(TEAM1),
      [OUTSIDER]: { ok: true },
    }));
    const data = (session.getAnchor() && onMatch.mock.calls[0]?.[0]) as unknown;
    void data;
    session.ingestHttp(httpEvent('eloInfo', ALL, rowsFor(ALL)));
    session.ingestHttp(httpEvent('mapExt', ALL, rowsFor(ALL)));
    session.ingestHttp(httpEvent('userInfo', TEAM2, rowsFor(TEAM2)));
    expect(onMatch).toHaveBeenCalledTimes(1);
    const bundle = onMatch.mock.calls[0][0];
    const userData = (bundle.userInfo?.responseBody as { data: Record<string, unknown> }).data;
    expect(userData[OUTSIDER]).toBeUndefined();
    expect(Object.keys(userData)).toHaveLength(10);
  });

  it('dedupes by gameId across repeated game_ctx frames', () => {
    const onMatch = vi.fn();
    const session = new P5eMatchSession({ onMatch });
    session.ingestWs(wsFrame());
    for (const kind of ['userInfo', 'eloInfo', 'mapExt'] as const) {
      session.ingestHttp(httpEvent(kind, ALL, rowsFor(ALL)));
    }
    expect(onMatch).toHaveBeenCalledTimes(1);

    const update = wsFrame();
    (update.decodedJson as Record<string, unknown>).ready_members = [TEAM1[0]];
    session.ingestWs(update);
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(session.getAnchor()?.readyUuids).toEqual([TEAM1[0]]);
  });

  it('emits incomplete bundle after timeout', () => {
    vi.useFakeTimers();
    const onMatch = vi.fn();
    const session = new P5eMatchSession({ sessionTimeoutMs: 1000, onMatch });
    session.ingestWs(wsFrame());
    session.ingestHttp(httpEvent('userInfo', ALL, rowsFor(ALL)));
    vi.advanceTimersByTime(1001);
    session.ingestHttp(httpEvent('userInfo', [TEAM1[0]], rowsFor([TEAM1[0]])));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onMatch.mock.calls[0][0].incomplete).toBe(true);
    vi.useRealTimers();
  });

  it('replays http buffer that arrived before ws anchor', () => {
    const onMatch = vi.fn();
    const session = new P5eMatchSession({ onMatch });
    session.ingestHttp(httpEvent('userInfo', ALL, rowsFor(ALL)));
    session.ingestHttp(httpEvent('eloInfo', TEAM1, rowsFor(TEAM1)));
    session.ingestWs(wsFrame());
    session.ingestHttp(httpEvent('mapExt', ALL, rowsFor(ALL)));
    session.ingestHttp(httpEvent('eloInfo', TEAM2, rowsFor(TEAM2)));
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('stores matching/batch map before first emit', () => {
    const onMatch = vi.fn();
    const session = new P5eMatchSession({ onMatch });
    session.ingestWs(wsFrame());
    session.ingestHttp(matchingBatchEvent('de_dust2', TEAM1, TEAM2));
    expect(onMatch).not.toHaveBeenCalled();
    expect(session.getPendingMapName()).toBe('de_dust2');

    for (const kind of ['userInfo', 'eloInfo', 'mapExt'] as const) {
      session.ingestHttp(httpEvent(kind, ALL, rowsFor(ALL)));
    }
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onMatch.mock.calls[0][0].mapName).toBe('de_dust2');
  });

  it('re-emits same gameId once when map arrives after unknown-map emit', () => {
    const onMatch = vi.fn();
    const session = new P5eMatchSession({ onMatch });
    session.ingestWs(wsFrame());
    for (const kind of ['userInfo', 'eloInfo', 'mapExt'] as const) {
      session.ingestHttp(httpEvent(kind, ALL, rowsFor(ALL)));
    }
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onMatch.mock.calls[0][0].mapName).toBeUndefined();

    session.ingestHttp(matchingBatchEvent('de_dust2', TEAM1, TEAM2));
    expect(onMatch).toHaveBeenCalledTimes(2);
    expect(onMatch.mock.calls[1][0].mapName).toBe('de_dust2');
    expect(onMatch.mock.calls[1][0].gameId).toBe(GAME_ID);

    session.ingestHttp(matchingBatchEvent('de_dust2', TEAM1, TEAM2));
    expect(onMatch).toHaveBeenCalledTimes(2);
  });

  it('ignores matching/batch with mismatched uuids or empty map', () => {
    const onMatch = vi.fn();
    const session = new P5eMatchSession({ onMatch });
    session.ingestWs(wsFrame());
    for (const kind of ['userInfo', 'eloInfo', 'mapExt'] as const) {
      session.ingestHttp(httpEvent(kind, ALL, rowsFor(ALL)));
    }
    expect(onMatch).toHaveBeenCalledTimes(1);

    const outsiderTeam2 = [...TEAM2.slice(0, 4), OUTSIDER];
    session.ingestHttp(matchingBatchEvent('de_dust2', TEAM1, outsiderTeam2));
    session.ingestHttp(matchingBatchEvent('', TEAM1, TEAM2));
    expect(onMatch).toHaveBeenCalledTimes(1);
  });
});

function matchingBatchEvent(
  mapName: string,
  t1: string[],
  t2: string[],
): P5eHttpEvent {
  return {
    kind: 'http',
    url: 'https://gate.5eplay.com/cranenew/http/api/match/matching/batch',
    method: 'POST',
    capturedAt: new Date().toISOString(),
    requestBody: {
      game_map: mapName,
      t1_uuids: t1,
      t2_uuids: t2,
    },
  };
}

describe('parseGameContextFromJson teams', () => {
  it('requires unique 10 uuids', () => {
    const dup = parseGameContextFromJson({
      game_ctx: {
        id: GAME_ID,
        gmi: {
          t1: { rooms: [{ members: [TEAM1[0], TEAM1[0], TEAM1[1], TEAM1[2], TEAM1[3]] }] },
          t2: { rooms: [{ members: TEAM2 }] },
        },
      },
    });
    expect(dup).toBeNull();
  });
});
