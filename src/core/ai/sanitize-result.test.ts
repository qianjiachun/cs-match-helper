import { describe, expect, it } from 'vitest';
import { sanitizeAiAnalysisResult, sanitizeAiText } from './sanitize-result';
import type { AiAnalysisResult } from './types';

describe('sanitizeAiText', () => {
  it('replaces 球员 with 玩家', () => {
    expect(sanitizeAiText('A 队核心球员发挥稳定')).toBe('A 队核心玩家发挥稳定');
    expect(sanitizeAiText('玩家状态良好')).toBe('玩家状态良好');
  });
});

describe('sanitizeAiAnalysisResult', () => {
  it('sanitizes all user-facing text fields', () => {
    const raw: AiAnalysisResult = {
      predictedWinner: 'A',
      winProbability: { A: 55, B: 45 },
      confidence: 70,
      headline: 'A 队球员 ELO 更高',
      quickReasons: ['关键球员地图胜率高'],
      keyFactors: [{ side: 'A', type: 'strength', text: '多名球员 Rating 突出', weight: 0.8 }],
      playerNotes: [{ steamId: '1', nickname: 'X', side: 'A', text: '该球员近期状态好' }],
      risks: ['B 队球员样本不足'],
      dataQuality: '基于球员数据统计',
    };
    const out = sanitizeAiAnalysisResult(raw);
    expect(out.headline).toBe('A 队玩家 ELO 更高');
    expect(out.quickReasons?.[0]).toBe('关键玩家地图胜率高');
    expect(out.keyFactors[0].text).toBe('多名玩家 Rating 突出');
    expect(out.playerNotes[0].text).toBe('该玩家近期状态好');
    expect(out.risks[0]).toBe('B 队玩家样本不足');
    expect(out.dataQuality).toBe('基于玩家数据统计');
  });
});
