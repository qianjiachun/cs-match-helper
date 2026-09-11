import type { PerfectPlayerStats } from './types';

export type PerfectApiDebugEndpointId =
  | 'overview'
  | 'season-list'
  | 'season-stats'
  | 'board-search';

export type PerfectApiDebugStatus = 'success' | 'error' | 'skipped';

export interface PerfectApiDebugEndpoint {
  id: PerfectApiDebugEndpointId;
  method: 'GET' | 'POST';
  url: string;
  status: PerfectApiDebugStatus;
  durationMs: number;
  request: unknown;
  response?: unknown;
  error?: string;
}

export interface PerfectApiDebugReport {
  generatedAtMs: number;
  credentialUid: string;
  targetSteamId: string;
  season: string | null;
  seasonSource: 'overview' | 'season-list' | null;
  seasonCandidates: {
    overview: string | null;
    seasonList: string | null;
  };
  cacheBypassed: boolean;
  endpoints: PerfectApiDebugEndpoint[];
  aggregate: unknown | null;
}

export type PerfectApiFieldKey =
  | 'elo'
  | 'peakRank'
  | 'rating'
  | 'adr'
  | 'headshot'
  | 'rapidStop'
  | 'reactionTime'
  | 'maps'
  | 'weapons';

export interface PerfectApiFieldCheck {
  key: PerfectApiFieldKey;
  available: boolean;
  value: string;
}

export type PerfectApiDiagnosis =
  | 'overview-failed'
  | 'season-unresolved'
  | 'season-mismatch'
  | 'season-stats-failed'
  | 'aggregate-invalid'
  | 'important-fields-missing'
  | 'complete';

function hasNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberText(value: number | undefined, digits = 0): string {
  return hasNumber(value) ? value.toFixed(digits) : '—';
}

function percentText(value: number | undefined): string {
  return hasNumber(value) ? `${Math.round(value * 100)}%` : '—';
}

export function isPerfectSteamId64(value: string): boolean {
  return /^\d{17}$/.test(value.trim());
}

export function buildPerfectApiFieldChecks(
  stats: PerfectPlayerStats | null,
): PerfectApiFieldCheck[] {
  const peakAvailable = hasNumber(stats?.allSeasonMaxScore)
    || hasNumber(stats?.allSeasonMaxStars);
  const peakValue = hasNumber(stats?.allSeasonMaxStars) && (stats?.allSeasonMaxScore ?? 0) >= 2400
    ? `S ${Math.round(stats.allSeasonMaxStars)}★`
    : numberText(stats?.allSeasonMaxScore);

  return [
    { key: 'elo', available: hasNumber(stats?.pvpScore), value: numberText(stats?.pvpScore) },
    { key: 'peakRank', available: peakAvailable, value: peakValue },
    { key: 'rating', available: hasNumber(stats?.pwRating), value: numberText(stats?.pwRating, 2) },
    { key: 'adr', available: hasNumber(stats?.adr), value: numberText(stats?.adr) },
    { key: 'headshot', available: hasNumber(stats?.headShotRatio), value: percentText(stats?.headShotRatio) },
    { key: 'rapidStop', available: hasNumber(stats?.rapidStopSuccessRate), value: percentText(stats?.rapidStopSuccessRate) },
    { key: 'reactionTime', available: hasNumber(stats?.reactionTime), value: hasNumber(stats?.reactionTime) ? `${Math.round(stats.reactionTime)} ms` : '—' },
    { key: 'maps', available: Boolean(stats?.hotMaps.length), value: stats?.hotMaps.length ? String(stats.hotMaps.length) : '—' },
    { key: 'weapons', available: Boolean(stats?.primaryWeapons.length), value: stats?.primaryWeapons.length ? String(stats.primaryWeapons.length) : '—' },
  ];
}

export function diagnosePerfectApiReport(
  report: PerfectApiDebugReport,
  stats: PerfectPlayerStats | null,
  normalizationError?: string,
): PerfectApiDiagnosis {
  const endpoint = (id: PerfectApiDebugEndpointId) => (
    report.endpoints.find((item) => item.id === id)
  );
  if (endpoint('overview')?.status !== 'success') return 'overview-failed';
  if (!report.season || endpoint('season-stats')?.status === 'skipped') return 'season-unresolved';
  if (report.seasonCandidates?.overview && report.seasonCandidates.seasonList
    && report.seasonCandidates.overview !== report.seasonCandidates.seasonList) {
    return 'season-mismatch';
  }
  if (endpoint('season-stats')?.status !== 'success') return 'season-stats-failed';
  if (!stats || normalizationError) return 'aggregate-invalid';
  if (buildPerfectApiFieldChecks(stats).some((item) => !item.available)) {
    return 'important-fields-missing';
  }
  return 'complete';
}

export function formatPerfectApiDebugReport(
  report: PerfectApiDebugReport,
  stats: PerfectPlayerStats | null,
  normalizationError?: string,
): string {
  return JSON.stringify({
    ...report,
    frontend: {
      diagnosis: diagnosePerfectApiReport(report, stats, normalizationError),
      normalizationError: normalizationError || undefined,
      normalized: stats,
      fieldChecks: buildPerfectApiFieldChecks(stats),
    },
  }, null, 2);
}
