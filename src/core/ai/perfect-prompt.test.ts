import { describe, expect, it } from 'vitest';
import fixture from '@platforms/perfect/fixtures/perfect-9220102482485790732-api.json';
import { buildMatchSummary, buildPerfectAiAnalysisRequest } from './prompt';
import { normalizePerfectPlayerStats } from '@platforms/perfect/player-api';
import { createReadyPlayer, mergePerfectStats } from '@platforms/perfect/session';
import type { MatchRecord } from '@core/match/models';

describe('new Perfect AI prompt', () => {
  it('contains compact new stats and excludes raw histories and comments', () => {
    const steamId = fixture.steamIds[0];
    const snapshot = fixture.players[steamId as keyof typeof fixture.players];
    const player = mergePerfectStats(createReadyPlayer(steamId), normalizePerfectPlayerStats(snapshot.stats.body, steamId));
    player.teamSide = 1;
    const record: MatchRecord = {
      id: fixture.matchId, platformId: 'perfect', data: { shouldNotLeak: fixture },
      summary: { playerCount: 1, mapName: 'de_dust2' },
      detail: {
        platformId: 'perfect', mapName: 'de_dust2', source: 'ladder-events', perfectSessionPhase: 'assigned',
        teams: [{ side: 'A', id: 1, players: [player], singleCount: 1, partyGroups: [] }],
        unassigned: [], hasExtraInfo: false, parseWarnings: [], statsSettled: true,
      },
    };
    const summary = buildMatchSummary(record);
    const prompt = buildPerfectAiAnalysisRequest(record).userPrompt;
    expect(summary.fastSummary.dataQuality.statsSuccess).toBe(1);
    expect(prompt).toContain('representativeMaps');
    expect(prompt).toContain('hotWeapons');
    expect(prompt).toContain('recentWe');
    expect(prompt).toContain('recentRating');
    expect(prompt).toContain('clutchWins');
    expect(prompt).toContain('ability');
    expect(prompt).toContain('familiarityScore');
    expect(prompt).toContain('firstShotAccuracy');
    expect(prompt).not.toContain('historyPwRatings');
    expect(prompt).not.toContain('historyRws');
    expect(prompt).not.toContain('weList');
    expect(prompt).not.toContain('recentPwRating');
    expect(prompt).not.toContain('PW Rating');
    expect(prompt).not.toContain('commentDTOS');
    expect(prompt.length).toBeLessThan(30_000);
  });
});
