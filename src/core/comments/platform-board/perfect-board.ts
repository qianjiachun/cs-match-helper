import type { CommentItem, CommentReply, PlatformBoardCursor, PlatformBoardListResult } from '../types';
import { fetchHttpJson } from './http';

export const PERFECT_MEDIA_REFERER = 'https://news.wmpvp.com/';

const BOARD_API =
  'https://gwapi.pwesports.cn/appuser/community/comment/getCommentListById';

interface PerfectUserDto {
  userName?: string;
  avatar?: string;
}

interface PerfectReplyRow {
  id?: number;
  content?: string;
  createTime?: number;
  likeCount?: number;
  userRegion?: string;
  fromUserName?: string;
  fromUserDTO?: PerfectUserDto;
  toUserName?: string;
  image?: string;
}

interface PerfectCommentRow {
  commentId?: number;
  content?: string;
  createTime?: number;
  likeCount?: number;
  userRegion?: string;
  userName?: string;
  userDTO?: PerfectUserDto;
  replyComments?: PerfectReplyRow[];
  image?: string;
  hasImg?: boolean;
  floor?: number;
}

interface PerfectCommentResponse {
  code?: number;
  message?: string;
  result?: {
    commentResponse?: {
      commentDTOS?: PerfectCommentRow[];
      itemCount?: number;
    };
  };
}

function parseMillis(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n < 1_000_000_000_000 ? n * 1000 : n;
}

function mapReply(row: PerfectReplyRow, parentId: number, index: number): CommentReply | null {
  const text = String(row.content ?? '').trim();
  if (!text && !row.image) return null;
  const author = row.fromUserDTO;
  return {
    id: `perfect-reply:${parentId}:${row.id ?? index}`,
    text: text || '[图片]',
    createTime: parseMillis(row.createTime),
    likes: Number(row.likeCount ?? 0) || 0,
    authorName: row.fromUserName?.trim() || author?.userName?.trim() || '完美用户',
    authorAvatar: author?.avatar?.trim() || undefined,
    region: row.userRegion?.trim() || undefined,
    image: row.image?.trim() || undefined,
    replyToName: row.toUserName?.trim() || undefined,
  };
}

function mapComment(row: PerfectCommentRow): CommentItem | null {
  const id = row.commentId;
  const text = String(row.content ?? '').trim();
  if (id == null || (!text && !row.image && !row.hasImg)) return null;

  const user = row.userDTO;
  const images = row.image?.trim() ? [row.image.trim()] : undefined;
  const replies = (row.replyComments ?? [])
    .map((reply, index) => mapReply(reply, id, index))
    .filter((reply): reply is CommentReply => reply != null);

  return {
    id: `perfect:${id}`,
    text: text || '[图片]',
    likes: Number(row.likeCount ?? 0) || 0,
    createTime: parseMillis(row.createTime),
    source: 'perfect',
    readOnly: true,
    authorName: row.userName?.trim() || user?.userName?.trim() || '完美用户',
    authorAvatar: user?.avatar?.trim() || undefined,
    region: row.userRegion?.trim() || undefined,
    images,
    replies: replies.length > 0 ? replies : undefined,
    floor: typeof row.floor === 'number' && row.floor > 0 ? row.floor : undefined,
  };
}

export async function fetchPerfectBoardComments(
  entityId: string,
  options?: {
    pageSize?: number;
    cursor?: PlatformBoardCursor | null;
  },
): Promise<PlatformBoardListResult> {
  const id = entityId.trim();
  if (!id) {
    return { list: [], more: false, nextCursor: null };
  }

  const pageSize = options?.pageSize ?? 20;
  const lastId =
    options?.cursor?.kind === 'perfect-last-id' ? options.cursor.value : '0';

  const params = new URLSearchParams({
    entityId: id,
    entityType: '6',
    onlyOwner: 'false',
    pageSize: String(pageSize),
    lastId,
    ratingType: '0',
  });

  const json = await fetchHttpJson<PerfectCommentResponse>(`${BOARD_API}?${params.toString()}`, {
    Referer: PERFECT_MEDIA_REFERER,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });

  if (json?.code !== 0) {
    throw new Error(json?.message?.trim() || '完美留言板加载失败');
  }

  const rows = json.result?.commentResponse?.commentDTOS ?? [];
  const list = rows
    .map((row) => mapComment(row))
    .filter((item): item is CommentItem => item != null);

  const last = rows[rows.length - 1];
  const more = rows.length >= pageSize;
  const nextCursor =
    more && last?.commentId != null
      ? { kind: 'perfect-last-id' as const, value: String(last.commentId) }
      : null;

  return {
    list,
    more,
    nextCursor,
    totalHint: json.result?.commentResponse?.itemCount,
  };
}
