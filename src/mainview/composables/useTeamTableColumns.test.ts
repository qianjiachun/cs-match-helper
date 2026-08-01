import { beforeEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useTeamTableColumns } from './useTeamTableColumns';

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

describe('Perfect column preference migration', () => {
  it('adds recent WE by default and preserves an explicitly visible old avgWe as season WE', () => {
    values.set('cs-match-helper.team-table-columns-v7.perfect', JSON.stringify({
      version: 7,
      order: ['nickname', 'score', 'mapPool', 'weAvg'],
      visible: ['nickname', 'score', 'mapPool', 'weAvg'],
    }));
    const columns = useTeamTableColumns(ref('perfect'));
    expect(columns.visibleKeys.value).toContain('weAvg');
    expect(columns.visibleKeys.value).toContain('seasonWe');
    expect(columns.columnOrder.value.indexOf('primaryWeapon')).toBe(columns.columnOrder.value.indexOf('mapPool') + 1);
    expect(columns.columnOrder.value.indexOf('weAvg')).toBe(columns.columnOrder.value.indexOf('primaryWeapon') + 1);
  });

  it('replaces the old default season win rate with the favored weapon column', () => {
    values.set('cs-match-helper.team-table-columns-v8.perfect', JSON.stringify({
      version: 8,
      order: ['nickname', 'score', 'seasonWinRate', 'mapPool', 'weAvg', 'seasonTotalNum', 'primaryWeapon'],
      visible: ['nickname', 'score', 'seasonWinRate', 'mapPool', 'weAvg'],
    }));
    const columns = useTeamTableColumns(ref('perfect'));
    expect(columns.visibleKeys.value).not.toContain('seasonWinRate');
    expect(columns.visibleKeys.value).toContain('primaryWeapon');
    expect(columns.columnOrder.value.indexOf('primaryWeapon')).toBe(columns.columnOrder.value.indexOf('mapPool') + 1);
    expect(columns.columnOrder.value.indexOf('seasonWinRate')).toBe(columns.columnOrder.value.indexOf('seasonTotalNum') + 1);
  });
});
