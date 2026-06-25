import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchPlatformBoardCount } from './index';
import { fetch5eBoardComments } from './5e-board';
import { fetchPerfectBoardComments } from './perfect-board';
import type { CommentItem } from '../types';

vi.mock('./5e-board', () => ({
  fetch5eBoardComments: vi.fn(),
}));

vi.mock('./perfect-board', () => ({
  fetchPerfectBoardComments: vi.fn(),
  PERFECT_MEDIA_REFERER: 'https://example.com/',
}));

const sampleComment: CommentItem = {
  id: '5e:1',
  text: 'test',
  likes: 0,
  createTime: 1,
  source: '5e',
  readOnly: true,
};

describe('fetchPlatformBoardCount', () => {
  beforeEach(() => {
    vi.mocked(fetch5eBoardComments).mockReset();
    vi.mocked(fetchPerfectBoardComments).mockReset();
  });

  it('uses 5E list length and exposes hasMore', async () => {
    vi.mocked(fetch5eBoardComments).mockResolvedValue({
      list: [sampleComment, { ...sampleComment, id: '5e:2' }],
      more: true,
      nextCursor: { kind: '5e-page', value: '2' },
    });

    await expect(fetchPlatformBoardCount('5e', '4636458vqgojt')).resolves.toEqual({
      count: 2,
      hasMore: true,
    });
  });

  it('still prefers totalHint for perfect when larger than first page', async () => {
    vi.mocked(fetchPerfectBoardComments).mockResolvedValue({
      list: [sampleComment],
      more: true,
      nextCursor: null,
      totalHint: 42,
    });

    await expect(fetchPlatformBoardCount('perfect', 'zq-1')).resolves.toEqual({
      count: 42,
    });
  });
});
