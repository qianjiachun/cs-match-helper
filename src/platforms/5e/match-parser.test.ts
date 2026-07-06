import { describe, expect, it } from 'vitest';
import { P5eMatchAggregator } from './aggregator';
import fixture from './fixtures/5e-match-success.fixture.json';
import { createP5eMatchRecord } from './match-parser';
import type { P5eMatchBundle, P5eApiPayload } from './types';

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
    sts: { change_elo: 5 },
  });
  return {
    data: {
      main: { map: 'de_dust2', map_desc: '炙热沙城 II' },
      group_1: uuids.slice(0, 5).map(toEntry),
      group_2: uuids.slice(5, 10).map(toEntry),
    },
  };
}

describe('P5eMatchParser', () => {
  it('maps fixture to 10-player MatchRecord', () => {
    const agg = new P5eMatchAggregator();
    const bundle = agg.ingestFixtureEvents(fixture.events as Record<string, P5eApiPayload>);
    expect(bundle).not.toBeNull();

    const enriched: P5eMatchBundle = {
      ...bundle!,
      mapName: 'de_dust2',
    };

    const record = createP5eMatchRecord(enriched);
    expect(record.platformId).toBe('5e');
    expect(record.detail.platformId).toBe('5e');
    expect(record.summary.playerCount).toBe(10);
    expect(record.detail.teams).toHaveLength(2);
    expect(record.detail.teams[0].players.length + record.detail.teams[1].players.length).toBe(10);
    expect(record.detail.teams.flatMap((t) => t.players).some((p) => p.nickname === 'Naffri')).toBe(true);
    expect(record.detail.teams[0].players[0].score).toBeGreaterThan(0);
    expect(record.detail.parseWarnings.some((w) => w.includes('分队'))).toBe(true);
    expect(record.detail.readyLeftTimeMs).toBe(30_000);
  });

  it('uses match detail groups and fight stats when available', () => {
    const agg = new P5eMatchAggregator();
    const bundle = agg.ingestFixtureEvents(fixture.events as Record<string, P5eApiPayload>);
    expect(bundle).not.toBeNull();

    const enriched: P5eMatchBundle = {
      ...bundle!,
      mapName: 'de_dust2',
      matchDetail: buildMatchDetailFromUuids(FIXTURE_UUIDS),
    };

    const record = createP5eMatchRecord(enriched);
    expect(record.summary.serverName).toBe('炙热沙城 II');
    expect(record.detail.parseWarnings.some((w) => w.includes('分队'))).toBe(false);

    const allPlayers = record.detail.teams.flatMap((t) => t.players);
    expect(allPlayers.every((p) => p.kd === 1.5)).toBe(true);
    expect(allPlayers.every((p) => p.eloChange === 5)).toBe(true);
    expect(allPlayers.every((p) => p.seasonRating !== 1.1)).toBe(true);

    const teamSizes = record.detail.teams.map((t) => t.players.length);
    expect(teamSizes).toEqual([5, 5]);
  });

  it('falls back to 5v5 index split when match detail teams are incomplete', () => {
    const agg = new P5eMatchAggregator();
    const bundle = agg.ingestFixtureEvents(fixture.events as Record<string, P5eApiPayload>);
    expect(bundle).not.toBeNull();

    const enriched: P5eMatchBundle = {
      ...bundle!,
      mapName: 'de_dust2',
      matchDetail: {
        data: {
          main: { map: 'de_dust2' },
          group_1: [{ user_info: { user_data: { uuid: FIXTURE_UUIDS[7] } } }],
          group_2: [{ user_info: { user_data: { uuid: FIXTURE_UUIDS[2] } } }],
        },
      },
    };

    const record = createP5eMatchRecord(enriched);
    const teamSizes = record.detail.teams.map((t) => t.players.length);
    expect(teamSizes).toEqual([5, 5]);
    expect(record.detail.parseWarnings.some((w) => w.includes('分队'))).toBe(true);
  });
});
