import type { CommentItem } from './types';

export function isInternalComment(item: CommentItem): boolean {
  return !item.readOnly && (!item.source || item.source === 'internal');
}

export function isInternalTopLevelComment(item: CommentItem): boolean {
  return isInternalComment(item) && !item.replyId;
}

export function normalizeInternalComment(item: CommentItem): CommentItem {
  return {
    ...item,
    source: item.source ?? 'internal',
  };
}

export function normalizeInternalReplyList(list: CommentItem[]): CommentItem[] {
  return list.map((item) =>
    normalizeInternalComment({
      ...item,
      source: 'internal',
    }),
  );
}

/** 从评论树中提取当前用户（self）的服务端 color，用于乐观更新与身份展示 */
export function extractSelfColorFromComments(items: CommentItem[]): string | null {
  for (const item of items) {
    if (item.self && item.color) return item.color;
    if (item.internalReplies?.length) {
      const nested = extractSelfColorFromComments(item.internalReplies);
      if (nested) return nested;
    }
  }
  return null;
}
