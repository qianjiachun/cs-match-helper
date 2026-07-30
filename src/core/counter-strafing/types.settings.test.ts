import { describe, expect, it } from 'vitest';
import { mergeCounterStrafingSettings } from './types';

describe('counter strafing chart settings', () => {
  it('旧设置默认开启 GSI 增强', () => {
    const settings = mergeCounterStrafingSettings({});
    expect(settings.gsiEnhancementEnabled).toBe(true);
  });

  it('保留用户关闭的 GSI 增强设置', () => {
    const settings = mergeCounterStrafingSettings({
      gsiEnhancementEnabled: false,
    });
    expect(settings.gsiEnhancementEnabled).toBe(false);
  });

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
