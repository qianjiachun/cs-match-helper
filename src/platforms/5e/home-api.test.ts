import { describe, expect, it, vi, beforeEach } from 'vitest';
import homeFixture from './fixtures/5e-player-home.fixture.json';
import {
  clearP5eHomeCacheForTests,
  enrichP5eBundleWithPlayerHome,
  formatP5eHomeEnrichError,
  getP5eHomeData,
  parseP5eHomePayload,
  recentResultsFromMatchList,
} from './home-api';
import type { P5eMatchBundle } from './types';

vi.mock('@core/platform/5e', () => ({
  fetch5ePlayerHome: vi.fn(),
  fetch5ePlayerHomeBatch: vi.fn(),
}));

import { fetch5ePlayerHomeBatch } from '@core/platform/5e';

const mockedFetchBatch = vi.mocked(fetch5ePlayerHomeBatch);

const UUID = 'ed954be0-7222-11ee-9ce2-ec0d9a495494';

function makeBundle(): P5eMatchBundle {
  return {
    platformGameId: '5e-test',
    uuids: [UUID],
    matchMode: [9],
    capturedAt: new Date().toISOString(),
    mapName: 'de_mirage',
    eloInfo: {
      url: 'https://gate.5eplay.com/.../elo/info/batch',
      requestBody: { user: [UUID], match_mode: [9] },
      responseBody: {
        data: {
          [UUID]: {
            modes: {
              '9': { season: '2026s3', matchTotal: 2, elo: 1795.46 },
            },
          },
        },
      },
    },
  };
}

describe('P5e home-api', () => {
  beforeEach(() => {
    clearP5eHomeCacheForTests();
    mockedFetchBatch.mockReset();
  });

  it('parseP5eHomePayload maps season_data', () => {
    const parsed = parseP5eHomePayload(homeFixture);
    expect(parsed?.seasonData?.rating).toBeCloseTo(1.14, 2);
    expect(parsed?.seasonData?.matchTotal).toBe(2);
    expect(parsed?.seasonData?.perWinMatch).toBe(0.5);
    expect(parsed?.seasonData?.avgRating).toBeCloseTo(1.056, 2);
    expect(parsed?.eloMode?.elo).toBeCloseTo(1795.46, 1);
  });

  it('recentResultsFromMatchList maps win/lose codes', () => {
    expect(recentResultsFromMatchList([0, 1])).toEqual(['lose', 'win']);
  });

  it('formatP5eHomeEnrichError detects signature failures', () => {
    expect(formatP5eHomeEnrichError('GATE_SIGNATURE_FAILED: HTTP 401')).toContain('反馈给开发者');
    expect(formatP5eHomeEnrichError('network timeout')).toBe('network timeout');
  });

  it('getP5eHomeData reads bundle playerHome', () => {
    const bundle = makeBundle();
    bundle.playerHome = { [UUID]: homeFixture };
    const data = getP5eHomeData(bundle, UUID);
    expect(data?.seasonData?.adr).toBeCloseTo(87.44, 1);
  });

  it('enrichP5eBundleWithPlayerHome fetches via batch', async () => {
    mockedFetchBatch.mockResolvedValue({ [UUID]: homeFixture.responseBody });
    const enriched = await enrichP5eBundleWithPlayerHome(makeBundle());
    expect(mockedFetchBatch).toHaveBeenCalledWith([UUID]);
    expect(enriched.playerHome?.[UUID]?.responseBody).toEqual(homeFixture.responseBody);
  });
});
