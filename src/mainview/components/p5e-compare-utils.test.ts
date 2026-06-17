import { describe, expect, it } from 'vitest';
import type { MatchPlayer, MatchTeam } from '@core/match/models';
import { buildP5eTeamRadar, scaleRadarPair } from './p5e-compare-utils';

function player(overrides: Partial<MatchPlayer> = {}): MatchPlayer {
  return {
    steamId: '1',
    nickname: 'p',
    avatar: '',
    score: 1700,
    seasonRating: 1.1,
    adpr: 80,
    weRaw: 10,
    recentResults: [],
    recentRatings: [],
    tags: [],
    ...overrides,
  };
}

function team(players: MatchPlayer[]): MatchTeam {
  return { players, avgScore: undefined };
}

describe('buildP5eTeamRadar', () => {
  it('drops dimensions when either team lacks data', () => {
    const teamA = team([
      player({ kd: 1.2, hsRate: 0.4 }),
      player({ kd: 1.0, hsRate: 0.3 }),
    ]);
    const teamB = team([
      player({ kd: 0.9 }),
      player(),
    ]);

    const { axes } = buildP5eTeamRadar(teamA, teamB);

    expect(axes.map((axis) => axis.label)).toEqual(['ELO', 'Rating', 'ADR', 'RWS', 'K/D']);
    expect(axes.find((axis) => axis.label === '爆头率')).toBeUndefined();
  });

  it('includes all six dimensions when both teams have complete data', () => {
    const full = () =>
      player({ kd: 1.1, hsRate: 0.35 });
    const { axes } = buildP5eTeamRadar(team([full(), full()]), team([full(), full()]));

    expect(axes).toHaveLength(6);
    expect(axes.map((axis) => axis.label)).toEqual([
      'ELO',
      'Rating',
      'ADR',
      'RWS',
      '爆头率',
      'K/D',
    ]);
  });
});

describe('scaleRadarPair', () => {
  it('centers equal values instead of maxing out', () => {
    expect(scaleRadarPair(1770, 1770, 100)).toEqual({ a: 50, b: 50 });
  });

  it('keeps close values away from the outer edge', () => {
    const { a, b } = scaleRadarPair(1800, 1769, 100);
    expect(a).toBeGreaterThan(55);
    expect(a).toBeLessThan(75);
    expect(b).toBeGreaterThan(25);
    expect(b).toBeLessThan(45);
    expect(a).toBeGreaterThan(b);
  });

  it('does not pin the leader to 100% for small gaps', () => {
    const { a, b } = scaleRadarPair(1.12, 1.08, 0.24);
    expect(a).toBeLessThan(90);
    expect(b).toBeGreaterThan(10);
  });
});
