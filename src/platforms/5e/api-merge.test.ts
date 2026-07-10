import { describe, expect, it, vi } from 'vitest';
import { countApiCoverage, mergeApiPayload } from './api-merge';
import type { P5eApiPayload } from './types';

const U1 = 'aaaaaaaa-bbbb-cccc-dddd-111111111111';
const U2 = 'aaaaaaaa-bbbb-cccc-dddd-222222222222';
const OUT = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

describe('api-merge', () => {
  it('merges per-uuid rows and filters outsiders', () => {
    const existing: P5eApiPayload = {
      url: 'u',
      requestBody: { uuids: [U1] },
      responseBody: { data: { [U1]: { username: 'a' } } },
    };
    const incoming: P5eApiPayload = {
      url: 'u',
      requestBody: { uuids: [U2, OUT] },
      responseBody: { data: { [U2]: { username: 'b' }, [OUT]: { username: 'x' } } },
    };
    const merged = mergeApiPayload(existing, incoming, [U1, U2]);
    const data = (merged.responseBody as { data: Record<string, unknown> }).data;
    expect(Object.keys(data)).toEqual([U1, U2]);
    expect(data[OUT]).toBeUndefined();
  });

  it('counts coverage for canonical uuids only', () => {
    const payload: P5eApiPayload = {
      url: 'u',
      requestBody: {},
      responseBody: { data: { [U1]: {}, [OUT]: {} } },
    };
    expect(countApiCoverage(payload, [U1, U2])).toBe(1);
  });
});
