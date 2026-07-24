import { describe, expect, it } from 'vitest';
import { mergeCounterStrafingSettings } from './types';

describe('counter strafing chart settings', () => {
  it('旧设置默认使用直线折线图', () => {
    const settings = mergeCounterStrafingSettings({});
    expect(settings.assessmentChartType).toBe('line');
  });

  it('保留散点模式', () => {
    const settings = mergeCounterStrafingSettings({
      assessmentChartType: 'scatter',
    });
    expect(settings.assessmentChartType).toBe('scatter');
  });
});
