import type { MatchPlatformId } from '@core/match/models';
import type { CommentItem, PlatformBoardCountResult, PlatformBoardCursor, PlatformBoardListResult } from '../types';
import { fetch5eBoardComments } from './5e-board';
import { fetchPerfectBoardComments } from './perfect-board';
import { countPlatformComments, mergeCommentLists } from './merge';

export { mergeCommentLists, countPlatformComments } from './merge';
export { fetch5eBoardComments } from './5e-board';
export { fetchPerfectBoardComments, PERFECT_MEDIA_REFERER } from './perfect-board';
export { fetchProxiedImageDataUrl } from './http';

export async function fetchPlatformBoardComments(
  platformId: MatchPlatformId,
  boardId: string,
  options?: {
    cursor?: PlatformBoardCursor | null;
    sort?: 'time' | 'hot';
    pageSize?: number;
  },
): Promise<PlatformBoardListResult> {
  if (!boardId.trim()) {
    return { list: [], more: false, nextCursor: null };
  }

  if (platformId === '5e') {
    return fetch5eBoardComments(boardId, {
      cursor: options?.cursor ?? null,
      sort: options?.sort,
    });
  }

  return fetchPerfectBoardComments(boardId, {
    cursor: options?.cursor ?? null,
    pageSize: options?.pageSize,
  });
}

export async function fetchPlatformBoardCount(
  platformId: MatchPlatformId,
  boardId: string,
): Promise<PlatformBoardCountResult> {
  const result = await fetchPlatformBoardComments(platformId, boardId, {
    cursor: null,
    pageSize: 20,
    sort: 'time',
  });

  if (platformId === '5e') {
    return {
      count: result.list.length,
      hasMore: result.more,
    };
  }

  const counted = countPlatformComments(result.list);
  if (result.totalHint && result.totalHint > counted) {
    return { count: result.totalHint };
  }
  return { count: counted };
}

export function buildMergedCommentList(
  internal: CommentItem[],
  platform: CommentItem[],
  sort: 'time' | 'hot',
): CommentItem[] {
  return mergeCommentLists(internal, platform, sort);
}
