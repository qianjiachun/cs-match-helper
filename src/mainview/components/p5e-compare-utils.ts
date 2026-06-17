import type { MatchPlayer, MatchTeam } from '@core/match/models';
import type { PlayerNumericKey } from './team-table-shared';

export interface P5eCompareMetric {
  key: string;
  label: string;
  shortLabel: string;
  a?: number;
  b?: number;
  isPct: boolean;
  decimals: number;
}

export interface P5eRadarAxis {
  label: string;
  a: number;
  b: number;
}

const P5E_RADAR_DIMS: Array<{ label: string; field: PlayerNumericKey; minSpan: number }> = [
  { label: 'ELO', field: 'score', minSpan: 100 },
  { label: 'Rating', field: 'seasonRating', minSpan: 0.24 },
  { label: 'ADR', field: 'adpr', minSpan: 16 },
  { label: 'RWS', field: 'weRaw', minSpan: 3 },
  { label: '爆头率', field: 'hsRate', minSpan: 0.16 },
  { label: 'K/D', field: 'kd', minSpan: 0.35 },
];

/** 在双方数值附近留出可视边距，避免每轴都顶满外圈 */
export function scaleRadarPair(a: number, b: number, minSpan: number): { a: number; b: number } {
  if (a === b) {
    return { a: 50, b: 50 };
  }

  const mid = (a + b) / 2;
  const spread = Math.abs(a - b);
  const span = Math.max(spread * 1.35, minSpan);
  const lo = mid - span / 2;
  const range = span;

  return {
    a: ((a - lo) / range) * 100,
    b: ((b - lo) / range) * 100,
  };
}

export function avgPlayerStatOptional(
  players: MatchPlayer[],
  key: PlayerNumericKey,
): number | undefined {
  const values = players
    .map((player) => player[key])
    .filter((value): value is number => typeof value === 'number');
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}


export function buildP5eTeamRadar(teamA: MatchTeam, teamB: MatchTeam): {
  axes: P5eRadarAxis[];
} {
  const axes: P5eRadarAxis[] = [];

  for (const def of P5E_RADAR_DIMS) {
    const rawA = avgPlayerStatOptional(teamA.players, def.field);
    const rawB = avgPlayerStatOptional(teamB.players, def.field);
    if (rawA == null || rawB == null) continue;

    const normalized = scaleRadarPair(rawA, rawB, def.minSpan);
    axes.push({
      label: def.label,
      a: normalized.a,
      b: normalized.b,
    });
  }

  return { axes };
}

export function buildP5eCoreMetrics(teamA: MatchTeam, teamB: MatchTeam): P5eCompareMetric[] {
  const defs: Array<{
    key: string;
    label: string;
    shortLabel: string;
    field: PlayerNumericKey;
    isPct: boolean;
    decimals: number;
  }> = [
    { key: 'elo', label: '平均 ELO', shortLabel: 'ELO', field: 'score', isPct: false, decimals: 0 },
    { key: 'rating', label: '平均 Rating', shortLabel: 'Rating', field: 'seasonRating', isPct: false, decimals: 2 },
    { key: 'adpr', label: '平均 ADR', shortLabel: 'ADR', field: 'adpr', isPct: false, decimals: 1 },
    { key: 'rws', label: '平均 RWS', shortLabel: 'RWS', field: 'weRaw', isPct: false, decimals: 1 },
    { key: 'mapWinRate', label: '地图胜率', shortLabel: '地图胜', field: 'mapWinRate', isPct: true, decimals: 0 },
    { key: 'recentWinRate', label: '近期胜率', shortLabel: '近期胜', field: 'recentWinRate', isPct: true, decimals: 0 },
  ];

  return defs.map((def) => ({
    key: def.key,
    label: def.label,
    shortLabel: def.shortLabel,
    a: avgPlayerStatOptional(teamA.players, def.field),
    b: avgPlayerStatOptional(teamB.players, def.field),
    isPct: def.isPct,
    decimals: def.decimals,
  }));
}

export function buildP5eFightMetrics(teamA: MatchTeam, teamB: MatchTeam): P5eCompareMetric[] {
  const defs: Array<{
    key: string;
    label: string;
    shortLabel: string;
    field: PlayerNumericKey;
    isPct: boolean;
    decimals: number;
  }> = [
    { key: 'kd', label: '平均 K/D', shortLabel: 'K/D', field: 'kd', isPct: false, decimals: 2 },
    { key: 'hsRate', label: '爆头率', shortLabel: '爆头', field: 'hsRate', isPct: true, decimals: 0 },
    { key: 'firstKill', label: '首杀成功率', shortLabel: '首杀', field: 'firstKillSuccessRate', isPct: true, decimals: 0 },
    { key: 'eloChange', label: 'ELO 变化', shortLabel: 'ELO±', field: 'eloChange', isPct: false, decimals: 0 },
  ];

  return defs
    .map((def) => ({
      key: def.key,
      label: def.label,
      shortLabel: def.shortLabel,
      a: avgPlayerStatOptional(teamA.players, def.field),
      b: avgPlayerStatOptional(teamB.players, def.field),
      isPct: def.isPct,
      decimals: def.decimals,
    }))
    .filter((item) => item.a != null && item.b != null);
}

export function formatCompareValue(
  value: number | undefined,
  isPct: boolean,
  decimals: number,
): string {
  if (value == null) return '—';
  if (isPct) return `${Math.round(value * 100)}%`;
  return value.toFixed(decimals);
}
