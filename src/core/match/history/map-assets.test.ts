import { describe, expect, it } from 'vitest';
import { resolveMapAsset, resolveMapSlug } from './map-assets';

describe('map-assets', () => {
  it('resolves common aliases to slug', () => {
    expect(resolveMapSlug('de_dust2')).toBe('dust2');
    expect(resolveMapSlug('Dust II')).toBe('dust2');
    expect(resolveMapSlug('mirage')).toBe('mirage');
    expect(resolveMapSlug('de_ancient')).toBe('ancient');
  });

  it('builds zh/en and image url', () => {
    const asset = resolveMapAsset('de_mirage');
    expect(asset).toEqual({
      slug: 'mirage',
      en: 'Mirage',
      zh: '荒漠迷城',
      imageUrl: 'https://www.csgo.com.cn/images/maps/jianying/map_mirage.jpg',
    });
  });

  it('returns null for empty name', () => {
    expect(resolveMapSlug('')).toBeNull();
    expect(resolveMapAsset(null)).toBeNull();
  });
});
