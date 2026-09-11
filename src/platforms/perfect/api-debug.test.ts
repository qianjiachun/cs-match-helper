import { describe, expect, it } from 'vitest';
import {
  buildPerfectApiFieldChecks,
  diagnosePerfectApiReport,
  formatPerfectApiDebugReport,
  isPerfectSteamId64,
  type PerfectApiDebugReport,
} from './api-debug';
import type { PerfectPlayerStats } from './types';

function report(overrides: Partial<PerfectApiDebugReport> = {}): PerfectApiDebugReport {
  return {
    generatedAtMs: 1,
    credentialUid: '76561198104088654',
    targetSteamId: '76561198104088654',
    season: 'S24',
    seasonSource: 'overview',
    seasonCandidates: { overview: 'S24', seasonList: 'S24' },
    cacheBypassed: true,
    aggregate: { statusCode: 0, data: {} },
    endpoints: [
      { id: 'overview', method: 'GET', url: 'overview', status: 'success', durationMs: 10, request: {} },
      { id: 'season-list', method: 'GET', url: 'list', status: 'success', durationMs: 10, request: {} },
      { id: 'season-stats', method: 'POST', url: 'stats', status: 'success', durationMs: 10, request: {} },
      { id: 'board-search', method: 'POST', url: 'search', status: 'success', durationMs: 10, request: {} },
    ],
    ...overrides,
  };
}

function stats(overrides: Partial<PerfectPlayerStats> = {}): PerfectPlayerStats {
  return {
    steamId: '76561198104088654',
    pvpScore: 0,
    allSeasonMaxScore: 0,
    pwRating: 0,
    adr: 0,
    headShotRatio: 0,
    rapidStopSuccessRate: 0,
    reactionTime: 0,
    recentStandardRatings: [],
    recentPwRatings: [],
    recentRwsValues: [],
    recentWeValues: [],
    recentScores: [],
    hotMaps: [{ map: 'de_dust2', totalMatch: 0, winCount: 0 }],
    primaryWeapons: [{ name: 'ak47', killNum: 0 }],
    ...overrides,
  };
}

describe('Perfect API debug report', () => {
  it('validates SteamID64 without numeric conversion', () => {
    expect(isPerfectSteamId64('76561198104088654')).toBe(true);
    expect(isPerfectSteamId64('7656119810408865')).toBe(false);
  });

  it('treats zero-valued API fields as available', () => {
    expect(buildPerfectApiFieldChecks(stats()).every((item) => item.available)).toBe(true);
    expect(diagnosePerfectApiReport(report(), stats())).toBe('complete');
  });

  it('identifies a failed season-stats request before missing normalized fields', () => {
    const value = report({
      endpoints: report().endpoints.map((item) => item.id === 'season-stats'
        ? { ...item, status: 'error' as const, error: 'PERFECT_HTTP: 500' }
        : item),
    });
    expect(diagnosePerfectApiReport(value, stats({ headShotRatio: undefined })))
      .toBe('season-stats-failed');
  });

  it('surfaces disagreement between overview and the canonical season list', () => {
    const value = report({
      seasonCandidates: { overview: 'S23', seasonList: 'S24' },
    });
    expect(diagnosePerfectApiReport(value, stats())).toBe('season-mismatch');
  });

  it('includes frontend normalization and never invents a credential token', () => {
    const output = formatPerfectApiDebugReport(report(), stats());
    expect(output).toContain('"diagnosis": "complete"');
    expect(output).not.toMatch(/access_token|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  });
});
