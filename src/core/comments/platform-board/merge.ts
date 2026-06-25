import type { CommentItem } from '../types';

export function mergeCommentLists(
  internal: CommentItem[],
  platform: CommentItem[],
  sort: 'time' | 'hot',
): CommentItem[] {
  const merged = [...internal, ...platform];
  if (sort === 'hot') {
    return merged.sort((a, b) => {
      const likeDiff = b.likes - a.likes;
      if (likeDiff !== 0) return likeDiff;
      return b.createTime - a.createTime;
    });
  }
  return merged.sort((a, b) => b.createTime - a.createTime);
}

export function countPlatformComments(items: CommentItem[]): number {
  return items.reduce((sum, item) => sum + 1 + (item.replies?.length ?? 0), 0);
}
