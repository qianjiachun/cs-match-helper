import { describe, expect, it } from 'vitest';
import {
  generateColorFromClientKey,
  generateCommentAlias,
  resolveCommentAuthorIdentity,
} from './comment-identity';

describe('generateColorFromClientKey', () => {
  it('is deterministic for the same client key', () => {
    const key = 'a'.repeat(64);
    expect(generateColorFromClientKey(key)).toBe(generateColorFromClientKey(key));
  });

  it('returns lowercase hex color', () => {
    const color = generateColorFromClientKey('b'.repeat(64));
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('generateCommentAlias', () => {
  it('returns null for invalid color', () => {
    expect(generateCommentAlias('')).toBeNull();
  });

  it('is deterministic for the same color', () => {
    expect(generateCommentAlias('#5a8fd3')).toBe(generateCommentAlias('#5a8fd3'));
  });

  it('normalizes uppercase hex', () => {
    expect(generateCommentAlias('#5A8FD3')).toBe(generateCommentAlias('#5a8fd3'));
  });

  it('uses 用户 prefix with 6 alphanumeric chars', () => {
    const alias = generateCommentAlias('#5a8fd3')!;
    expect(alias).toMatch(/^用户[a-z0-9]{6}$/);
    expect(alias.length).toBe(8);
  });

  it('produces distinct aliases for sample colors', () => {
    const colors = ['#5a8fd3', '#c45a8f', '#5ac48f', '#c4a35a', '#8f5ac4'];
    const aliases = colors.map((color) => generateCommentAlias(color)!);
    expect(new Set(aliases).size).toBe(colors.length);
  });

  it('matches snapshot alias for #5a8fd3', () => {
    expect(generateCommentAlias('#5a8fd3')).toBe('用户k7qh03');
  });
});

describe('resolveCommentAuthorIdentity', () => {
  it('falls back to self color for own comments', () => {
    const identity = resolveCommentAuthorIdentity(undefined, {
      self: true,
      selfColor: '#5a8fd3',
    });
    expect(identity).not.toBeNull();
    expect(identity!.color).toBe('#5a8fd3');
    expect(identity!.alias).toBe(generateCommentAlias('#5a8fd3'));
    expect(identity!.avatar.pixels).toHaveLength(64);
  });

  it('returns null when no color is available', () => {
    expect(resolveCommentAuthorIdentity(undefined, { self: false })).toBeNull();
    expect(resolveCommentAuthorIdentity(undefined, { self: true, selfColor: '' })).toBeNull();
  });
});
