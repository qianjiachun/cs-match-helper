import { describe, expect, it } from 'vitest';
import {
  formatWsEventDetail,
  isP5eHttpEvent,
  isP5eWsEvent,
  isP5eWsFrameEvent,
  summarizeWsEvent,
} from './ws-events';
import type { P5eCdpEvent } from './types';

describe('P5e ws-events', () => {
  it('discriminates http vs ws events', () => {
    const http: P5eCdpEvent = {
      kind: 'http',
      url: 'https://gate.5eplay.com/elo',
      method: 'POST',
      capturedAt: '1',
    };
    const ws: P5eCdpEvent = {
      kind: 'ws_open',
      requestId: '1.1',
      url: 'wss://comet-client-arena.5eplay.com/',
      capturedAt: '2',
    };
    expect(isP5eHttpEvent(http)).toBe(true);
    expect(isP5eWsEvent(http)).toBe(false);
    expect(isP5eWsEvent(ws)).toBe(true);
    expect(isP5eWsFrameEvent(ws)).toBe(false);
  });

  it('summarizes ws frame with hint and error', () => {
    const frame: P5eCdpEvent = {
      kind: 'ws_frame',
      requestId: '1.2',
      url: 'wss://comet-client-arena.5eplay.com/',
      capturedAt: '3',
      opcode: 2,
      eventHint: 'game_ctx',
      parseError: 'base64 decode failed',
      decodedText: '{"game_ctx":{}}',
    };
    expect(isP5eWsFrameEvent(frame)).toBe(true);
    const summary = summarizeWsEvent(frame);
    expect(summary).toContain('opcode=2');
    expect(summary).toContain('hint=game_ctx');
    expect(summary).toContain('err=base64 decode failed');
  });

  it('formats ws frame detail for debug copy', () => {
    const frame: P5eCdpEvent = {
      kind: 'ws_frame',
      requestId: '1.3',
      url: 'wss://comet-client-arena.5eplay.com/',
      capturedAt: '4',
      opcode: 1,
      payloadRaw: 'eyJ0ZXN0IjoxfQ==',
      decodedText: '{"test":1}',
      decodedJson: { test: 1 },
      innerBase64Text: '{"room_ctx":{}}',
    };
    const detail = formatWsEventDetail(frame);
    expect(detail).toContain('"opcode": 1');
    expect(detail).toContain('"decodedJson"');
    expect(detail).toContain('room_ctx');
  });
});
