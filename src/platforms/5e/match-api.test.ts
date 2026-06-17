import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  clearP5eMatchDetailCacheForTests,
  enrichP5eBundleWithLiveMap,
  extractP5eMatchCodes,
  fetchP5eMatchDetailCached,
  pickLatestMatchCode,
  resolveMapFromMatchDetail,
} from './match-api';
import type { P5eMatchBundle } from './types';

vi.mock('@core/platform/5e', () => ({
  fetch5eMatchDetail: vi.fn(),
}));

import { fetch5eMatchDetail } from '@core/platform/5e';

const mockedFetch = vi.mocked(fetch5eMatchDetail);

const UUID_B6 = 'b6c90410-53b8-11ef-ac9f-ec0d9a7185e0';

function makeBundle(): P5eMatchBundle {
  return {
    platformGameId: '5e-test',
    uuids: [UUID_B6],
    capturedAt: new Date().toISOString(),
    eloInfo: {
      url: 'https://gate.5eplay.com/.../elo/info/batch',
      requestBody: { user: [UUID_B6], match_mode: [9] },
      responseBody: {
        data: {
          [UUID_B6]: {
            modes: {
              '9': {
                specialData:
                  '{"match_data":[{"is_win":-1,"match_id":"g161-20260613150205606032219"},{"is_win":1,"match_id":"g161-20260614142743982331607"},{"is_win":-1,"match_id":"g161-20260616142514118291320"}]}',
              },
            },
          },
        },
      },
    },
  };
}

describe('P5e match API helpers', () => {
  afterEach(() => {
    clearP5eMatchDetailCacheForTests();
    mockedFetch.mockReset();
  });

  it('dedupes concurrent fetch by match_code', async () => {
    mockedFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ data: { main: { map: 'de_dust2' } } }),
            20,
          );
        }),
    );

    const [a, b] = await Promise.all([
      fetchP5eMatchDetailCached('g161-test'),
      fetchP5eMatchDetailCached('g161-test'),
    ]);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('enrich uses cached match detail without refetch', async () => {
    const bundle: P5eMatchBundle = {
      platformGameId: '5e-test',
      uuids: ['u1'],
      capturedAt: new Date().toISOString(),
      matchCode: 'g161-test',
      matchDetail: { data: { main: { map: 'de_mirage' } } },
    };

    const enriched = await enrichP5eBundleWithLiveMap(bundle);
    expect(enriched.mapName).toBe('de_mirage');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('extracts match codes from elo specialData', () => {
    const codes = extractP5eMatchCodes(makeBundle());
    expect(codes).toContain('g161-20260614142743982331607');
    expect(codes.length).toBe(3);
  });

  it('picks latest valid match code', () => {
    const codes = extractP5eMatchCodes(makeBundle());
    expect(pickLatestMatchCode(codes)).toBe('g161-20260616142514118291320');
  });

  it('resolves map from match detail response', () => {
    const map = resolveMapFromMatchDetail({
      data: { main: { map: 'de_dust2', map_desc: '炙热沙城2' } },
    });
    expect(map).toBe('de_dust2');
  });
});
