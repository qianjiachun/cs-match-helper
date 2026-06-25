import type { CommentItem, CommentReply, PlatformBoardCursor, PlatformBoardListResult } from '../types';
import { fetchHttpJson } from './http';

const BOARD_API =
  'https://app.5eplay.com/api/comment/index';

interface FiveECommentUser {
  username?: string;
  avatar_url?: string;
}

interface FiveECommentRow {
  comment_id?: string;
  content?: string;
  dateline?: string;
  likes?: string;
  floor?: number;
  ip?: string;
  user_data?: FiveECommentUser;
  children?: FiveECommentRow[] | null;
  image_data?: Array<{ url?: string }>;
  img_urls?: string[];
}

interface FiveECommentResponse {
  success?: boolean;
  errcode?: number;
  data?: {
    list?: FiveECommentRow[];
    has_more?: number;
    total?: number;
  };
}

function parseUnixSeconds(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n < 1_000_000_000_000 ? n * 1000 : n;
}

function normalize5eAvatar(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://oss-arena.5eplay.com/${trimmed.replace(/^\//, '')}`;
}

function mapReply(row: FiveECommentRow, parentId: string, index: number): CommentReply {
  const user = row.user_data;
  const images = [
    ...(row.img_urls ?? []),
    ...(row.image_data?.map((item) => item.url).filter((url): url is string => Boolean(url)) ?? []),
  ];
  return {
    id: `5e-reply:${parentId}:${row.comment_id ?? index}`,
    text: String(row.content ?? '').trim(),
    createTime: parseUnixSeconds(row.dateline),
    likes: Number(row.likes ?? 0) || 0,
    authorName: user?.username?.trim() || '5E 用户',
    authorAvatar: normalize5eAvatar(user?.avatar_url),
    region: row.ip?.trim() || undefined,
    image: images[0],
  };
}

function mapComment(row: FiveECommentRow): CommentItem | null {
  const id = row.comment_id;
  const text = String(row.content ?? '').trim();
  if (!id || !text) return null;

  const user = row.user_data;
  const images = [
    ...(row.img_urls ?? []),
    ...(row.image_data?.map((item) => item.url).filter((url): url is string => Boolean(url)) ?? []),
  ];
  const children = Array.isArray(row.children) ? row.children : [];
  const replies = children
    .map((child, childIndex) => mapReply(child, id, childIndex))
    .filter((reply) => reply.text.length > 0);

  return {
    id: `5e:${id}`,
    text,
    likes: Number(row.likes ?? 0) || 0,
    createTime: parseUnixSeconds(row.dateline),
    source: '5e',
    readOnly: true,
    authorName: user?.username?.trim() || '5E 用户',
    authorAvatar: normalize5eAvatar(user?.avatar_url),
    region: row.ip?.trim() || undefined,
    images: images.length > 0 ? images : undefined,
    replies: replies.length > 0 ? replies : undefined,
    floor: typeof row.floor === 'number' && row.floor > 0 ? row.floor : undefined,
  };
}

export async function fetch5eBoardComments(
  domain: string,
  options?: {
    page?: number;
    cursor?: PlatformBoardCursor | null;
    sort?: 'time' | 'hot';
  },
): Promise<PlatformBoardListResult> {
  const boardId = domain.trim().toLowerCase();
  if (!boardId) {
    return { list: [], more: false, nextCursor: null };
  }

  const page = options?.cursor?.kind === '5e-page'
    ? Number(options.cursor.value) || 1
    : options?.page ?? 1;
  const sort = options?.sort === 'hot' ? 'hot' : 'desc';

  const params = new URLSearchParams({
    from_type: '5',
    from_id: boardId,
    page: String(page),
    sort,
    source: 'board',
    child_comment_id: 'null',
    comment_id: 'null',
  });

  const json = await fetchHttpJson<FiveECommentResponse>(`${BOARD_API}?${params.toString()}`, {
    Referer: 'https://app.5eplay.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });

  if (!json?.success || json.errcode !== 0) {
    throw new Error('5E 留言板加载失败');
  }

  const rows = json.data?.list ?? [];
  const list = rows
    .map((row) => mapComment(row))
    .filter((item): item is CommentItem => item != null);

  const hasMore = Number(json.data?.has_more ?? 0) === 1;

  return {
    list,
    more: hasMore,
    nextCursor: hasMore ? { kind: '5e-page', value: String(page + 1) } : null,
  };
}
