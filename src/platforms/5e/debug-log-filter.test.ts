import { describe, expect, it } from 'vitest';
import type { DebugLogEntry } from '@core/log/types';
import { filterP5eLogEntries } from './debug-log-filter';

function entry(category: string, decoded = '', isMatchEvent = false): DebugLogEntry {
  return {
    id: Math.random().toString(36),
    receivedAt: '12:00:00',
    parsed: { decoded, raw: decoded, category, level: 'DEBUG' },
    isMatchEvent,
  };
}

describe('filterP5eLogEntries', () => {
  const entries = [
    entry('用户信息', 'user/info batch'),
    entry('Gate 调试', 'gate host'),
    entry('WS 帧', 'game_ctx'),
    entry('采集', 'waiting elo'),
    entry('匹配完成', 'match ok', true),
  ];

  it('filters by http category', () => {
    const out = filterP5eLogEntries(entries, 'http', '');
    expect(out).toHaveLength(1);
    expect(out[0].parsed.category).toBe('用户信息');
  });

  it('filters ws and gate', () => {
    expect(filterP5eLogEntries(entries, 'ws', '').map((e) => e.parsed.category)).toEqual(['WS 帧']);
    expect(filterP5eLogEntries(entries, 'gate', '').map((e) => e.parsed.category)).toEqual([
      'Gate 调试',
    ]);
  });

  it('filters match events only', () => {
    const out = filterP5eLogEntries(entries, 'match', '');
    expect(out).toHaveLength(1);
    expect(out[0].isMatchEvent).toBe(true);
  });

  it('applies text query', () => {
    const out = filterP5eLogEntries(entries, 'all', 'game_ctx');
    expect(out).toHaveLength(1);
    expect(out[0].parsed.category).toBe('WS 帧');
  });
});
