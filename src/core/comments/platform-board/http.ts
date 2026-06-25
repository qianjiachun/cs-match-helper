import { invoke } from '@tauri-apps/api/core';

export type HttpHeaders = Record<string, string>;

export async function fetchHttpJson<T = unknown>(
  url: string,
  headers?: HttpHeaders,
): Promise<T> {
  return invoke<T>('fetch_http_json', { url, headers: headers ?? null });
}

const imageCache = new Map<string, string>();

export async function fetchProxiedImageDataUrl(
  url: string,
  referer?: string,
): Promise<string> {
  const cacheKey = `${referer ?? ''}|${url}`;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  const dataUrl = await invoke<string>('fetch_proxied_image', {
    url,
    referer: referer ?? null,
  });
  imageCache.set(cacheKey, dataUrl);
  return dataUrl;
}

/** 仅用于测试 */
export function clearProxiedImageCacheForTests() {
  imageCache.clear();
}
