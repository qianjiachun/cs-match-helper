import { describe, expect, it } from 'vitest';
import { getPerfectRankDisplay, getPerfectRankSortValue, getPerfectSTier } from './rank';

describe('Perfect rank display', () => {
  it('uses score below S rank and stars once the score reaches 2400', () => {
    expect(getPerfectRankDisplay(2399, 99)).toEqual({ kind: 'score', score: 2399 });
    expect(getPerfectRankDisplay(2400, 0)).toEqual({ kind: 's', score: 2400, stars: 0, tier: 'normal' });
    expect(getPerfectRankDisplay(2500, undefined)).toEqual({ kind: 'score', score: 2500 });
  });

  it('uses the official S-star thresholds', () => {
    expect([0, 9].map(getPerfectSTier)).toEqual(['normal', 'normal']);
    expect([10, 24].map(getPerfectSTier)).toEqual(['gold', 'gold']);
    expect([25, 49].map(getPerfectSTier)).toEqual(['diamond', 'diamond']);
    expect([50, 120].map(getPerfectSTier)).toEqual(['demon', 'demon']);
  });

  it('sorts every valid S rank above point ranks and then by stars', () => {
    expect(getPerfectRankSortValue(2400, 0)).toBeGreaterThan(getPerfectRankSortValue(2399, 0));
    expect(getPerfectRankSortValue(2400, 50)).toBeGreaterThan(getPerfectRankSortValue(2400, 25));
  });
});
