import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CommentApiError,
  clearCommentApiCacheForTests,
  fetchCommentBatchCounts,
  fetchCommentList,
  likeComment,
  setCommentClientKeyProvider,
} from './api';
import { filterValidSteamIds, isValidSteamId64 } from './steam-id';

describe('steam-id', () => {
  it('validates SteamID64 format', () => {
    expect(isValidSteamId64('76561198000000000')).toBe(true);
    expect(isValidSteamId64('7656119800000000')).toBe(false);
    expect(isValidSteamId64('5e-abc12345')).toBe(false);
    expect(isValidSteamId64('')).toBe(false);
  });

  it('filters and deduplicates valid steam ids', () => {
    expect(
      filterValidSteamIds([
        '76561198000000000',
        '76561198000000000',
        'invalid',
        '76561198000000001',
      ]),
    ).toEqual(['76561198000000000', '76561198000000001']);
  });
});

describe('comments api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearCommentApiCacheForTests();
    setCommentClientKeyProvider(async () => 'a'.repeat(64));
  });

  it('throws CommentApiError when code is not zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ code: 1, msg: '业务失败', data: null }),
      }),
    );

    await expect(fetchCommentList('76561198000000000')).rejects.toThrow('业务失败');
  });

  it('calls batch without client key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 0,
        msg: 'success',
        data: { '76561198000000000': { count: 3 } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCommentBatchCounts(['76561198000000000']);
    expect(result['76561198000000000']?.count).toBe(3);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-cs-client-key']).toBeUndefined();
  });

  it('includes client key for authenticated endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 0,
        msg: 'success',
        data: { list: [], more: false, nextCursor: null },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchCommentList('76561198000000000');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-cs-client-key']).toBe('a'.repeat(64));
  });

  it('returns empty object when no valid steam ids for batch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCommentBatchCounts(['invalid']);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses like toggle response with liked field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          code: 0,
          msg: 'success',
          data: { likes: 2, liked: false },
        }),
      }),
    );

    const result = await likeComment('comment-id');
    expect(result).toEqual({ likes: 2, liked: false });
  });

  it('returns cached response within ttl for identical read requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 0,
        msg: 'success',
        data: { list: [{ id: '1', text: 'hi', likes: 0, createTime: 1 }], more: false, nextCursor: null },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchCommentList('76561198000000000');
    const second = await fetchCommentList('76561198000000000');

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when cache is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 0,
        msg: 'success',
        data: { list: [], more: false, nextCursor: null },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchCommentList('76561198000000000', { cache: false });
    await fetchCommentList('76561198000000000', { cache: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('invalidates read cache after like mutation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          msg: 'success',
          data: { list: [], more: false, nextCursor: null },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          msg: 'success',
          data: { likes: 1, liked: true },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          msg: 'success',
          data: { list: [], more: false, nextCursor: null },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await fetchCommentList('76561198000000000');
    await likeComment('comment-id');
    await fetchCommentList('76561198000000000');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('posts reply with replyId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 0,
        msg: 'success',
        data: { id: 'reply-id' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { addComment } = await import('./api');
    const result = await addComment('76561198000000000', '同意', 'parent-id');
    expect(result.id).toBe('reply-id');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      steamid: '76561198000000000',
      text: '同意',
      replyId: 'parent-id',
    });
  });

  it('fetches reply list for parent comment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 0,
        msg: 'success',
        data: {
          list: [
            {
              id: 'reply-1',
              text: '同意',
              likes: 1,
              createTime: 2,
              replyId: 'parent-id',
            },
          ],
          more: false,
          nextCursor: null,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchCommentReplyList } = await import('./api');
    const result = await fetchCommentReplyList('parent-id');
    expect(result.list).toHaveLength(1);
    expect(result.list[0]?.replyId).toBe('parent-id');
  });
});
