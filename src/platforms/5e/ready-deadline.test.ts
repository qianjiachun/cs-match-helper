import { describe, expect, it } from 'vitest';
import fixture from './fixtures/5e-match-success.fixture.json';
import { P5eMatchAggregator } from './aggregator';
import { P5E_READY_COUNTDOWN_MS, computeP5eReadyDeadline } from './ready-deadline';
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
});
