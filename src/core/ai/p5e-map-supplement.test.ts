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
import { buildAiAnalysisContext } from './analysis-v3';
import type { MatchRecord } from '@core/match/models';

const baseResult: AiAnalysisResult = {
  schemaVersion: 3,
  predictedWinner: 'A',
  modelWinProbability: { A: 55, B: 45 },
  winProbability: { A: 55, B: 45 },
  confidence: 62,
  dataCoverage: 0.8,
  headline: 'A 队 ELO 略优',
  decisiveFactors: [{
    id: 'base-elo', dimension: 'strength', advantage: 'A', impact: 2, title: 'ELO', summary: 'A 队略高',
    evidence: [{ id: 'team.elo', scope: 'team', metric: 'elo', label: '平均 ELO', valueA: '2000', valueB: '1900', reliability: 'high' }],
  }],
  playerSignals: [],
  teamPlans: {
    A: { winConditions: [], risks: [] },
    B: { winConditions: [], risks: [] },
  },
  uncertainties: ['样本偏少'],
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
              score: 2000,
              seasonRating: 1.1,
              seasonTotalNum: 20,
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
              score: 1900,
              seasonRating: 1,
              seasonTotalNum: 20,
              mapWinRate: mapName ? 0.3 : undefined,
              mapTotalNum: mapName ? 20 : undefined,
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
    expect(req.userPrompt).not.toContain('fastSummary');
    expect(req.userPrompt).not.toContain('deepContext');
    expect(req.userPrompt.length).toBeLessThan(8 * 1024);
  });

  it('mergeAiMapSupplement atomically appends valid map factors and signals', () => {
    const record = makeP5eRecord('de_mirage');
    const context = buildAiAnalysisContext(record);
    const delta = {
      modelWinProbability: { A: 58, B: 42 },
      confidence: 68,
      decisiveFactorsAdd: [
        { id: 'map-edge', dimension: 'map', advantage: 'A', impact: 3, title: '地图适配', summary: 'A 队本图更强', evidenceIds: ['player.5e-abc.map'] },
        { id: 'invalid-strength', dimension: 'strength', advantage: 'A', impact: 3, title: '越界修改', summary: '地图补充不得改基础强度', evidenceIds: ['player.5e-abc.map'] },
      ],
      playerSignalsAdd: [
        { steamId: '5e-abc', side: 'A', kind: 'specialist', impact: 3, title: '地图专长', summary: '本图样本与胜率突出', evidenceIds: ['player.5e-abc.map'] },
        { steamId: '5e-def', side: 'B', kind: 'carry', impact: 3, title: '越界信号', summary: '地图补充不得新增强点', evidenceIds: ['player.5e-def.map'] },
      ],
      uncertaintiesAdd: ['B 队该图表现偏弱'],
    };
    const merged = mergeAiMapSupplement(baseResult, delta, context);
    expect(merged.modelWinProbability.A).toBe(58);
    expect(merged.winProbability.A).toBe(58);
    expect(merged.decisiveFactors.map((factor) => factor.id)).toEqual(['map-edge', 'base-elo']);
    expect(merged.playerSignals[0]).toMatchObject({ steamId: '5e-abc', kind: 'specialist' });
    expect(merged.uncertainties).toContain('B 队该图表现偏弱');
  });

  it('parseP5eMapSupplementResult parses delta JSON', () => {
    const raw = JSON.stringify({
      modelWinProbability: { A: 52, B: 48 },
      decisiveFactorsAdd: [{ id: 'map', dimension: 'map', advantage: 'B', impact: 2, title: 'B 队强图', summary: '地图数据领先', evidenceIds: ['player.x.map'] }],
    });
    const parsed = parseP5eMapSupplementResult(raw);
    expect(parsed?.modelWinProbability?.B).toBe(48);
    expect(parsed?.decisiveFactorsAdd?.[0]?.title).toBe('B 队强图');
  });

  it('addTokenUsage sums prompt and completion tokens', () => {
    const total = addTokenUsage(
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
    );
    expect(total).toEqual({ promptTokens: 180, completionTokens: 90, totalTokens: 270 });
  });
});
