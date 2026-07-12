/** 官方地图预览图（满铺用） */
const MAP_IMAGE_BASE = 'https://www.csgo.com.cn/images/maps/jianying';

export interface MapAssetInfo {
  slug: string;
  en: string;
  zh: string;
  imageUrl: string;
}

const MAP_BY_SLUG: Record<string, Omit<MapAssetInfo, 'imageUrl'>> = {
  dust2: { slug: 'dust2', en: 'Dust II', zh: '炙热沙城 II' },
  mirage: { slug: 'mirage', en: 'Mirage', zh: '荒漠迷城' },
  inferno: { slug: 'inferno', en: 'Inferno', zh: '炼狱小镇' },
  nuke: { slug: 'nuke', en: 'Nuke', zh: '核子危机' },
  overpass: { slug: 'overpass', en: 'Overpass', zh: '死亡游乐园' },
  vertigo: { slug: 'vertigo', en: 'Vertigo', zh: '殒命大厦' },
  ancient: { slug: 'ancient', en: 'Ancient', zh: '远古遗迹' },
  anubis: { slug: 'anubis', en: 'Anubis', zh: '阿努比斯' },
  train: { slug: 'train', en: 'Train', zh: '列车停放站' },
  cache: { slug: 'cache', en: 'Cache', zh: '死亡工厂' },
  office: { slug: 'office', en: 'Office', zh: '办公室' },
  italy: { slug: 'italy', en: 'Italy', zh: '意大利小镇' },
  agency: { slug: 'agency', en: 'Agency', zh: '事务所' },
};

const ALIAS_TO_SLUG: Record<string, string> = {
  de_dust2: 'dust2',
  dust2: 'dust2',
  'dust_ii': 'dust2',
  'dust ii': 'dust2',
  de_mirage: 'mirage',
  mirage: 'mirage',
  de_inferno: 'inferno',
  inferno: 'inferno',
  de_nuke: 'nuke',
  nuke: 'nuke',
  de_overpass: 'overpass',
  overpass: 'overpass',
  de_vertigo: 'vertigo',
  vertigo: 'vertigo',
  de_ancient: 'ancient',
  ancient: 'ancient',
  de_anubis: 'anubis',
  anubis: 'anubis',
  de_train: 'train',
  train: 'train',
  de_cache: 'cache',
  cache: 'cache',
  cs_office: 'office',
  office: 'office',
  cs_italy: 'italy',
  italy: 'italy',
  cs_agency: 'agency',
  agency: 'agency',
};

export function resolveMapSlug(mapName?: string | null): string | null {
  if (!mapName) return null;
  const trimmed = mapName.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const underscored = lower.replace(/\s+/g, '_');

  if (ALIAS_TO_SLUG[lower]) return ALIAS_TO_SLUG[lower];
  if (ALIAS_TO_SLUG[underscored]) return ALIAS_TO_SLUG[underscored];

  const deMatch = underscored.match(/^de_(.+)$/);
  if (deMatch) {
    const inner = deMatch[1];
    if (ALIAS_TO_SLUG[inner] || MAP_BY_SLUG[inner]) return ALIAS_TO_SLUG[inner] ?? inner;
    return inner;
  }

  const csMatch = underscored.match(/^cs_(.+)$/);
  if (csMatch) {
    const inner = csMatch[1];
    if (ALIAS_TO_SLUG[inner] || MAP_BY_SLUG[inner]) return ALIAS_TO_SLUG[inner] ?? inner;
    return inner;
  }

  if (MAP_BY_SLUG[underscored]) return underscored;
  return underscored;
}

export function resolveMapImageUrl(slug: string): string {
  return `${MAP_IMAGE_BASE}/map_${slug}.jpg`;
}

export function resolveMapAsset(mapName?: string | null): MapAssetInfo | null {
  const slug = resolveMapSlug(mapName);
  if (!slug) return null;
  const known = MAP_BY_SLUG[slug];
  if (known) {
    return {
      ...known,
      imageUrl: resolveMapImageUrl(known.slug),
    };
  }
  const en = slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    slug,
    en,
    zh: en,
    imageUrl: resolveMapImageUrl(slug),
  };
}
