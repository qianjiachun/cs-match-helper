import { describe, expect, it } from 'vitest';
import fixture from './fixtures/perfect-9220102482485790732-log.json';
import { extractPerfectMatchEvent, parseLogLine } from './log-parser';
import { createReadyPlayer, mergePerfectStats, PerfectMatchSession, snapshotPerfectMatchRecord } from './session';
import type { PerfectPlayerStats } from './types';

function apiStats(overrides: Partial<PerfectPlayerStats> = {}): PerfectPlayerStats {
  return {
    steamId: '76561198104088654',
    recentStandardRatings: [],
    recentPwRatings: [],
    recentRwsValues: [],
    recentWeValues: [],
    recentScores: [],
    hotMaps: [],
    primaryWeapons: [],
    ...overrides,
  };
}

describe('PerfectMatchSession', () => {
  it('prefers the authenticated API ELO over the live game-info placeholder', () => {
    const player = { ...createReadyPlayer('76561198104088654'), score: 0 };
    const merged = mergePerfectStats(player, apiStats({
      pvpScore: 1876,
    }));

    expect(merged.score).toBe(1876);
  });

  it('keeps a positive live ELO when the cached API score is older', () => {
    const player = { ...createReadyPlayer('76561198104088654'), score: 1946 };
    expect(mergePerfectStats(player, apiStats({ pvpScore: 1900 })).score).toBe(1946);
  });

  it('does not let a later game-start score placeholder replace an enriched ELO', () => {
    const session = new PerfectMatchSession();
    const successLine = parseLogLine(fixture.events[1].raw);
    session.apply(extractPerfectMatchEvent(successLine.decoded)!, successLine, Date.now());
    const readyLine = parseLogLine(fixture.events[2].raw);
    const readyEvent = extractPerfectMatchEvent(readyLine.decoded)!;
    session.apply(readyEvent, readyLine, Date.now());
    const steamId = session.current!.detail.unassigned[0].steamId;
    session.setStats(steamId, apiStats({ steamId, pvpScore: 1876 }));

    const gameStartLine = parseLogLine(fixture.events.at(-1)!.raw);
    session.apply({
      kind: 'game-start',
      gameInfo: {
        players: [{ player_id: steamId, score: 0, roll_team_id: 1 }],
      },
    }, gameStartLine, Date.now());
    const player = session.current!.detail.teams
      .flatMap((team) => team.players)
      .find((item) => item.steamId === steamId);

    expect(player?.score).toBe(1876);
  });

  it('preserves richer legacy log fields when the API returns a partial player payload', () => {
    const player = {
      ...createReadyPlayer('76561198104088654'),
      adpr: 91,
      seasonRating: 1.24,
      hsRate: 0.53,
      hotMaps: [{ map: 'de_dust2', totalMatch: 12, winCount: 7 }],
      primaryWeapons: [{ name: 'ak47', killNum: 88 }],
      abilityProfile: { shot: 81 },
      combat: { kast: 0.72 },
    };
    const merged = mergePerfectStats(player, apiStats({
      name: 'API name',
      partialFailure: 'PERFECT_PARTIAL:season-stats: timeout',
    }));

    expect(merged).toMatchObject({
      adpr: 91,
      seasonRating: 1.24,
      hsRate: 0.53,
      hotMaps: [{ map: 'de_dust2' }],
      primaryWeapons: [{ name: 'ak47' }],
      abilityProfile: { shot: 81 },
      combat: { kast: 0.72 },
    });
    expect(merged.perfectLoadState?.statsError).toContain('season-stats');
  });

  it('publishes detached snapshots for progressive ready updates', () => {
    const session = new PerfectMatchSession();
    const successLine = parseLogLine(fixture.events[1].raw);
    session.apply(extractPerfectMatchEvent(successLine.decoded)!, successLine, Date.now());
    const emptySnapshot = snapshotPerfectMatchRecord(session.current!);

    const readyLine = parseLogLine(fixture.events[2].raw);
    session.apply(extractPerfectMatchEvent(readyLine.decoded)!, readyLine, Date.now());
    const readySnapshot = snapshotPerfectMatchRecord(session.current!);

    expect(readySnapshot).not.toBe(emptySnapshot);
    expect(readySnapshot.detail).not.toBe(emptySnapshot.detail);
    expect(readySnapshot.detail.unassigned).not.toBe(emptySnapshot.detail.unassigned);
    expect(emptySnapshot.detail.unassigned).toHaveLength(0);
    expect(readySnapshot.detail.unassigned).toHaveLength(1);
    expect(readySnapshot.detail.readyCount).toBe(1);
  });

  it('counts down only while players are still accepting', () => {
    const session = new PerfectMatchSession();
    const parsed = fixture.events.map((entry) => parseLogLine(entry.raw));
    const startedAt = 1_000;
    session.apply(extractPerfectMatchEvent(parsed[1].decoded)!, parsed[1], startedAt);
    expect(session.current?.detail.readyDeadlineAt).toBe(startedAt + 30_000);
    expect(session.current?.detail.perfectSessionPhase).toBe('accepting');

    for (const line of parsed.slice(2, -1)) {
      session.apply(extractPerfectMatchEvent(line.decoded)!, line, startedAt + 5_000);
    }
    expect(session.current?.detail.perfectSessionPhase).toBe('all-ready');
    expect(session.current?.detail.readyDeadlineAt).toBeUndefined();
    expect(session.current?.detail.readyLeftTimeMs).toBe(0);
  });

  it('deduplicates ready players and assigns only on game_info', () => {
    const session = new PerfectMatchSession();
    const parsed = fixture.events.map((entry) => parseLogLine(entry.raw));
    for (const line of parsed.slice(0, -1)) {
      const event = extractPerfectMatchEvent(line.decoded)!;
      session.apply(event, line, Date.now());
      if (event.kind === 'ready') session.apply(event, line, Date.now());
    }
    expect(session.current?.detail.readyCount).toBe(10);
    expect(session.current?.detail.perfectSessionPhase).toBe('all-ready');
    expect(session.current?.detail.teams).toHaveLength(0);

    const last = parsed.at(-1)!;
    session.apply(extractPerfectMatchEvent(last.decoded)!, last, Date.now());
    expect(session.current?.detail.perfectSessionPhase).toBe('assigned');
    expect(session.current?.detail.teams.map((team) => team.players.length)).toEqual([5, 5]);
    expect(session.current?.detail.mapName).toBe('de_dust2');
  });

  it('expires an unassigned session and invalidates its token', () => {
    const session = new PerfectMatchSession();
    const line = parseLogLine(fixture.events[1].raw);
    session.apply(extractPerfectMatchEvent(line.decoded)!, line, 1_000);
    const token = session.token;
    expect(session.clearIfExpired(1_000 + 2 * 60 * 1000 + 1)).toBe(true);
    expect(session.current).toBeNull();
    expect(session.token).toBeGreaterThan(token);
  });
});
