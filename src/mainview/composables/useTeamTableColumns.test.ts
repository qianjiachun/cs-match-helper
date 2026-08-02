import { beforeEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import {
  getDefaultColumnOrder,
  getDefaultVisibleColumnKeys,
  getStorageKeyForPlatform,
} from '../components/team-table-columns';
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
  it('hard-resets pre-v10 Perfect prefs to current defaults and persists v10', () => {
    values.set('cs-match-helper.team-table-columns-v7.perfect', JSON.stringify({
      version: 7,
      order: ['nickname', 'score', 'mapPool', 'weAvg'],
      visible: ['nickname', 'score', 'mapPool', 'weAvg'],
    }));
    const columns = useTeamTableColumns(ref('perfect'));
    expect(columns.visibleKeys.value).toEqual(getDefaultVisibleColumnKeys('perfect'));
    expect(columns.columnOrder.value).toEqual(getDefaultColumnOrder('perfect'));

    const saved = JSON.parse(values.get(getStorageKeyForPlatform('perfect'))!);
    expect(saved.version).toBe(10);
    expect(saved.visible).toEqual(getDefaultVisibleColumnKeys('perfect'));
  });

  it('hard-resets v8/v9 Perfect custom prefs to current defaults', () => {
    values.set('cs-match-helper.team-table-columns-v9.perfect', JSON.stringify({
      version: 9,
      order: ['nickname', 'score', 'seasonWinRate', 'mapPool', 'weAvg'],
      visible: ['nickname', 'score', 'seasonWinRate', 'mapPool', 'weAvg'],
    }));
    const columns = useTeamTableColumns(ref('perfect'));
    expect(columns.visibleKeys.value).toEqual(getDefaultVisibleColumnKeys('perfect'));
    expect(columns.visibleKeys.value).toContain('primaryWeapon');
    expect(columns.visibleKeys.value).not.toContain('seasonWinRate');
    expect(values.has(getStorageKeyForPlatform('perfect'))).toBe(true);
  });

  it('keeps Perfect v10 customizations', () => {
    const customVisible = ['nickname', 'score', 'kd', 'mapPool'];
    values.set(getStorageKeyForPlatform('perfect'), JSON.stringify({
      version: 10,
      order: ['nickname', 'score', 'kd', 'mapPool', 'adpr'],
      visible: customVisible,
    }));
    const columns = useTeamTableColumns(ref('perfect'));
    expect(columns.visibleKeys.value).toEqual(customVisible);
    expect(columns.columnOrder.value[2]).toBe('kd');
  });
});

describe('5E column preference migration', () => {
  it('soft-migrates legacy 5E prefs into v10 without wiping customizations', () => {
    values.set('cs-match-helper.team-table-columns-v9.5e', JSON.stringify({
      version: 9,
      order: ['nickname', 'kd', 'score'],
      visible: ['nickname', 'kd'],
    }));
    const columns = useTeamTableColumns(ref('5e'));
    expect(columns.visibleKeys.value).toEqual(['nickname', 'kd']);
    expect(columns.columnOrder.value[0]).toBe('nickname');
    expect(columns.columnOrder.value[1]).toBe('kd');
    expect(columns.columnOrder.value[2]).toBe('score');

    const saved = JSON.parse(values.get(getStorageKeyForPlatform('5e'))!);
    expect(saved.version).toBe(10);
    expect(saved.visible).toEqual(['nickname', 'kd']);
  });
});
