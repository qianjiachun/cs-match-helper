export interface CommentCursor {
  createTime: number;
  id: string;
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
}
