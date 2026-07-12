import type { MatchHistoryListItem } from '@core/match/history';
import { resolveMapAsset } from '@core/match/history/map-assets';

export function platformLabel(platformId: string): string {
  if (platformId === 'perfect') return '完美';
  if (platformId === '5e') return '5E';
  return '未知平台';
}

export function formatMapDisplayName(raw?: string | null): string | null {
  const asset = resolveMapAsset(raw);
  return asset?.en ?? null;
}

/** 列表主标题：中文优先 */
export function historyPrimaryMapTitle(item: MatchHistoryListItem): string {
  const asset = resolveMapAsset(item.mapName);
  if (asset?.zh) return asset.zh;
  if (asset?.en) return asset.en;
  return '未知地图';
}

/** 列表副行：英文名（主标题已是中文且不同时） */
export function historyMapEnCaption(item: MatchHistoryListItem): string | null {
  const asset = resolveMapAsset(item.mapName);
  if (!asset) return null;
  if (asset.zh && asset.zh !== asset.en) return asset.en;
  return null;
}

export function historyItemTitle(item: MatchHistoryListItem): string {
  return historyPrimaryMapTitle(item);
}

export function formatHistoryTime(
  savedAt: number,
  matchTime?: string,
  options?: { short?: boolean },
): string {
  const short = options?.short ?? false;
  const date = resolveHistoryDate(savedAt, matchTime);
  if (!date) return matchTime?.trim() || '时间未知';

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const hm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (sameDay) return short ? hm : `今天 ${hm}`;
  if (isYesterday) return short ? `昨天 ${hm}` : `昨天 ${hm}`;
  if (date.getFullYear() === now.getFullYear()) {
    return short
      ? `${date.getMonth() + 1}/${date.getDate()} ${hm}`
      : `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
  }
  return short
    ? `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
}

function resolveHistoryDate(savedAt: number, matchTime?: string): Date | null {
  if (typeof savedAt === 'number' && Number.isFinite(savedAt) && savedAt > 0) {
    const d = new Date(savedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (matchTime) {
    const parsed = Date.parse(matchTime);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return null;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 列表时间戳：优先 savedAt，其次 matchTime */
export function historyItemTimestamp(item: MatchHistoryListItem): number {
  if (typeof item.savedAt === 'number' && Number.isFinite(item.savedAt) && item.savedAt > 0) {
    return item.savedAt;
  }
  if (item.matchTime) {
    const parsed = Date.parse(item.matchTime);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return item.updatedAt ?? 0;
}

/** 按时间从新到旧排序 */
export function sortHistoryItemsNewestFirst(items: MatchHistoryListItem[]): MatchHistoryListItem[] {
  return [...items].sort((a, b) => {
    const diff = historyItemTimestamp(b) - historyItemTimestamp(a);
    if (diff !== 0) return diff;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}

export function historyFilterOptions() {
  return [
    { id: 'all' as const, label: '全部' },
    { id: 'perfect' as const, label: '完美' },
    { id: '5e' as const, label: '5E' },
  ];
}

export type HistoryPlatformFilter = 'all' | 'perfect' | '5e';

export function matchesPlatformFilter(
  platformId: string,
  filter: HistoryPlatformFilter,
): boolean {
  if (filter === 'all') return true;
  return platformId === filter;
}

/** 有可用 AI 分析结果时返回 true（列表仅作有无标记） */
export function historyHasAiAnalysis(item: MatchHistoryListItem): boolean {
  return item.aiStatus === 'done';
}

export function formatMatchAvgScore(score?: number | null): string | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(score).toLocaleString('en-US');
}
