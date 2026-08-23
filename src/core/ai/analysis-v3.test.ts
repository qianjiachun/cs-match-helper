import { describe, expect, it } from 'vitest';
import type { MatchPlayer, MatchRecord } from '@core/match/models';
import {
  buildAiAnalysisContext,
  buildAiInputFingerprint,
  calibrateWinProbability,
  normalizeAiAnalysisResult,
  selectAiPromptEvidence,
} from './analysis-v3';

function player(steamId: string, score: number, side: number, overrides: Partial<MatchPlayer> = {}): MatchPlayer {
  return {
    steamId,
    nickname: `P-${steamId}`,
    teamSide: side,
    score,
    seasonRating: 1.1,
    adpr: 80,
    kd: 1,
    firstKillSuccessRate: 0.5,
    clutchWinRate: 0.5,
    reactionTime: 280,
    assists: 30,
    recentWinRate: 0.5,
    seasonTotalNum: 20,
    mapTotalNum: 12,
    mapWinRate: 0.5,
    isSingle: true,
    radar: {},
    recentResults: [],
    recentRatings: [],
    tags: [],
    ...overrides,
  };
}

function record(): MatchRecord {
  return {
    id: 'ai-v3-test',
    platformId: '5e',
    data: {},
    summary: { playerCount: 4, mapName: 'de_mirage' },
    detail: {
      platformId: '5e',
      mapName: 'de_mirage',
      expectedPlayerCount: 4,
      hasExtraInfo: false,
      parseWarnings: [],
      unassigned: [],
      teams: [
        {
          side: 'A', id: 1, singleCount: 2, partyGroups: [],
          players: [
            player('a1', 2200, 1, { seasonRating: 1.3, adpr: 96, kd: 1.35, firstKillSuccessRate: 0.68, reactionTime: 220, mapWinRate: 0.72 }),
            player('a2', 2020, 1, { firstKillSuccessRate: 0.62, assists: 52, clutchWinRate: 0.64, recentWinRate: 0.66, mapWinRate: 0.64 }),
          ],
        },
        {
          side: 'B', id: 2, singleCount: 2, partyGroups: [],
          players: [
            player('b1', 1900, 2, { seasonRating: 1, adpr: 72, kd: 0.9, reactionTime: 190, mapWinRate: 0.44 }),
            player('b2', 1780, 2, { seasonRating: 0.88, adpr: 64, kd: 0.78, firstKillSuccessRate: 0.36, reactionTime: 330, mapWinRate: 0.28 }),
          ],
        },
      ],
    },
  };
}

describe('AI analysis V3 evidence and calibration', () => {
  it('computes coverage, comparative evidence, reverse direction and a stable fingerprint', () => {
    const match = record();
    const context = buildAiAnalysisContext(match);
    expect(context.dataCoverage).toBe(1);
    expect(context.evidenceById.get('team.elo')?.valueA).toBe('2110');
    expect(context.evidenceById.get('player.a1.reaction')).toMatchObject({
      direction: 'positive',
      comparison: { higherIsBetter: false },
    });
    expect(context.evidenceById.get('player.b2.adr')?.direction).toBe('negative');
    expect(buildAiInputFingerprint(match)).toBe(buildAiInputFingerprint(match));
    match.detail.teams[0].players[0].score = 2300;
    expect(buildAiInputFingerprint(match)).not.toBe(context.inputFingerprint);
  });

  it('adds Perfect current-season WE to player and team evidence', () => {
    const match = record();
    match.platformId = 'perfect';
    match.detail.platformId = 'perfect';
    match.detail.teams[0].players[0].seasonWe = 9.4;
    match.detail.teams[0].players[1].seasonWe = 9;
    match.detail.teams[1].players[0].seasonWe = 7.6;
    match.detail.teams[1].players[1].seasonWe = 8;
    match.detail.teams[0].players[0].rws = undefined;
    match.detail.teams[0].players[0].weRaw = 9.4;
    const context = buildAiAnalysisContext(match);
    expect(context.evidenceById.get('team.seasonWe')).toMatchObject({ label: '平均 WE', valueA: '9.2', valueB: '7.8' });
    expect(context.evidenceById.get('player.a1.seasonWe')).toMatchObject({ label: 'WE', value: '9.4', direction: 'positive' });
    expect(context.evidenceById.has('player.a1.rws')).toBe(false);
  });

  it('normalizes probability before calibrating it toward 50%', () => {
    expect(calibrateWinProbability({ A: 80, B: 20 }, 0.5)).toEqual({ A: 65, B: 35 });
    expect(calibrateWinProbability({ A: 3, B: 1 }, 1)).toEqual({ A: 75, B: 25 });
  });

  it('keeps the prompt catalog reliable and capped at twelve entries per player', () => {
    const context = buildAiAnalysisContext(record());
    const selected = selectAiPromptEvidence(context);
    expect(selected.every((item) => item.reliability !== 'low')).toBe(true);
    for (const steamId of context.roster.keys()) {
      expect(selected.filter((item) => item.steamId === steamId).length).toBeLessThanOrEqual(12);
    }
  });

  it('adds Perfect combat summaries and team CT/T ratings without inventing map-side ratings', () => {
    const match = record();
    match.platformId = 'perfect';
    match.detail.platformId = 'perfect';
    match.detail.teams[0].players[0].combat = {
      sides: { ct: { rating: 1.6 }, t: { rating: 1.4 } },
      opening: { firstKillRate: 0.2, winAfterOpeningKill: 0.78 },
      clutch: { allRate: 0.26, v1: { wins: 8, attempts: 11, rate: 8 / 11 } },
      form: { ratingChange: -0.01, adrChange: -1 },
    };
    match.detail.teams[0].players[0].kast = 259 / 309;
    match.detail.teams[0].players[0].tradeFragRate = 62 / 157;
    match.detail.teams[0].players[0].clutch1v1Rate = 8 / 11;
    match.detail.teams[0].players[0].hotMaps = [{
      map: 'de_mirage', totalMatch: 5, winCount: 4, ctRoundCount: 48, ctWinRoundCount: 33, tRoundCount: 43, tWinRoundCount: 24,
    }];
    match.detail.teams[0].players[1].combat = { sides: { ct: { rating: 1.5 }, t: { rating: 1.45 } } };
    match.detail.teams[1].players[0].combat = { sides: { ct: { rating: 1.1 }, t: { rating: 1.2 } } };
    match.detail.teams[1].players[1].combat = { sides: { ct: { rating: 1.05 }, t: { rating: 1.15 } } };
    const context = buildAiAnalysisContext(match);
    expect(context.evidenceById.get('team.ctRating')?.label).toBe('平均 CT Rating');
    expect(context.evidenceById.get('team.tRating')?.label).toBe('平均 T Rating');
    expect(context.evidenceById.get('player.a1.sides')?.value).toContain('CT 1.6');
    expect(context.evidenceById.get('player.a1.sides')?.value).toContain('本图 CT 回合');
    expect(context.evidenceById.get('player.a1.clutchProfile')?.value).toContain('1vx');
    expect(context.evidenceById.get('player.a1.clutchProfile')?.value).toContain('1v1');
    expect(context.evidenceById.get('player.a1.kast')?.label).toBe('KAST');
    expect(selectAiPromptEvidence(context).some((item) => item.metric === 'sides')).toBe(true);
    const a1Prompt = selectAiPromptEvidence(context).filter((item) => item.steamId === 'a1');
    const directional = a1Prompt.filter((item) => item.direction === 'positive' || item.direction === 'negative');
    expect(directional.some((item) => item.metric === 'elo' || item.metric === 'rating')).toBe(true);
    expect(directional.some((item) => item.metric === 'adr' || item.metric === 'kd')).toBe(true);
  });

  it('validates signal direction, classification thresholds, player limits and low samples', () => {
    const match = record();
    match.detail.teams[0].players[1].seasonTotalNum = 2;
    match.detail.teams[1].players[0].score = 1780;
    const context = buildAiAnalysisContext(match);
    const result = normalizeAiAnalysisResult({
      schemaVersion: 3,
      modelWinProbability: { A: 60, B: 40 },
      confidence: 80,
      headline: 'A 队纸面更强',
      decisiveFactors: [
        { id: 'valid', dimension: 'strength', advantage: 'A', impact: 3, title: 'ELO 优势', summary: 'A 队均分更高', evidenceIds: ['team.elo'] },
        { id: 'unknown', dimension: 'aim', advantage: 'A', impact: 2, title: '无效', summary: '证据不存在', evidenceIds: ['missing'] },
      ],
      playerSignals: [
        { steamId: 'a1', side: 'B', kind: 'carry', impact: 3, title: '多维强点', summary: '强度和枪法均领先', evidenceIds: ['player.a1.elo', 'player.a1.adr'] },
        { steamId: 'a2', side: 'A', kind: 'anchor', impact: 3, title: '支点', summary: '首杀和残局稳定', evidenceIds: ['player.a2.opening', 'player.a2.clutchWinRate'] },
        { steamId: 'b1', side: 'B', kind: 'volatile', impact: 2, title: '变量', summary: '强弱证据并存', evidenceIds: ['player.b1.elo', 'player.b1.reaction'] },
        { steamId: 'b2', side: 'B', kind: 'weakLink', impact: 3, title: '短板', summary: '强度和枪法均落后', evidenceIds: ['player.b2.elo', 'player.b2.adr'] },
        { steamId: 'outside', side: 'B', kind: 'carry', impact: 3, title: '局外人', summary: '不在本局', evidenceIds: ['team.elo'] },
      ],
      teamPlans: {
        A: { winConditions: [{ text: '维持强度优势', evidenceIds: ['team.elo'] }], risks: [] },
        B: { winConditions: [], risks: [{ text: '避免枪法差距扩大', evidenceIds: ['team.adr'] }] },
      },
      uncertainties: [],
    }, context);

    expect(result?.decisiveFactors.map((factor) => factor.id)).toEqual(['valid']);
    expect(result?.playerSignals.map((signal) => [signal.steamId, signal.kind])).toEqual([
      ['a1', 'carry'],
      ['b2', 'weakLink'],
      ['b1', 'volatile'],
    ]);
    expect(result?.confidence).toBe(94);
  });

  it('converts V2 and V1 history signals into V3 without rewriting semantics', () => {
    const v2 = normalizeAiAnalysisResult({
      schemaVersion: 2,
      modelWinProbability: { A: 56, B: 44 },
      winProbability: { A: 55, B: 45 },
      confidence: 70,
      headline: '旧 V2',
      matchupEdges: [{ id: 'edge', dimension: 'strength', advantage: 'A', impact: 2, title: '强度', summary: 'A 更强', evidence: [] }],
      playerMarkers: [
        { steamId: 'a1', nickname: 'A1', side: 'A', kind: 'threat', title: '威胁', summary: '旧强点', impact: 3, evidence: [] },
        { steamId: 'a2', nickname: 'A2', side: 'A', kind: 'key', title: '关键', summary: '方向未知', impact: 2, evidence: [] },
        { steamId: 'b2', nickname: 'B2', side: 'B', kind: 'risk', title: '风险', summary: '旧短板', impact: 2, evidence: [] },
      ],
      winConditions: { A: [{ text: '保持领先', evidence: [] }], B: [] },
      uncertainties: ['地图未知'],
      dataCoverage: 0.8,
    });
    expect(v2?.schemaVersion).toBe(3);
    expect(v2?.playerSignals.map((signal) => signal.kind)).toEqual(['carry', 'watch', 'weakLink']);
    expect(v2?.playerSignals.every((signal) => signal.source === 'legacy')).toBe(true);

    const v1 = normalizeAiAnalysisResult({
      predictedWinner: 'B',
      winProbability: { A: 44, B: 56 },
      confidence: 66,
      headline: '旧 V1',
      keyFactors: [{ side: 'B', type: 'strength', text: '均分更高', weight: 0.8 }],
      playerNotes: [
        { steamId: 'b1', nickname: 'B1', side: 'B', text: '旧关注' },
        { steamId: 'a1', nickname: 'A1', side: 'A', text: '旧风险', role: 'risk' },
      ],
      risks: ['地图未知'],
      teamSummary: { A: '依赖枪法', B: '发挥均分优势' },
    });
    expect(v1?.playerSignals.map((signal) => signal.kind)).toEqual(['watch', 'weakLink']);
    expect(v1?.decisiveFactors).toHaveLength(1);
    expect(v1?.uncertainties).toEqual(['地图未知']);
  });
});
