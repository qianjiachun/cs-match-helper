import { describe, expect, it } from 'vitest';
import {
  extractSelfColorFromComments,
  isInternalComment,
  isInternalTopLevelComment,
  normalizeInternalComment,
} from './internal-comment';
import type { CommentItem } from './types';

describe('internal-comment', () => {
  const internal: CommentItem = {
    id: '1',
    text: 'hi',
    likes: 0,
    createTime: 1,
    source: 'internal',
  };

  const reply: CommentItem = {
    ...internal,
    id: '2',
    replyId: '1',
  };

  const perfect: CommentItem = {
    id: 'perfect:1',
    text: 'platform',
    likes: 0,
    createTime: 1,
    source: 'perfect',
    readOnly: true,
  };

  it('detects internal top-level comments', () => {
    expect(isInternalTopLevelComment(internal)).toBe(true);
    expect(isInternalTopLevelComment(reply)).toBe(false);
    expect(isInternalTopLevelComment(perfect)).toBe(false);
  });

  it('normalizes internal source', () => {
    expect(normalizeInternalComment({ ...internal, source: undefined }).source).toBe('internal');
    expect(isInternalComment(perfect)).toBe(false);
  });

  it('extracts self color from nested replies', () => {
    const parent: CommentItem = {
      ...internal,
      internalReplies: [
        { ...reply, self: true, color: '#5a8fd3' },
      ],
    };
    expect(extractSelfColorFromComments([parent])).toBe('#5a8fd3');
    expect(extractSelfColorFromComments([{ ...internal, self: true, color: '#c45a8f' }])).toBe('#c45a8f');
    expect(extractSelfColorFromComments([internal])).toBeNull();
  });
});
