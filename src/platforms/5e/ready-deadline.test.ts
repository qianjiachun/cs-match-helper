import { describe, expect, it } from 'vitest';
import fixture from './fixtures/5e-match-success.fixture.json';
import { P5eMatchAggregator } from './aggregator';
import {
  P5E_READY_COUNTDOWN_MS,
  computeP5eReadyDeadline,
  parseP5eCapturedAtMs,
} from './ready-deadline';
import type { P5eApiPayload, P5eMatchBundle } from './types';

describe('computeP5eReadyDeadline', () => {
  it('uses max API timestamp × 1000 + 30s from fixture', () => {
    const agg = new P5eMatchAggregator();
    const bundle = agg.ingestFixtureEvents(fixture.events as Record<string, P5eApiPayload>);
    expect(bundle).not.toBeNull();

    const deadline = computeP5eReadyDeadline(bundle!);
    expect(deadline).toBe(1781594817 * 1000 + P5E_READY_COUNTDOWN_MS);
  });

  it('falls back to capturedAt when no API timestamps', () => {
    const capturedAt = '2026-07-06T12:00:00.000Z';
    const bundle: P5eMatchBundle = {
      platformGameId: 'test',
      uuids: [],
      capturedAt,
    };

    const deadline = computeP5eReadyDeadline(bundle);
    expect(deadline).toBe(Date.parse(capturedAt) + P5E_READY_COUNTDOWN_MS);
  });

  it('returns undefined when anchor is invalid', () => {
    const bundle: P5eMatchBundle = {
      platformGameId: 'test',
      uuids: [],
      capturedAt: 'not-a-date',
    };

    expect(computeP5eReadyDeadline(bundle)).toBeUndefined();
  });

  it('parses millisecond epoch capturedAt from CDP', () => {
    const ms = 1_783_824_044_415;
    expect(parseP5eCapturedAtMs(String(ms))).toBe(ms);
    const bundle: P5eMatchBundle = {
      platformGameId: 'test',
      uuids: [],
      capturedAt: String(ms),
      wsAnchor: { capturedAt: String(ms), platformGameId: 'g1', uuids: [] },
    };
    expect(computeP5eReadyDeadline(bundle)).toBe(ms + P5E_READY_COUNTDOWN_MS);
  });

  it('uses merged API timestamp when present on live CDP payloads', () => {
    const ts = 1783824040;
    const bundle: P5eMatchBundle = {
      platformGameId: 'test',
      uuids: ['u1'],
      capturedAt: 'not-a-date',
      userInfo: {
        url: 'u',
        requestBody: {},
        responseBody: { data: { u1: {} }, timestamp: ts },
      },
    };
    expect(computeP5eReadyDeadline(bundle)).toBe(ts * 1000 + P5E_READY_COUNTDOWN_MS);
  });
});
