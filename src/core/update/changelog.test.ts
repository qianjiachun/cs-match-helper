import { describe, expect, it } from 'vitest';
import { formatChangelogDate, normalizeVersion } from './changelog';

describe('changelog helpers', () => {
  it('formats ISO dates in zh-CN', () => {
    expect(formatChangelogDate('2026-07-06T09:23:17Z')).toMatch(/2026/);
  });

  it('formats ISO dates in the requested locale', () => {
    expect(formatChangelogDate('2026-07-06T09:23:17Z', 'en-US')).toMatch(/July/);
  });

  it('normalizes version strings', () => {
    expect(normalizeVersion('v3.0.0')).toBe('3.0.0');
  });
});
