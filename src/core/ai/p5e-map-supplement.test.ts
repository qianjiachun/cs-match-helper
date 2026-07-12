import { describe, expect, it } from 'vitest';
import type { AiAnalysisResult } from './types';
import {
  addTokenUsage,
  buildP5eMapSupplementRequest,
  hasP5eMapReady,
  mergeAiMapSupplement,
  parseP5eMapSupplementResult,
  resolveP5eMapStatus,
} from './p5e-map-supplement';
import { buildP5eMatchSummary } from './p5e-prompt';
import type { MatchRecord } from '@core/match/models';

const baseResult: AiAnalysisResult = {
  predictedWinner: 'A',
  winProbability: { A: 55, B: 45 },
  confidence: 62,
  headline: 'A 队 ELO 略优',
  quickReasons: ['ELO 差距'],
  keyFactors: [{ side: 'A', type: 'strength', text: 'ELO 更高', weight: 0.8 }],
  playerNotes: [],
  risks: ['样本偏少'],
  dataQuality: '无地图信息',
};

function makeP5eRecord(mapName?: string): MatchRecord {
  return {
    id: '5e-test',
    platformId: '5e',
    data: {},
    summary: {
      playerCount: 10,
      mapName,
      mode: '优先',
    },
    detail: {
      platformId: '5e',
      mapName,
      teams: [
        {
          side: 'A',
          id: 1,
          players: [
            {
              steamId: '5e-abc',
              nickname: 'P1',
              teamSide: 1,
              isSingle: false,
              radar: {},
              recentResults: [],
              recentRatings: [],
              tags: [],
              mapWinRate: mapName ? 0.6 : undefined,
              mapTotalNum: mapName ? 20 : undefined,
            },
          ],
          singleCount: 0,
          partyGroups: [],
        },
        {
          side: 'B',
          id: 2,
          players: [
            {
              steamId: '5e-def',
              nickname: 'P2',
              teamSide: 2,
              isSingle: false,
              radar: {},
              recentResults: [],
              recentRatings: [],
              tags: [],
            },
          ],
          singleCount: 0,
          partyGroups: [],
        },
      ],
      unassigned: [],
      hasExtraInfo: true,
      parseWarnings: [],
    },
  };
}

describe('p5e-map-supplement', () => {
  it('hasP5eMapReady reflects map presence', () => {
    expect(hasP5eMapReady(makeP5eRecord('de_dust2'))).toBe(true);
    expect(hasP5eMapReady(makeP5eRecord())).toBe(false);
    expect(resolveP5eMapStatus(makeP5eRecord())).toBe('unknown');
    expect(resolveP5eMapStatus(makeP5eRecord('de_mirage'))).toBe('ready');
  });

  it('buildP5eMatchSummary marks unknown map without mapWinRate in payload', () => {
    const summary = buildP5eMatchSummary(makeP5eRecord());
    expect(summary.match.mapStatus).toBe('unknown');
    expect(summary.dataQuality.mapUnknown).toBe(true);
    expect(summary.mapFitHint).toBeUndefined();
    const players = summary.teams.flatMap((t) => t.players ?? []);
    expect(players.every((p) => p.mapWinRate == null)).toBe(true);
  });

  it('buildP5eMatchSummary includes map fields when ready', () => {
    const summary = buildP5eMatchSummary(makeP5eRecord('de_dust2'));
    expect(summary.match.mapStatus).toBe('ready');
    expect(summary.mapFitHint).toBeTruthy();
    const players = summary.teams.flatMap((t) => t.players ?? []);
    expect(players.some((p) => p.mapWinRate != null)).toBe(true);
  });

  it('buildP5eMapSupplementRequest embeds previous analysis', () => {
    const req = buildP5eMapSupplementRequest(makeP5eRecord('de_dust2'), baseResult);
    expect(req.systemPrompt).toContain('增量补充');
    expect(req.userPrompt).toContain('previousAnalysis');
    expect(req.userPrompt).toContain('de_dust2');
    expect(req.userPrompt).toContain('A 队 ELO 略优');
  });

  it('mergeAiMapSupplement appends map factors and updates probability', () => {
    const delta = {
      winProbability: { A: 58, B: 42 },
      confidence: 68,
      quickReasonsAdd: ['A 队 Mirage 胜率更高'],
      keyFactorsAdd: [{ side: 'A' as const, type: 'map' as const, text: '地图适配', weight: 0.7 }],
      risksAdd: ['B 队该图样本少'],
      dataQuality: '已纳入地图数据',
    };
    const merged = mergeAiMapSupplement(baseResult, delta);
    expect(merged.winProbability.A).toBe(58);
    expect(merged.keyFactors).toHaveLength(2);
    expect(merged.quickReasons).toHaveLength(2);
    expect(merged.risks).toContain('B 队该图样本少');
    expect(merged.dataQuality).toContain('已纳入地图数据');
  });

  it('parseP5eMapSupplementResult parses delta JSON', () => {
    const raw = JSON.stringify({
      winProbability: { A: 52, B: 48 },
      keyFactorsAdd: [{ side: 'B', type: 'map', text: 'B 队强图', weight: 0.6 }],
    });
    const parsed = parseP5eMapSupplementResult(raw);
    expect(parsed?.winProbability?.B).toBe(48);
    expect(parsed?.keyFactorsAdd?.[0]?.text).toBe('B 队强图');
  });

  it('addTokenUsage sums prompt and completion tokens', () => {
    const total = addTokenUsage(
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
    );
    expect(total).toEqual({ promptTokens: 180, completionTokens: 90, totalTokens: 270 });
  });
});
