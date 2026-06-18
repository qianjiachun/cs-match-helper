import { describe, expect, it } from 'vitest';
import { COMMENT_EDIT_WINDOW_MS, isCommentEditable } from './edit-policy';

describe('isCommentEditable', () => {
  const now = new Date('2025-06-18T12:00:00').getTime();

  it('returns true within 30 days', () => {
    expect(isCommentEditable(now - COMMENT_EDIT_WINDOW_MS + 1, now)).toBe(true);
    expect(isCommentEditable(now - 24 * 60 * 60 * 1000, now)).toBe(true);
  });

  it('returns false at or beyond 30 days', () => {
    expect(isCommentEditable(now - COMMENT_EDIT_WINDOW_MS, now)).toBe(false);
    expect(isCommentEditable(now - COMMENT_EDIT_WINDOW_MS - 1, now)).toBe(false);
  });

  it('returns false for invalid createTime', () => {
    expect(isCommentEditable(Number.NaN, now)).toBe(false);
  });
});
