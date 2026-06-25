import { describe, expect, it } from 'vitest';
import { mergeCommentLists } from './merge';
import type { CommentItem } from '../types';

const internal: CommentItem = {
  id: 'internal-1',
  text: '内部评论',
  likes: 1,
  createTime: 1000,
  source: 'internal',
};

const perfect: CommentItem = {
  id: 'perfect:1',
  text: '完美评论',
  likes: 5,
  createTime: 2000,
  source: 'perfect',
  readOnly: true,
};

describe('mergeCommentLists', () => {
  it('sorts by time descending', () => {
    const merged = mergeCommentLists([internal], [perfect], 'time');
    expect(merged.map((item) => item.id)).toEqual(['perfect:1', 'internal-1']);
  });

  it('sorts by hot likes first', () => {
    const merged = mergeCommentLists([internal], [perfect], 'hot');
    expect(merged.map((item) => item.id)).toEqual(['perfect:1', 'internal-1']);
  });
});
