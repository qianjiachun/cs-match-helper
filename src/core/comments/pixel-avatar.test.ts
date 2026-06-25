import { describe, expect, it } from 'vitest';
import { generateAvatarFromColor, hashString } from './pixel-avatar';

const SAMPLE_COLORS = ['#5a8fd3', '#c45a8f', '#5ac48f', '#c4a35a', '#8f5ac4'];

describe('hashString', () => {
  it('returns a fixed hash for #5a8fd3', () => {
    expect(hashString('#5a8fd3')).toBe(1_688_413_524);
  });
});

describe('generateAvatarFromColor', () => {
  it('returns null for missing or invalid color', () => {
    expect(generateAvatarFromColor('')).toBeNull();
    expect(generateAvatarFromColor('red')).toBeNull();
    expect(generateAvatarFromColor('#fff')).toBeNull();
  });

  it('normalizes uppercase hex before generating', () => {
    const lower = generateAvatarFromColor('#5a8fd3');
    const upper = generateAvatarFromColor('#5A8FD3');
    expect(lower).not.toBeNull();
    expect(upper).toEqual(lower);
  });

  it('is deterministic for the same color', () => {
    const first = generateAvatarFromColor('#5a8fd3');
    const second = generateAvatarFromColor('#5a8fd3');
    expect(first).toEqual(second);
  });

  it('produces 8x8 symmetric pixels', () => {
    for (const color of SAMPLE_COLORS) {
      const avatar = generateAvatarFromColor(color);
      expect(avatar).not.toBeNull();
      expect(avatar!.size).toBe(8);
      expect(avatar!.pixels).toHaveLength(64);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 4; x++) {
          expect(avatar!.pixels[y * 8 + x]).toBe(avatar!.pixels[y * 8 + (7 - x)]);
        }
      }
    }
  });

  it('produces distinct patterns for different colors', () => {
    const signatures = SAMPLE_COLORS.map((color) =>
      generateAvatarFromColor(color)!
        .pixels.join(',')
    );
    expect(new Set(signatures).size).toBe(SAMPLE_COLORS.length);
  });
});
