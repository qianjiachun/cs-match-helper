import { describe, expect, it } from 'vitest';
import {
  formatCommentDateTime,
  formatCommentRelativeTime,
  formatCommentTimeMeta,
} from './format-time';

const NOW = new Date('2025-06-18T15:30:00').getTime();

describe('formatCommentRelativeTime', () => {
  it('returns 刚刚 for under one minute', () => {
    expect(formatCommentRelativeTime(NOW - 30_000, NOW)).toBe('刚刚');
  });

  it('returns minutes ago', () => {
    expect(formatCommentRelativeTime(NOW - 45 * 60_000, NOW)).toBe('45分钟前');
  });

  it('returns hours ago', () => {
    expect(formatCommentRelativeTime(NOW - 3 * 60 * 60_000, NOW)).toBe('3小时前');
  });

  it('returns days ago', () => {
    expect(formatCommentRelativeTime(NOW - 5 * 24 * 60 * 60_000, NOW)).toBe('5天前');
  });

  it('returns months ago', () => {
    expect(formatCommentRelativeTime(new Date('2025-03-18T15:30:00').getTime(), NOW)).toBe('3个月前');
  });

  it('returns years ago', () => {
    expect(formatCommentRelativeTime(new Date('2023-06-18T15:30:00').getTime(), NOW)).toBe('2年前');
  });
});

describe('formatCommentDateTime', () => {
  it('formats with year and without seconds', () => {
    expect(formatCommentDateTime(new Date('2025-06-18T14:05:00').getTime())).toBe(
      '2025/6/18 14:05',
    );
  });
});

describe('formatCommentTimeMeta', () => {
  it('combines relative and absolute time', () => {
    const meta = formatCommentTimeMeta(NOW - 45 * 60_000, NOW);
    expect(meta.relative).toBe('45分钟前');
    expect(meta.absolute).toBe('2025/6/18 14:45');
    expect(meta.iso).toBe(new Date(NOW - 45 * 60_000).toISOString());
  });
});
