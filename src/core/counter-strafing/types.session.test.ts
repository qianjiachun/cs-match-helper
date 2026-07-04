import { describe, expect, it } from 'vitest';
import {
  latestPressSessionAvgError,
  latestPressSessionRecords,
  type ShootingErrorRecord,
} from './types';

function baseRecord(overrides: Partial<ShootingErrorRecord> = {}): ShootingErrorRecord {
  return {
    error: 0,
    scoreLabel: '稳定',
    reason: 'noMovement',
    movementKeysDown: 0,
    crouching: false,
    lastStopAgeMs: 0,
    timingDiffMs: 0,
    fireHeld: false,
    sampleKind: 'fireDown',
    isStable: true,
    timestampMs: 1,
    estimatedSpeed: 0,
    accuracyThreshold: 0.34,
    speedRatio: 0,
    stopSuccessAgeMs: 100,
    counterStrafeActive: false,
    axisConflict: false,
    shotSequenceIndex: 1,
    ...overrides,
  };
}

describe('latestPressSessionRecords', () => {
  it('只包含最近一次按下到当前的所有采样', () => {
    const records = [
      baseRecord({ error: 0.1, sampleKind: 'fireDown', timestampMs: 1 }),
      baseRecord({
        error: 0.2,
        sampleKind: 'fireHeld',
        fireHeld: true,
        shotSequenceIndex: 2,
        timestampMs: 2,
      }),
      baseRecord({ error: 0.5, sampleKind: 'fireDown', timestampMs: 3 }),
      baseRecord({
        error: 0.7,
        sampleKind: 'fireHeld',
        fireHeld: true,
        shotSequenceIndex: 2,
        timestampMs: 4,
      }),
    ];

    expect(latestPressSessionRecords(records)).toHaveLength(2);
    expect(latestPressSessionRecords(records)[0].error).toBe(0.5);
    expect(latestPressSessionRecords(records)[1].error).toBe(0.7);
  });

  it('点射仅返回 fireDown 一条', () => {
    const records = [
      baseRecord({ error: 0.15, sampleKind: 'fireDown' }),
      baseRecord({ error: 0.9, sampleKind: 'fireDown' }),
    ];
    expect(latestPressSessionRecords(records)).toEqual([records[1]]);
  });
});

describe('latestPressSessionAvgError', () => {
  it('按最近一次按下会话求平均误差', () => {
    const records = [
      baseRecord({ error: 0.1, sampleKind: 'fireDown' }),
      baseRecord({
        error: 0.2,
        sampleKind: 'fireHeld',
        fireHeld: true,
        shotSequenceIndex: 2,
      }),
      baseRecord({ error: 0.5, sampleKind: 'fireDown' }),
      baseRecord({
        error: 0.7,
        sampleKind: 'fireHeld',
        fireHeld: true,
        shotSequenceIndex: 2,
      }),
      baseRecord({
        error: 0.9,
        sampleKind: 'fireHeld',
        fireHeld: true,
        shotSequenceIndex: 3,
      }),
    ];

    expect(latestPressSessionAvgError(records)).toBe(0.7);
  });

  it('无记录时返回 null', () => {
    expect(latestPressSessionAvgError([])).toBeNull();
  });
});
