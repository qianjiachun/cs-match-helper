import type { AiAnalysisResult } from '@core/ai/types';
import type { MatchRecord } from '@core/match/models';
import { P5eMatchAggregator } from '@platforms/5e/aggregator';
import fixture from '@platforms/5e/fixtures/5e-match-success.fixture.json';
import { createP5eMatchRecord } from '@platforms/5e/match-parser';
import type { P5eApiPayload } from '@platforms/5e/types';
import type { MatchHistoryApi } from '../composables/useMatchHistory';

const MOCK_MAPS = [
  'de_dust2',
  'de_mirage',
  'de_inferno',
  'de_nuke',
  'de_overpass',
  'de_vertigo',
  'de_ancient',
  'de_anubis',
  'de_train',
] as const;

export type MockHistoryPlatformMix = 'both' | 'perfect' | '5e';

export interface SeedMockMatchHistoryOptions {
  count?: number;
  platformMix?: MockHistoryPlatformMix;
  /** 约每 3 条写入 1 条带 AI 分析的记录 */
  withAi?: boolean;
}

function formatMatchTime(savedAt: number): string {
  return new Date(savedAt).toLocaleString('zh-CN', { hour12: false });
}

function buildTeam(side: 'A' | 'B', teamId: number, baseScore: number, seed: number) {
  const players = Array.from({ length: 5 }, (_, i) => ({
    steamId: `${side}-${seed}-${i}`,
    nickname: `${side}${i + 1}`,
    teamSide: side === 'A' ? 1 : 2,
    isSingle: false,
    score: baseScore + (i % 3) * 30 - 20,
    radar: {},
    recentResults: [],
    recentRatings: [],
    tags: [] as string[],
  }));
  const scores = players.map((p) => p.score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return {
    side,
    id: teamId,
    players,
    singleCount: 0,
    partyGroups: [],
    avgScore,
  };
}

export function buildMockPerfectRecord(seed: number, mapName: string, savedAt: number): MatchRecord {
  const id = `mock-perfect-${seed}-${savedAt}`;
  const scoreA = 1900 + (seed % 7) * 45;
  const scoreB = 1860 + (seed % 5) * 38;
  const teamA = buildTeam('A', 1, scoreA, seed);
  const teamB = buildTeam('B', 2, scoreB, seed + 100);

  return {
    id,
    platformId: 'perfect',
    time: formatMatchTime(savedAt),
    data: {},
    summary: {
      playerCount: 10,
      mapName,
      mode: seed % 4 === 0 ? '娱乐' : '天梯',
      platformGameId: id,
    },
    detail: {
      platformId: 'perfect',
      platformGameId: id,
      mapName,
      teams: [teamA, teamB],
      unassigned: [],
      hasExtraInfo: true,
      parseWarnings: [],
      insights: {
        strongerSide: scoreA >= scoreB ? 'A' : 'B',
        scoreDiff: Math.abs(scoreA - scoreB),
        highlights: ['调试模拟数据'],
        risks: [],
        tendencies: [],
      },
    },
  };
}

let p5eFixtureBundle: ReturnType<P5eMatchAggregator['ingestFixtureEvents']> | null = null;

function getP5eFixtureBundle() {
  if (!p5eFixtureBundle) {
    const agg = new P5eMatchAggregator();
    p5eFixtureBundle = agg.ingestFixtureEvents(fixture.events as Record<string, P5eApiPayload>);
  }
  return p5eFixtureBundle;
}

export function buildMockP5eRecord(seed: number, mapName: string, savedAt: number): MatchRecord {
  const bundle = getP5eFixtureBundle();
  if (!bundle) {
    throw new Error('5E fixture 数据不完整');
  }
  const id = `mock-5e-${seed}-${savedAt}`;
  const record = createP5eMatchRecord({
    ...bundle,
    platformGameId: id,
    matchCode: `g161-n-mock-${seed}`,
    mapName,
    capturedAt: savedAt,
  });
  record.time = formatMatchTime(savedAt);
  return record;
}

export function buildMockAiResult(predictedWinner: 'A' | 'B'): AiAnalysisResult {
  const probA = predictedWinner === 'A' ? 58 : 42;
  return {
    predictedWinner,
    winProbability: { A: probA, B: 100 - probA },
    confidence: 72,
    headline: '模拟 AI 分析：均分与近期表现略倾向一侧',
    quickReasons: ['A 队均分略高', '近期胜率更稳定'],
    keyFactors: [
      { label: '均分对比', text: '两队 ELO 接近，A 队小幅领先', weight: 0.55 },
      { label: '组排结构', text: '双方均有 2 人组排', weight: 0.25 },
    ],
    playerNotes: [
      {
        steamId: 'A-0-0',
        nickname: 'A1',
        side: 'A',
        text: '模拟高评分突破手',
        role: 'entry',
      },
    ],
    risks: ['本局为调试面板生成的模拟数据'],
    dataQuality: 'mock',
    teamSummary: { A: '进攻节奏偏快', B: '防守站位较稳' },
  };
}

export async function seedMockMatchHistory(
  api: MatchHistoryApi,
  options: SeedMockMatchHistoryOptions = {},
): Promise<{ saved: number }> {
  const count = Math.max(1, Math.min(options.count ?? 25, 200));
  const platformMix = options.platformMix ?? 'both';
  const withAi = options.withAi ?? true;
  const baseNow = Date.now();

  let saved = 0;
  for (let i = 0; i < count; i++) {
    const savedAt = baseNow - i * 3_600_000;
    const mapName = MOCK_MAPS[i % MOCK_MAPS.length];
    const use5e =
      platformMix === '5e' || (platformMix === 'both' && i % 2 === 1);
    const record = use5e
      ? buildMockP5eRecord(i, mapName, savedAt)
      : buildMockPerfectRecord(i, mapName, savedAt);
    const platformId = api.platformOf(record);

    await api.saveMatchSnapshot(record, { savedAt });

    if (withAi && i % 3 === 0) {
      const winner: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
      await api.patchMatchAi(record.id, platformId, {
        status: 'done',
        result: buildMockAiResult(winner),
        analyzedAt: savedAt + 60_000,
        elapsedMs: 4200,
        model: 'mock-debug',
        providerMode: 'deepseek',
        fallbackRecord: record,
      });
    }

    saved++;
  }

  return { saved };
}
