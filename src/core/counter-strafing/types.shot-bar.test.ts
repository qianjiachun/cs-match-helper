import { describe, expect, it } from 'vitest';
import {
  SHOT_BAR_MIN_VISIBLE_RATIO,
  SHOT_BAR_MICRO_RATIO,
  SHOT_BAR_MIN_YELLOW_RATIO,
  SHOT_BAR_THRESHOLD_LINE_RATIO,
  SHOT_BAR_YELLOW_START_RATIO,
  shotBarSegments,
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

describe('shotBarSegments', () => {
  it('完全停稳：仅绿色底段，保留最小可见高度', () => {
    const seg = shotBarSegments(baseRecord({ speedRatio: 0 }));
    expect(seg.state).toBe('stable');
    expect(seg.greenRatio).toBe(SHOT_BAR_MIN_VISIBLE_RATIO);
    expect(seg.yellowRatio).toBe(0);
    expect(seg.redRatio).toBe(0);
    expect(seg.isTapFirst).toBe(true);
  });

  it('按住蹲移动射击：低绿柱，不出现黄/红', () => {
    const seg = shotBarSegments(
      baseRecord({
        reason: 'crouching',
        crouching: true,
        scoreLabel: '蹲射',
        movementKeysDown: 1,
        estimatedSpeed: 0.2,
        speedRatio: 0,
      }),
    );
    expect(seg.state).toBe('stable');
    expect(seg.greenRatio).toBe(SHOT_BAR_MIN_VISIBLE_RATIO);
    expect(seg.yellowRatio).toBe(0);
    expect(seg.redRatio).toBe(0);
    expect(seg.stableColor).toBe('#4ade80');
  });

  it('松蹲宽限：青绿色低柱', () => {
    const seg = shotBarSegments(
      baseRecord({ reason: 'crouchGrace', crouchGraceActive: true, speedRatio: 0 }),
    );
    expect(seg.isCrouchGrace).toBe(true);
    expect(seg.stableColor).toBe('#5eead4');
    expect(seg.greenRatio).toBe(SHOT_BAR_MIN_VISIBLE_RATIO);
  });

  it('擦阈值：绿色段随 speedRatio 升高', () => {
    const seg = shotBarSegments(baseRecord({ speedRatio: 1 }));
    expect(seg.state).toBe('stable');
    expect(seg.greenRatio).toBe(SHOT_BAR_THRESHOLD_LINE_RATIO);
    expect(seg.yellowRatio).toBe(0);
    expect(seg.redRatio).toBe(0);
  });

  it('刚超阈：出现最小黄柱', () => {
    const seg = shotBarSegments(
      baseRecord({ speedRatio: SHOT_BAR_YELLOW_START_RATIO + 0.01, isStable: false, scoreLabel: '微动' }),
    );
    expect(seg.state).toBe('micro');
    expect(seg.yellowRatio).toBeGreaterThanOrEqual(SHOT_BAR_MIN_YELLOW_RATIO * (1 - SHOT_BAR_THRESHOLD_LINE_RATIO));
    expect(seg.redRatio).toBe(0);
  });

  it('1.2x 微动：黄柱明显高于线性旧版', () => {
    const seg = shotBarSegments(
      baseRecord({ speedRatio: 1.2, error: 0.4, isStable: false, scoreLabel: '微动' }),
    );
    const linearOld = ((1.2 - 1) / (SHOT_BAR_MICRO_RATIO - 1)) * (1 - SHOT_BAR_THRESHOLD_LINE_RATIO);
    expect(seg.yellowRatio).toBeGreaterThan(linearOld);
    expect(seg.redRatio).toBe(0);
  });

  it('1.4x：黄柱接近满，无红段', () => {
    const seg = shotBarSegments(
      baseRecord({ speedRatio: 1.4, error: 0.8, isStable: false, scoreLabel: '微动' }),
    );
    expect(seg.state).toBe('micro');
    expect(seg.greenRatio).toBeGreaterThan(0);
    expect(seg.yellowRatio).toBeGreaterThan(0);
    expect(seg.redRatio).toBe(0);
  });

  it('跑打：整柱纯红，无绿/黄段', () => {
    const seg = shotBarSegments(
      baseRecord({
        speedRatio: 2,
        error: 1,
        isStable: false,
        scoreLabel: '跑打',
      }),
    );
    expect(seg.state).toBe('run');
    expect(seg.greenRatio).toBe(0);
    expect(seg.yellowRatio).toBe(0);
    expect(seg.redRatio).toBeGreaterThan(SHOT_BAR_THRESHOLD_LINE_RATIO);
  });

  it('方向冲突：整柱纯红', () => {
    const seg = shotBarSegments(
      baseRecord({
        speedRatio: 1.2,
        axisConflict: true,
        isStable: false,
        reason: 'axisConflict',
        scoreLabel: '跑打',
      }),
    );
    expect(seg.state).toBe('run');
    expect(seg.greenRatio).toBe(0);
    expect(seg.yellowRatio).toBe(0);
    expect(seg.redRatio).toBeGreaterThan(0);
  });

  it('连发采样：标记 fireHeld', () => {
    const seg = shotBarSegments(
      baseRecord({
        sampleKind: 'fireHeld',
        fireHeld: true,
        shotSequenceIndex: 3,
        speedRatio: 1.1,
        error: 0.2,
        isStable: false,
      }),
    );
    expect(seg.isFireHeld).toBe(true);
    expect(seg.isTapFirst).toBe(false);
  });
});
