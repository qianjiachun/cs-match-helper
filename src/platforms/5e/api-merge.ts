import type { P5eApiKind, P5eApiPayload } from './types';

export function getApiDataRecord(
  responseBody: unknown,
): Record<string, Record<string, unknown>> | undefined {
  if (!responseBody || typeof responseBody !== 'object') return undefined;
  const root = responseBody as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, Record<string, unknown>>;
  }
  const keys = Object.keys(root);
  if (keys.length > 0 && keys[0].includes('-')) {
    return root as Record<string, Record<string, unknown>>;
  }
  return undefined;
}

export function countApiCoverage(
  payload: P5eApiPayload | undefined,
  canonicalUuids: string[],
): number {
  const data = getApiDataRecord(payload?.responseBody);
  if (!data) return 0;
  return canonicalUuids.filter((uuid) => data[uuid] != null).length;
}

function mergeResponseData(
  existingData: Record<string, Record<string, unknown>>,
  incomingData: Record<string, Record<string, unknown>>,
  canonical: Set<string>,
): Record<string, Record<string, unknown>> {
  const merged = { ...existingData };
  for (const [uuid, row] of Object.entries(incomingData)) {
    if (!canonical.has(uuid)) continue;
    if (row && typeof row === 'object') merged[uuid] = row;
  }
  return merged;
}

export function mergeApiPayload(
  existing: P5eApiPayload | undefined,
  incoming: P5eApiPayload,
  canonicalUuids: string[],
): P5eApiPayload {
  const canonical = new Set(canonicalUuids);
  const existingData = getApiDataRecord(existing?.responseBody) ?? {};
  const incomingData = getApiDataRecord(incoming.responseBody) ?? {};
  const mergedData = mergeResponseData(existingData, incomingData, canonical);

  const existingBody =
    existing?.responseBody && typeof existing.responseBody === 'object'
      ? { ...(existing.responseBody as Record<string, unknown>) }
      : {};

  return {
    url: incoming.url,
    requestBody: incoming.requestBody,
    responseBody: {
      ...existingBody,
      data: mergedData,
    },
  };
}

export function intersectsCanonicalUuids(
  requestUuids: string[],
  canonicalUuids: string[],
): boolean {
  if (!requestUuids.length || !canonicalUuids.length) return false;
  const canonical = new Set(canonicalUuids);
  return requestUuids.some((uuid) => canonical.has(uuid));
}

export const ALL_P5E_API_KINDS: P5eApiKind[] = ['userInfo', 'eloInfo', 'mapExt'];
