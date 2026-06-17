import { describe, expect, it } from 'vitest';
import { getDefaultVisibleColumnKeys } from './team-table-columns';

describe('team table columns by platform', () => {
  it('keeps perfect default combat columns', () => {
    const keys = getDefaultVisibleColumnKeys('perfect');
    expect(keys).toContain('rapidStopSuccessRate');
    expect(keys).toContain('reactionTime');
    expect(keys).toContain('weRaw');
    expect(keys).not.toContain('eloChange');
  });

  it('uses 5e default columns with combat and recent form', () => {
    const keys = getDefaultVisibleColumnKeys('5e');
    expect(keys).toEqual([
      'nickname',
      'score',
      'seasonRating',
      'rating',
      'adpr',
      'weRaw',
      'kd',
      'hsRate',
      'recentWins',
    ]);
    expect(keys).not.toContain('mapWinRate');
    expect(keys).not.toContain('rankLevel');
    expect(keys).not.toContain('rankNum');
  });
});
