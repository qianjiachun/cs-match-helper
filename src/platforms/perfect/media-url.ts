const WMPVP_CDN = 'https://img.wmpvp.com';

/** 将日志/JSON 中的头像地址规范为可加载的绝对 URL */
export function normalizeMediaUrl(url?: string): string | undefined {
  if (!url) return undefined;

  let normalized = url.trim().replace(/\\\//g, '/');
  if (!normalized) return undefined;

  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  } else if (normalized.startsWith('/')) {
    normalized = `${WMPVP_CDN}${normalized}`;
  } else if (!/^https?:\/\//i.test(normalized)) {
    normalized = `${WMPVP_CDN}/${normalized.replace(/^\//, '')}`;
  }

  return normalized;
}

export function pickPlayerAvatar(extra: Record<string, unknown>): string | undefined {
  const candidates: (string | undefined)[] = [
    typeof extra.avatar === 'string' ? extra.avatar : undefined,
    typeof extra.csgoRgbAvatar === 'string' ? extra.csgoRgbAvatar : undefined,
  ];

  const border = extra.avatarBorder;
  if (border && typeof border === 'object' && !Array.isArray(border)) {
    const image = (border as Record<string, unknown>).image;
    if (typeof image === 'string') candidates.push(image);
  }

  const nft = extra.nftAvatar;
  if (Array.isArray(nft)) {
    for (const item of nft) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        candidates.push(
          typeof obj.image === 'string' ? obj.image : undefined,
          typeof obj.url === 'string' ? obj.url : undefined,
        );
      }
    }
  }

  for (const raw of candidates) {
    const url = normalizeMediaUrl(raw);
    if (url) return url;
  }

  return undefined;
}
