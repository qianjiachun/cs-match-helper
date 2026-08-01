import { describe, expect, it } from 'vitest';
import fixture from './fixtures/perfect-9220102482485790732-log.json';
import {
  BOOTSTRAP_MATCH_MAX_AGE_MS,
  extractPerfectMatchEvent,
  findLatestPerfectSessionInLogLines,
  parseLogLine,
} from './log-parser';

describe('Perfect progressive log parser', () => {
  it('limits startup recovery to one hour', () => {
    expect(BOOTSTRAP_MATCH_MAX_AGE_MS).toBe(60 * 60 * 1000);
  });

  it('decrypts and parses the real four event kinds', () => {
    const events = fixture.events.map((entry) => extractPerfectMatchEvent(parseLogLine(entry.raw).decoded));
    expect(events[0]).toEqual({ kind: 'match-id', matchId: fixture.matchId });
    expect(events[1]?.kind).toBe('match-success');
    expect(events.filter((event) => event?.kind === 'ready')).toHaveLength(10);
    const gameStart = events.at(-1);
    expect(gameStart?.kind).toBe('game-start');
    if (gameStart?.kind === 'game-start') {
      expect(gameStart.gameInfo.map_name).toBe('de_dust2');
      expect(gameStart.gameInfo.players).toHaveLength(10);
    }
  });

  it('recovers the latest session from a log slice', () => {
    const now = Date.parse('2026-07-31T14:09:00+08:00');
    const entries = findLatestPerfectSessionInLogLines(fixture.events.map((entry) => entry.raw), 2 * 60 * 60 * 1000, now);
    expect(entries).toHaveLength(13);
    expect(entries[1].event.kind).toBe('match-success');
  });
});
