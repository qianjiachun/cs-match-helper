import { describe, expect, it } from 'vitest';
import { P5eMatchAggregator } from '@platforms/5e/aggregator';
import fixture from '@platforms/5e/fixtures/5e-match-success.fixture.json';
import { createP5eMatchRecord } from '@platforms/5e/match-parser';
import type { P5eApiPayload, P5eMatchBundle } from '@platforms/5e/types';
import { buildAiAnalysisRequest } from '@core/ai/prompt';
import {
  buildDocumentFromMatch,
  documentToViewModel,
} from './index';
import type { MatchRecord } from '../models';

function buildPerfectRecord(): MatchRecord {
  return {
    id: 'perfect-parity',
    platformId: 'perfect',
    time: '2026-07-12 12:00:00',
    data: { rawIgnored: true },
    summary: {
      playerCount: 10,
      mapName: 'de_mirage',
      mode: '天梯',
    },
    detail: {
      platformId: 'perfect',
      mapName: 'de_mirage',
      teams: [
        {
          side: 'A',
          id: 1,
          players: [
            {
              steamId: '1',
              nickname: 'A1',
              teamSide: 1,
              isSingle: false,
              score: 2100,
              radar: {},
              recentResults: [],
              recentRatings: [],
              tags: [],
            },
          ],
          singleCount: 0,
          partyGroups: [],
          avgScore: 2100,
        },
        {
          side: 'B',
          id: 2,
          players: [
            {
              steamId: '2',
              nickname: 'B1',
              teamSide: 2,
              isSingle: false,
              score: 2000,
              radar: {},
              recentResults: [],
              recentRatings: [],
              tags: [],
            },
          ],
          singleCount: 0,
          partyGroups: [],
          avgScore: 2000,
        },
      ],
      unassigned: [],
      hasExtraInfo: true,
      parseWarnings: [],
      insights: {
        strongerSide: 'A',
        scoreDiff: 100,
        highlights: ['A 均分略高'],
        risks: [],
        tendencies: [],
      },
    },
  };
}

function buildP5eRecord(): MatchRecord {
  const agg = new P5eMatchAggregator();
  const bundle = agg.ingestFixtureEvents(fixture.events as Record<string, P5eApiPayload>);
  expect(bundle).not.toBeNull();
  const enriched: P5eMatchBundle = {
    ...bundle!,
    mapName: 'de_dust2',
  };
  return createP5eMatchRecord(enriched);
}

describe('history AI prompt parity', () => {
  it('perfect: restored record yields identical userPrompt', () => {
    const live = buildPerfectRecord();
    const liveReq = buildAiAnalysisRequest(live);
    const doc = buildDocumentFromMatch(live, { includeEmptyAi: false });
    const restored = documentToViewModel(doc).record;
    expect(restored).toBeTruthy();
    const restoredReq = buildAiAnalysisRequest(restored!);
    expect(restoredReq.userPrompt).toBe(liveReq.userPrompt);
    expect(restoredReq.systemPrompt).toBe(liveReq.systemPrompt);
  });

  it('5e: restored record with p5eBundle yields identical userPrompt', () => {
    const live = buildP5eRecord();
    expect(live.data.p5eBundle).toBeTruthy();
    const liveReq = buildAiAnalysisRequest(live);
    const doc = buildDocumentFromMatch(live, { includeEmptyAi: false });
    const restored = documentToViewModel(doc).record;
    expect(restored?.data.p5eBundle).toBeTruthy();
    const restoredReq = buildAiAnalysisRequest(restored!);
    expect(restoredReq.userPrompt).toBe(liveReq.userPrompt);
    expect(restoredReq.systemPrompt).toBe(liveReq.systemPrompt);
  });
});
