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
      schemaVersion: 3,
      predictedWinner: 'A',
      modelWinProbability: { A: 55, B: 45 },
      winProbability: { A: 55, B: 45 },
      confidence: 70,
      dataCoverage: 0.8,
      headline: 'A 队球员 ELO 更高',
      decisiveFactors: [{ id: '1', dimension: 'strength', advantage: 'A', impact: 2, title: '球员强度', summary: '多名球员 Rating 突出', evidence: [] }],
      playerSignals: [{ steamId: '1', nickname: 'X', side: 'A', kind: 'watch', impact: 2, title: '重点球员', summary: '该球员近期状态好', evidence: [], source: 'legacy' }],
      teamPlans: {
        A: { winConditions: [{ text: '发挥核心球员优势', evidence: [] }], risks: [] },
        B: { winConditions: [], risks: [{ text: '球员样本不足', evidence: [] }] },
      },
      uncertainties: ['B 队球员样本不足'],
      dataQuality: '基于球员数据统计',
    };
    const out = sanitizeAiAnalysisResult(raw);
    expect(out.headline).toBe('A 队玩家 ELO 更高');
    expect(out.decisiveFactors[0].summary).toBe('多名玩家 Rating 突出');
    expect(out.playerSignals[0].summary).toBe('该玩家近期状态好');
    expect(out.teamPlans.A.winConditions[0].text).toBe('发挥核心玩家优势');
    expect(out.teamPlans.B.risks[0].text).toBe('玩家样本不足');
    expect(out.dataQuality).toBe('基于玩家数据统计');
  });
});
