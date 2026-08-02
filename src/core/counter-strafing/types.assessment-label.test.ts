import { describe, expect, it } from 'vitest';
import { comboLabel, type CounterStrafingAssessmentRecord } from './types';

function record(
  timing: CounterStrafingAssessmentRecord['timing'],
  options: Partial<CounterStrafingAssessmentRecord> = {},
): CounterStrafingAssessmentRecord {
  return {
    axis: 'horizontal',
    fromKey: 'A',
    toKey: 'D',
    diffMs: 0,
    timing,
    timingLabel: '',
    isPerfect: false,
    isSuccess: false,
    timestampMs: 0,
    ...options,
  };
}

describe('counter-strafing assessment labels', () => {
  it.each([
    [record('perfect', { isPerfect: true }), '完美', 'Perfect'],
    [record('late', { isSuccess: true }), '优秀', 'Good'],
    [record('early'), '偏早', 'Early'],
    [record('late'), '偏晚', 'Late'],
  ])('根据界面语言显示等级 %#', (sample, zhLabel, enLabel) => {
    expect(comboLabel(sample, 'zh-CN')).toBe(zhLabel);
    expect(comboLabel(sample, 'en-US')).toBe(enLabel);
  });
});
