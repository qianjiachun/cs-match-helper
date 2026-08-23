import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchRecord } from '@core/match/models';

const native = vi.hoisted(() => ({
  cancelAiAnalysis: vi.fn().mockResolvedValue(undefined),
  loadAiSettings: vi.fn(),
  saveAiSettings: vi.fn(),
  startAiAnalysis: vi.fn().mockResolvedValue(undefined),
  onAiAnalysisStart: vi.fn().mockResolvedValue(() => undefined),
  onAiAnalysisDelta: vi.fn().mockResolvedValue(() => undefined),
  onAiAnalysisDone: vi.fn().mockResolvedValue(() => undefined),
  onAiAnalysisError: vi.fn().mockResolvedValue(() => undefined),
  onAiAnalysisCancelled: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock('../native', () => native);

import { useAiAnalysis } from './useAiAnalysis';

function settings(autoAnalyze: boolean) {
  return {
    analysisEnabled: true,
    providerMode: 'deepseek' as const,
    hasApiKey: true,
    apiKey: '',
    apiKeyMasked: '****',
    baseUrl: 'https://example.invalid',
    model: 'test-model',
    thinkingEnabled: false,
    reasoningEffort: 'low',
    autoAnalyze,
    timeoutMs: 30_000,
  };
}

function record(): MatchRecord {
  return {
    id: 'auto-ai',
    platformId: '5e',
    data: {},
    summary: { playerCount: 2 },
    detail: {
      platformId: '5e',
      hasExtraInfo: false,
      parseWarnings: [],
      unassigned: [],
      teams: [
        {
          side: 'A', id: 1, singleCount: 1, partyGroups: [],
          players: [{ steamId: 'a', nickname: 'A', teamSide: 1, score: 2000, seasonRating: 1.1, isSingle: true, radar: {}, recentResults: [], recentRatings: [], tags: [] }],
        },
        {
          side: 'B', id: 2, singleCount: 1, partyGroups: [],
          players: [{ steamId: 'b', nickname: 'B', teamSide: 2, score: 1900, seasonRating: 1, isSingle: true, radar: {}, recentResults: [], recentRatings: [], tags: [] }],
        },
      ],
    },
  };
}

describe('useAiAnalysis automatic analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    native.cancelAiAnalysis.mockResolvedValue(undefined);
    native.startAiAnalysis.mockResolvedValue(undefined);
    native.onAiAnalysisStart.mockResolvedValue(() => undefined);
    native.onAiAnalysisDelta.mockResolvedValue(() => undefined);
    native.onAiAnalysisDone.mockResolvedValue(() => undefined);
    native.onAiAnalysisError.mockResolvedValue(() => undefined);
    native.onAiAnalysisCancelled.mockResolvedValue(() => undefined);
  });

  it('honors autoAnalyze and still allows a manual run', async () => {
    native.loadAiSettings.mockResolvedValue(settings(false));
    const ai = useAiAnalysis({ autoInit: false });
    const match = record();

    await ai.maybeAutoAnalyze(match);
    expect(native.startAiAnalysis).not.toHaveBeenCalled();

    await ai.analyzeMatch(match, true);
    expect(native.startAiAnalysis).toHaveBeenCalledTimes(1);
  });

  it('deduplicates the same fingerprint and reruns after statistics change', async () => {
    native.loadAiSettings.mockResolvedValue(settings(true));
    const ai = useAiAnalysis({ autoInit: false });
    const match = record();

    await ai.maybeAutoAnalyze(match);
    await ai.maybeAutoAnalyze(match);
    expect(native.startAiAnalysis).toHaveBeenCalledTimes(1);

    match.detail.teams[0].players[0].score = 2150;
    await ai.maybeAutoAnalyze(match);
    expect(native.startAiAnalysis).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous complete result during a rerun and after update failure', async () => {
    native.loadAiSettings.mockResolvedValue(settings(true));
    const ai = useAiAnalysis({ autoInit: false });
    const match = record();

    await ai.maybeAutoAnalyze(match);
    const done = native.onAiAnalysisDone.mock.calls[0][0] as (event: Record<string, unknown>) => void;
    done({
      matchId: match.id,
      fullText: JSON.stringify({
        schemaVersion: 3,
        modelWinProbability: { A: 60, B: 40 },
        confidence: 75,
        headline: '第一份完整结果',
        decisiveFactors: [{ id: 'elo', dimension: 'strength', advantage: 'A', impact: 3, title: '均分领先', summary: 'A 队 ELO 更高', evidenceIds: ['team.elo'] }],
        playerSignals: [],
        teamPlans: {
          A: { winConditions: [], risks: [] },
          B: { winConditions: [], risks: [] },
        },
        uncertainties: [],
      }),
      usage: null,
      elapsedMs: 100,
    });
    expect(ai.result.value?.headline).toBe('第一份完整结果');

    await ai.analyzeMatch(match, true);
    expect(ai.status.value).toBe('loading');
    expect(ai.result.value?.headline).toBe('第一份完整结果');

    const fail = native.onAiAnalysisError.mock.calls[0][0] as (event: Record<string, unknown>) => void;
    fail({ matchId: match.id, error: 'network failed' });
    expect(ai.status.value).toBe('error');
    expect(ai.result.value?.headline).toBe('第一份完整结果');
  });

  it('throttles stream updates and exposes a calibrated probability preview', async () => {
    native.loadAiSettings.mockResolvedValue(settings(true));
    const ai = useAiAnalysis({ autoInit: false });
    const match = record();
    await ai.maybeAutoAnalyze(match);
    const delta = native.onAiAnalysisDelta.mock.calls[0][0] as (event: Record<string, unknown>) => void;

    vi.useFakeTimers();
    try {
      delta({
        matchId: match.id,
        fullText: '{"schemaVersion":3,"modelWinProbability":{"A":70,"B":30},"confidence":80',
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(ai.preview.value?.modelWinProbability).toEqual({ A: 70, B: 30 });
      expect((ai.preview.value?.winProbability.A ?? 0)).toBeLessThan(70);
      const firstPreview = ai.preview.value?.winProbability.A;

      delta({
        matchId: match.id,
        fullText: '{"schemaVersion":3,"modelWinProbability":{"A":80,"B":20},"confidence":80',
      });
      await vi.advanceTimersByTimeAsync(79);
      expect(ai.preview.value?.winProbability.A).toBe(firstPreview);
      await vi.advanceTimersByTimeAsync(1);
      expect(ai.preview.value?.modelWinProbability).toEqual({ A: 80, B: 20 });
    } finally {
      vi.useRealTimers();
    }
  });
});
