import { describe, expect, it } from 'vitest';
import { P5eMatchAggregator } from '@platforms/5e/aggregator';
import fixture from '@platforms/5e/fixtures/5e-match-success.fixture.json';
import { createP5eMatchRecord } from '@platforms/5e/match-parser';
import type { MatchRecord } from '@core/match/models';
import type { P5eApiPayload, P5eMatchBundle } from '@platforms/5e/types';
import {
  buildAiAnalysisRequest,
  buildMatchSummary,
  buildPerfectAiAnalysisRequest,
} from './prompt';
import {
  P5E_SYSTEM_PROMPT,
  buildP5eAiAnalysisRequest,
  buildP5eMatchSummary,
} from './p5e-prompt';

const FIXTURE_UUIDS = [
  '76af4325-dd04-11ed-9ce2-ec0d9a495494',
  'fd023f9a-efda-11f0-a93a-0c42a164bc3c',
  'ed954be0-7222-11ee-9ce2-ec0d9a495494',
  '9765b3f5-fd93-11ef-848e-506b4bfa3106',
  'f0b5effe-f25d-11ea-a071-ec0d9a718678',
  'b6c90410-53b8-11ef-ac9f-ec0d9a7185e0',
  '6fb40ff3-e1fc-11ef-848e-506b4bfa3106',
  'ee440358-95ee-11ef-ac9f-ec0d9a7185e0',
  'a2f6b0d8-8504-11f0-a93a-0c42a164bc3c',
  '921e3a65-62af-11f0-a93a-0c42a164bc3c',
];

function buildMatchDetailFromUuids(uuids: string[]) {
  const toEntry = (uuid: string) => ({
    user_info: { user_data: { uuid } },
    fight: { rating: 1.1, adr: 80, rws: 8, kill: 15, death: 10 },
    sts: { change_elo: 5, origin_elo: 1800 },
  });
  return {
    data: {
      main: { map: 'de_dust2', map_desc: '炙热沙城 II' },
      group_1: uuids.slice(0, 5).map(toEntry),
      group_2: uuids.slice(5, 10).map(toEntry),
    },
  };
}

function buildP5eRecord(withMatchDetail = false): MatchRecord {
  const agg = new P5eMatchAggregator();
  const bundle = agg.ingestFixtureEvents(fixture.events as Record<string, P5eApiPayload>);
  expect(bundle).not.toBeNull();

  const enriched: P5eMatchBundle = {
    ...bundle!,
    mapName: 'de_dust2',
    ...(withMatchDetail ? { matchDetail: buildMatchDetailFromUuids(FIXTURE_UUIDS) } : {}),
  };

  return createP5eMatchRecord(enriched);
}

function buildPerfectRecord(): MatchRecord {
  return {
    id: 'perfect-test',
    platformId: 'perfect',
    data: {},
    summary: {
      playerCount: 10,
      mapName: 'de_mirage',
      mode: '竞技',
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
              steamId: '76561198000000001',
              nickname: 'PlayerA',
              teamSide: 1,
              isSingle: false,
              radar: {},
              recentResults: [],
              recentRatings: [],
              tags: [],
            },
          ],
          singleCount: 0,
          partyGroups: [2],
        },
        {
          side: 'B',
          id: 2,
          players: [
            {
              steamId: '76561198000000002',
              nickname: 'PlayerB',
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

describe('5E AI prompt', () => {
  it('routes 5e platform to 5E system prompt', () => {
    const record = buildP5eRecord();
    const req = buildAiAnalysisRequest(record);
    expect(req.systemPrompt).toContain('5E 对战平台');
    expect(req.systemPrompt).not.toContain('完美世界匹配赛前分析助手');
    expect(req.userPrompt).toContain('"platform":"5e"');
  });

  it('keeps perfect platform on original prompt', () => {
    const record = buildPerfectRecord();
    const req = buildAiAnalysisRequest(record);
    expect(req.systemPrompt).toContain('完美世界');
    expect(req.systemPrompt).not.toContain('5E 对战平台');
    expect(req.userPrompt).toContain('matchId');
    expect(req.userPrompt).not.toContain('"platform":"5e"');
  });

  it('buildP5eMatchSummary includes ELO, map stats, recent ELO changes and data quality', () => {
    const record = buildP5eRecord();
    const summary = buildP5eMatchSummary(record);

    expect(summary.platform).toBe('5e');
    expect(summary.match.mapName).toBe('de_dust2');
    expect(summary.dataQuality.missingApis).toBeUndefined();
    expect(summary.dataQuality.hasMatchDetail).toBe(false);
    expect(summary.dataQuality.teamSource).toBe('inferred');

    const allPlayers = summary.teams.flatMap((t) => t.players ?? []);
    expect(allPlayers.length).toBe(10);
    expect(allPlayers.some((p) => (p.elo ?? 0) > 0)).toBe(true);
    expect(allPlayers.some((p) => p.mapWinRate != null)).toBe(true);
    expect(allPlayers.some((p) => (p.recentEloChanges?.length ?? 0) > 0)).toBe(true);
  });

  it('includes match detail markers and fight stats when available', () => {
    const record = buildP5eRecord(true);
    const summary = buildP5eMatchSummary(record);

    expect(summary.match.hasMatchDetail).toBe(true);
    expect(summary.match.teamSource).toBe('matchDetail');
    expect(summary.dataQuality.officialTeams).toBe(true);

    const allPlayers = summary.teams.flatMap((t) => t.players ?? []);
    expect(allPlayers.every((p) => p.matchDetailStats?.fight?.rating === 1.1)).toBe(true);
    expect(allPlayers.every((p) => p.matchDetailStats?.sts?.changeElo === 5)).toBe(true);
  });

  it('does not embed raw API responses in user prompt', () => {
    const record = buildP5eRecord(true);
    const req = buildP5eAiAnalysisRequest(record);
    expect(req.userPrompt).not.toContain('gate.5eplay.com');
    expect(req.userPrompt).not.toContain('responseBody');
    expect(req.userPrompt.length).toBeLessThan(50_000);
  });

  it('P5E system prompt forbids perfect-platform terminology', () => {
    expect(P5E_SYSTEM_PROMPT).toContain('禁止输出');
    expect(P5E_SYSTEM_PROMPT).toContain('PerfectPower');
    expect(P5E_SYSTEM_PROMPT).not.toContain('Rating Pro 均值');
  });

  it('prompts require Simplified Chinese user-facing output', () => {
    expect(P5E_SYSTEM_PROMPT).toContain('简体中文');
    expect(P5E_SYSTEM_PROMPT).toContain('严禁全英文');
    const perfectReq = buildPerfectAiAnalysisRequest(buildPerfectRecord());
    expect(perfectReq.systemPrompt).toContain('简体中文');
    expect(perfectReq.userPrompt).toContain('严禁全英文');
  });

  it('perfect buildPerfectAiAnalysisRequest unchanged in shape', () => {
    const record = buildPerfectRecord();
    const summary = buildMatchSummary(record);
    const req = buildPerfectAiAnalysisRequest(record);
    expect(summary.matchId).toBe('perfect-test');
    expect(req.systemPrompt).toContain('完美世界');
    expect(req.userPrompt).toContain('fastSummary');
  });

  it('fixture summary payload uses 5E semantics not perfect fields', () => {
    const record = buildP5eRecord(true);
    const summary = buildP5eMatchSummary(record);

    expect(summary.platform).toBe('5e');
    expect(summary.teams[0]).toHaveProperty('avgElo');
    expect(summary.teams[0]).not.toHaveProperty('party');
    const allPlayers = summary.teams.flatMap((t) => t.players ?? []);
    expect(allPlayers[0]).toHaveProperty('elo');
    expect(allPlayers[0]).not.toHaveProperty('perfectPower');
    expect(allPlayers.some((p) => (p.recentEloChanges?.length ?? 0) > 0)).toBe(true);
    expect(summary.localInsights?.note).toContain('启发式');
    expect(summary.match.mapName).toBe('de_dust2');
    expect(summary.mapFitHint).toContain('狙击');
  });
});
