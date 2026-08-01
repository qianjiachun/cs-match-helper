import type { MatchPlayer, PerfectHotMap } from '@core/match/models';

export type PerfectMapFamiliarityTier = 'specialist' | 'skilled' | 'experienced' | 'limited' | 'none';

export interface PerfectMapFamiliarity {
  score: number;
  tier: PerfectMapFamiliarityTier;
  share: number;
}

export interface PerfectMapMetrics {
  matches: number;
  share: number;
  winRate?: number;
  rating?: number;
  adr?: number;
  kd?: number;
  rws?: number;
  openingDuelRate?: number;
  headshotRate?: number;
}

export interface PerfectMapPoolSummary {
  mode: 'current' | 'overview' | 'empty';
  current?: PerfectHotMap;
  topMaps: PerfectHotMap[];
  familiarity?: PerfectMapFamiliarity;
  strongPerformance: boolean;
  metrics?: PerfectMapMetrics;
}

function normalizeMapName(value?: string): string {
  return (value ?? '').trim().toLowerCase().replace(/^workshop\/[0-9]+\//, '');
}

function seasonMatchCount(player: MatchPlayer): number {
  return player.seasonTotalNum ?? player.hotMaps?.reduce((sum, map) => sum + map.totalMatch, 0) ?? 0;
}

function safeRatio(numerator?: number, denominator?: number): number | undefined {
  return numerator != null && denominator != null && denominator > 0 ? numerator / denominator : undefined;
}

export function findPerfectHotMap(player: MatchPlayer, mapName?: string): PerfectHotMap | undefined {
  const target = normalizeMapName(mapName);
  if (!target) return undefined;
  return player.hotMaps?.find((entry) => normalizeMapName(entry.map) === target);
}

/** Current-season familiarity evidence. It must not be read as lifetime experience. */
export function getPerfectMapFamiliarity(
  player: MatchPlayer,
  mapName?: string,
): PerfectMapFamiliarity {
  const entry = findPerfectHotMap(player, mapName);
  if (!entry || entry.totalMatch <= 0) return { score: 0, tier: 'none', share: 0 };
  const total = seasonMatchCount(player);
  const share = total > 0 ? entry.totalMatch / total : 0;
  const rawScore = Math.round(
    80 * Math.min(entry.totalMatch / 20, 1)
    + 20 * Math.min(share / 0.35, 1),
  );
  let tier: PerfectMapFamiliarityTier;
  const hasSpecialistEvidence = (entry.totalMatch >= 25 && share >= 0.25) || entry.totalMatch >= 40;
  if (hasSpecialistEvidence && rawScore >= 80) tier = 'specialist';
  else if (entry.totalMatch >= 10 && rawScore >= 50) tier = 'skilled';
  else if (entry.totalMatch >= 4 && rawScore >= 25) tier = 'experienced';
  else tier = 'limited';
  const score = tier === 'specialist'
    ? Math.max(80, rawScore)
    : tier === 'skilled'
      ? Math.min(79, Math.max(50, rawScore))
      : tier === 'experienced'
        ? Math.min(49, Math.max(25, rawScore))
        : Math.min(24, Math.max(1, rawScore));
  return { score, tier, share };
}

export function isPerfectMapStrong(player: MatchPlayer, mapName?: string): boolean {
  const entry = findPerfectHotMap(player, mapName);
  if (!entry || entry.totalMatch < 10) return false;
  const mapRating = safeRatio(entry.ratingSum, entry.totalMatch);
  const mapWinRate = safeRatio(entry.winCount, entry.totalMatch);
  const ratingDelta = mapRating != null && player.seasonRating != null
    ? mapRating - player.seasonRating
    : undefined;
  const winRateDelta = mapWinRate != null && player.seasonWinRate != null
    ? mapWinRate - player.seasonWinRate
    : undefined;
  return Boolean(
    (ratingDelta != null && ratingDelta >= 0.08)
    || (
      winRateDelta != null
      && winRateDelta >= 0.15
      && (ratingDelta == null || ratingDelta >= -0.03)
    ),
  );
}

export function getPerfectMapMetrics(player: MatchPlayer, entry: PerfectHotMap): PerfectMapMetrics {
  const duels = (entry.firstKillNum ?? 0) + (entry.firstDeathNum ?? 0);
  return {
    matches: entry.totalMatch,
    share: seasonMatchCount(player) > 0 ? entry.totalMatch / seasonMatchCount(player) : 0,
    winRate: safeRatio(entry.winCount, entry.totalMatch),
    rating: safeRatio(entry.ratingSum, entry.totalMatch),
    adr: safeRatio(entry.totalAdr, entry.totalMatch),
    kd: safeRatio(entry.totalKill, entry.deathNum),
    rws: safeRatio(entry.rwsSum, entry.totalMatch),
    openingDuelRate: duels > 0 ? (entry.firstKillNum ?? 0) / duels : undefined,
    headshotRate: safeRatio(entry.headshotKillNum, entry.totalKill),
  };
}

export function summarizePerfectMapPool(player: MatchPlayer, mapName?: string): PerfectMapPoolSummary {
  const topMaps = [...(player.hotMaps ?? [])]
    .filter((entry) => entry.totalMatch > 0)
    .sort((a, b) => b.totalMatch - a.totalMatch)
    .slice(0, 2);
  if (!mapName) return { mode: topMaps.length ? 'overview' : 'empty', topMaps, strongPerformance: false };
  const current = findPerfectHotMap(player, mapName);
  if (!current) {
    return {
      mode: 'current',
      topMaps,
      familiarity: { score: 0, tier: 'none', share: 0 },
      strongPerformance: false,
      metrics: { matches: 0, share: 0 },
    };
  }
  return {
    mode: 'current',
    current,
    topMaps,
    familiarity: getPerfectMapFamiliarity(player, mapName),
    strongPerformance: isPerfectMapStrong(player, mapName),
    metrics: getPerfectMapMetrics(player, current),
  };
}
