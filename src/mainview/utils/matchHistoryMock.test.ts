import { afterEach, describe, expect, it } from 'vitest';
import { applyResolvedLocale } from '../i18n';
import { buildMockAiResult, buildMockPerfectRecord } from './matchHistoryMock';

afterEach(() => applyResolvedLocale('zh-CN'));

describe('localized mock match history', () => {
  it('generates English match and AI copy for an English session', () => {
    applyResolvedLocale('en-US');

    const record = buildMockPerfectRecord(0, 'de_mirage', Date.UTC(2026, 0, 1));
    const ai = buildMockAiResult('A');

    expect(record.summary.mode).toBe('Casual');
    expect(ai.headline).toContain('Mock AI analysis');
    expect(ai.uncertainties.join(' ')).not.toMatch(/[\p{Script=Han}]/u);
  });

  it('keeps Chinese mock copy for a Chinese session', () => {
    applyResolvedLocale('zh-CN');

    expect(buildMockPerfectRecord(1, 'de_nuke', Date.UTC(2026, 0, 1)).summary.mode).toBe('天梯');
    expect(buildMockAiResult('B').headline).toContain('模拟 AI 分析');
  });
});
