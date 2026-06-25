import type {
  ApiResponse,
  CommentBatchCounts,
  CommentCursor,
  CommentHistoryResult,
  CommentItem,
  CommentLikeResult,
  CommentListResult,
  CommentReplyListResult,
} from './types';
import { filterValidSteamIds } from './steam-id';

export const COMMENT_API_BASE = 'https://fkbuff.com/api/v1/cs-match-helper';

export const DEFAULT_COMMENT_API_CACHE_TTL_MS = 30_000;

export class CommentApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'CommentApiError';
  }
}

type ClientKeyProvider = () => Promise<string>;

let clientKeyProvider: ClientKeyProvider | null = null;

export function setCommentClientKeyProvider(provider: ClientKeyProvider) {
  clientKeyProvider = provider;
}

async function resolveClientKey(): Promise<string | undefined> {
  if (!clientKeyProvider) return undefined;
  const key = await clientKeyProvider();
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new CommentApiError('客户端身份无效');
  }
  return key;
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new CommentApiError('服务器响应格式错误');
  }

  if (!json || typeof json.code !== 'number') {
    throw new CommentApiError('服务器响应格式错误');
  }

  if (json.code !== 0) {
    throw new CommentApiError(json.msg || '请求失败', json.code);
  }

  return json.data;
}

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const responseCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

function buildCacheKey(path: string, body: unknown, withClientKey: boolean): string {
  return `${withClientKey ? '1' : '0'}:${path}:${JSON.stringify(body)}`;
}

function resolveCacheTtl(cache?: boolean | number): number | null {
  if (cache === false) return null;
  if (typeof cache === 'number') return cache;
  return DEFAULT_COMMENT_API_CACHE_TTL_MS;
}

/** 清空评论接口响应缓存（写操作后自动调用） */
export function invalidateCommentApiCache() {
  responseCache.clear();
}

/** 仅用于测试 */
export function clearCommentApiCacheForTests() {
  responseCache.clear();
  inflightRequests.clear();
}

async function postJson<T>(
  path: string,
  body: unknown,
  options?: { withClientKey?: boolean; cache?: boolean | number },
): Promise<T> {
  const withClientKey = options?.withClientKey !== false;
  const ttl = resolveCacheTtl(options?.cache);
  const cacheKey = ttl !== null ? buildCacheKey(path, body, withClientKey) : null;

  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }
    if (cached) responseCache.delete(cacheKey);

    const pending = inflightRequests.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }

  const request = (async () => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (withClientKey) {
        const clientKey = await resolveClientKey();
        if (!clientKey) {
          throw new CommentApiError('无法获取客户端身份');
        }
        headers['x-cs-client-key'] = clientKey;
      }

      const res = await fetch(`${COMMENT_API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const data = await parseApiResponse<T>(res);
      if (cacheKey && ttl !== null) {
        responseCache.set(cacheKey, { data, expiresAt: Date.now() + ttl });
      }
      return data;
    } catch (err) {
      if (cacheKey) {
        responseCache.delete(cacheKey);
      }
      throw err;
    } finally {
      if (cacheKey) {
        inflightRequests.delete(cacheKey);
      }
    }
  })();

  if (cacheKey) {
    inflightRequests.set(cacheKey, request);
  }

  return request;
}

async function postJsonMutate<T>(
  path: string,
  body: unknown,
  options?: { withClientKey?: boolean },
): Promise<T> {
  invalidateCommentApiCache();
  return postJson<T>(path, body, { ...options, cache: false });
}

export async function fetchCommentBatchCounts(
  steamIds: string[],
  options?: { cache?: boolean | number },
): Promise<CommentBatchCounts> {
  const valid = filterValidSteamIds(steamIds);
  if (valid.length === 0) return {};

  return postJson<CommentBatchCounts>(
    '/comment/batch',
    { steamids: valid.slice(0, 50) },
    { withClientKey: false, cache: options?.cache },
  );
}

export async function fetchCommentList(
  steamid: string,
  options?: {
    limit?: number;
    cursor?: CommentCursor | null;
    sort?: 'time' | 'hot';
    cache?: boolean | number;
  },
): Promise<CommentListResult> {
  const body: Record<string, unknown> = {
    steamid,
    limit: options?.limit ?? 20,
  };
  if (options?.sort) {
    body.sort = options.sort;
  }
  if (options?.cursor) {
    body.cursor = options.cursor;
  }
  return postJson<CommentListResult>('/comment/list', body, { cache: options?.cache });
}

export async function fetchCommentReplyList(
  commentId: string,
  options?: {
    limit?: number;
    cursor?: CommentCursor | null;
    cache?: boolean | number;
  },
): Promise<CommentReplyListResult> {
  const body: Record<string, unknown> = {
    commentId,
    limit: options?.limit ?? 20,
  };
  if (options?.cursor) {
    body.cursor = options.cursor;
  }
  return postJson<CommentReplyListResult>('/comment/reply/list', body, { cache: options?.cache });
}

export async function fetchCommentHistory(
  options?: { limit?: number; cursor?: CommentCursor | null; cache?: boolean | number },
): Promise<CommentHistoryResult> {
  const body: Record<string, unknown> = {
    limit: options?.limit ?? 20,
  };
  if (options?.cursor) {
    body.cursor = options.cursor;
  }
  return postJson<CommentHistoryResult>('/comment/history', body, { cache: options?.cache });
}

export async function addComment(
  steamid: string,
  text: string,
  replyId?: string,
): Promise<{ id: string }> {
  const body: Record<string, string> = { steamid, text };
  if (replyId) body.replyId = replyId;
  return postJsonMutate<{ id: string }>('/comment/add', body);
}

export async function updateComment(commentId: string, text: string): Promise<{ id: string }> {
  return postJsonMutate<{ id: string }>('/comment/update', { commentId, text });
}

export async function likeComment(commentId: string): Promise<CommentLikeResult> {
  return postJsonMutate<CommentLikeResult>('/comment/like', { commentId });
}

export function createOptimisticComment(text: string): CommentItem {
  return {
    id: `local-${Date.now()}`,
    text,
    likes: 0,
    createTime: Date.now(),
    liked: false,
    self: true,
  };
}
