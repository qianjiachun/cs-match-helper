import { describe, expect, it } from 'vitest';
import { parseGameContextFromJson } from './game-context';

const U1 = 'aaaaaaaa-bbbb-cccc-dddd-111111111111';
const U2 = 'aaaaaaaa-bbbb-cccc-dddd-222222222222';
const U3 = 'aaaaaaaa-bbbb-cccc-dddd-333333333333';
const U4 = 'aaaaaaaa-bbbb-cccc-dddd-444444444444';
const U5 = 'aaaaaaaa-bbbb-cccc-dddd-555555555555';
const V1 = 'bbbbbbbb-cccc-dddd-eeee-111111111111';
const V2 = 'bbbbbbbb-cccc-dddd-eeee-222222222222';
const V3 = 'bbbbbbbb-cccc-dddd-eeee-333333333333';
const V4 = 'bbbbbbbb-cccc-dddd-eeee-444444444444';
const V5 = 'bbbbbbbb-cccc-dddd-eeee-555555555555';

function makeGameCtx(overrides?: Record<string, unknown>) {
  return {
    game_ctx: {
      id: 'g161-n-20260710122439267141317',
      status: 0,
      gmi: {
        map: 0,
        selected_map: 0,
        t1: {
          rooms: [
            { id: 'room-t1-a', members: [U1, U2] },
            { id: 'room-t1-b', members: [U3, U4, U5] },
          ],
        },
        t2: {
          rooms: [{ id: 'room-t2', members: [V1, V2, V3, V4, V5] }],
        },
      },
      ...overrides,
    },
  };
}

describe('parseGameContextFromJson', () => {
  it('parses 5v5 UUID anchor from game_ctx', () => {
    const anchor = parseGameContextFromJson(makeGameCtx(), '2026-07-10T12:00:00.000Z');
    expect(anchor).not.toBeNull();
    expect(anchor!.gameId).toBe('g161-n-20260710122439267141317');
    expect(anchor!.team1Uuids).toHaveLength(5);
    expect(anchor!.team2Uuids).toHaveLength(5);
    expect(anchor!.teamSideByUuid[U1]).toBe(1);
    expect(anchor!.teamSideByUuid[V5]).toBe(2);
    expect(anchor!.partyRooms.length).toBeGreaterThan(0);
  });

  it('rejects incomplete teams', () => {
    const bad = makeGameCtx();
    (bad.game_ctx.gmi.t2.rooms[0].members as string[]).pop();
    expect(parseGameContextFromJson(bad)).toBeNull();
  });

  it('merges ready_members from root', () => {
    const payload = {
      ...makeGameCtx(),
      ready_members: [U1, U2],
    };
    const anchor = parseGameContextFromJson(payload);
    expect(anchor?.readyUuids).toEqual([U1, U2]);
  });

  it('supports game_ctx_update wrapper', () => {
    const payload = {
      game_ctx_update: makeGameCtx().game_ctx,
      ready_members: [U1],
    };
    const anchor = parseGameContextFromJson(payload);
    expect(anchor?.gameId).toBe('g161-n-20260710122439267141317');
    expect(anchor?.readyUuids).toEqual([U1]);
  });
});
