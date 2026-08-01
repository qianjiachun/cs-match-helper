import type { MatchRecord } from '@core/match/models';

export function isProgressivePerfectMatch(record: MatchRecord): boolean {
  return (record.platformId ?? record.detail.platformId) === 'perfect'
    && record.detail.source === 'ladder-events';
}

export function isPerfectAiAnalysisReady(record: MatchRecord): boolean {
  if (!isProgressivePerfectMatch(record)) return true;

  const { detail } = record;
  if (detail.perfectSessionPhase !== 'assigned' || !detail.mapName?.trim()) return false;
  if (detail.unassigned.length > 0 || detail.teams.length !== 2) return false;

  const players = detail.teams.flatMap((team) => team.players);
  if (players.length !== 10 || detail.teams.some((team) => team.players.length !== 5)) return false;
  if (new Set(players.map((player) => player.steamId)).size !== 10) return false;
  if ((detail.readyCount ?? players.length) < 10) return false;

  const statsSettled = players.every((player) => {
    const state = player.perfectLoadState?.stats;
    return state === 'loaded' || state === 'error';
  });
  return statsSettled
    && detail.statsSettled === true
    && (detail.statsSettledCount ?? 0) >= 10;
}
