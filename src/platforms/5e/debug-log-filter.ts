import type { DebugLogEntry } from '@core/log/types';

export type P5eLogFilterKey = 'all' | 'http' | 'gate' | 'ws' | 'status' | 'match';

export const P5E_LOG_FILTER_OPTIONS: { key: P5eLogFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'http', label: 'HTTP' },
  { key: 'gate', label: 'Gate' },
  { key: 'ws', label: 'WS' },
  { key: 'status', label: '状态' },
  { key: 'match', label: '匹配' },
];

const HTTP_CATEGORIES = new Set(['用户信息', 'Elo 批量', '地图扩展']);
const WS_CATEGORIES = new Set(['WS 打开', 'WS 帧', 'WS 关闭']);
const GATE_CATEGORIES = new Set(['Gate 调试']);
const STATUS_CATEGORIES = new Set([
  '采集',
  '5E 连接',
  '状态',
  '启动',
  '探测',
  'WS 调试',
  'player/home',
  '匹配 enrich',
  '模拟匹配',
]);

function matchesCategory(filter: P5eLogFilterKey, entry: DebugLogEntry): boolean {
  if (filter === 'all') return true;
  if (filter === 'match') return entry.isMatchEvent;
  const category = entry.parsed.category ?? '';
  switch (filter) {
    case 'http':
      return HTTP_CATEGORIES.has(category);
    case 'gate':
      return GATE_CATEGORIES.has(category);
    case 'ws':
      return WS_CATEGORIES.has(category);
    case 'status':
      return STATUS_CATEGORIES.has(category);
    default:
      return true;
  }
}

function matchesQuery(entry: DebugLogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    entry.parsed.category,
    entry.parsed.level,
    entry.parsed.decoded,
    entry.parsed.raw,
    entry.receivedAt,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}

export function filterP5eLogEntries(
  entries: DebugLogEntry[],
  filter: P5eLogFilterKey,
  query: string,
): DebugLogEntry[] {
  return entries.filter((entry) => matchesCategory(filter, entry) && matchesQuery(entry, query));
}
