export const PERFECT_S_RANK_SCORE = 2400;

export type PerfectSTier = 'normal' | 'gold' | 'diamond' | 'demon';

export type PerfectRankDisplay =
  | { kind: 'score'; score: number }
  | { kind: 's'; score: number; stars: number; tier: PerfectSTier }
  | { kind: 'empty' };

export function getPerfectSTier(stars: number): PerfectSTier {
  if (stars >= 50) return 'demon';
  if (stars >= 25) return 'diamond';
  if (stars >= 10) return 'gold';
  return 'normal';
}

export function getPerfectRankDisplay(
  score: number | undefined,
  stars: number | undefined,
): PerfectRankDisplay {
  if (score != null && score >= PERFECT_S_RANK_SCORE && stars != null && stars >= 0) {
    return { kind: 's', score, stars, tier: getPerfectSTier(stars) };
  }
  return score != null ? { kind: 'score', score } : { kind: 'empty' };
}

export function getPerfectRankSortValue(
  score: number | undefined,
  stars: number | undefined,
): number {
  const rank = getPerfectRankDisplay(score, stars);
  if (rank.kind === 'empty') return -Infinity;
  if (rank.kind === 's') return 1_000_000 + rank.stars;
  return rank.score;
}
