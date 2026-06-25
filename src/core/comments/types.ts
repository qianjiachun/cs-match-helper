export type CommentSource = 'internal' | 'perfect' | '5e';

export interface CommentCursor {
  createTime: number;
  id: string;
}

export interface CommentReply {
  id: string;
  text: string;
  createTime: number;
  likes: number;
  authorName: string;
  authorAvatar?: string;
  region?: string;
  image?: string;
  replyToName?: string;
}

export interface CommentItem {
  id: string;
  text: string;
  likes: number;
  createTime: number;
  liked?: boolean;
  self?: boolean;
  editedAt?: number;
  color?: string;
  source?: CommentSource;
  authorName?: string;
  authorAvatar?: string;
  region?: string;
  images?: string[];
  /** 平台留言板回复（完美 / 5E） */
  replies?: CommentReply[];
  /** 软件内部回复，通过 comment/reply/list 单独加载 */
  internalReplies?: CommentItem[];
  replyCount?: number;
  replyId?: string;
  floor?: number;
  readOnly?: boolean;
}

export interface HistoryCommentItem extends CommentItem {
  steamid: string;
  self: true;
}

export interface CommentListResult {
  list: CommentItem[];
  more: boolean;
  nextCursor: CommentCursor | null;
}

export interface CommentReplyListResult {
  list: CommentItem[];
  more: boolean;
  nextCursor: CommentCursor | null;
}

export interface CommentHistoryResult {
  list: HistoryCommentItem[];
  more: boolean;
  nextCursor: CommentCursor | null;
}

export interface CommentBatchCounts {
  [steamid: string]: { count: number };
}

export interface CommentLikeResult {
  likes: number;
  liked: boolean;
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface CommentPlayerTarget {
  steamId: string;
  nickname: string;
  avatar?: string;
  platformBoardId?: string;
}

export interface PlatformBoardCursor {
  kind: '5e-page' | 'perfect-last-id';
  value: string;
}

export interface PlatformBoardListResult {
  list: CommentItem[];
  more: boolean;
  nextCursor: PlatformBoardCursor | null;
  totalHint?: number;
}

export interface PlatformBoardCountResult {
  count: number;
  hasMore?: boolean;
}

export interface PlayerCommentCount {
  count: number;
  hasMore?: boolean;
}
