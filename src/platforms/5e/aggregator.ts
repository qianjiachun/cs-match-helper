import { classifyP5eUrl, extractUuidsFromRequest, parseP5eNdjsonLine } from './events';
import type { P5eApiPayload, P5eMatchBundle, P5eRawEvent } from './types';

const DEFAULT_WINDOW_MS = 12_000;

function uuidKey(uuids: string[]): string {
  return [...uuids].sort().join('|');
}

function hashUuids(uuids: string[]): string {
  let h = 0;
  const key = uuidKey(uuids);
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export class P5eMatchAggregator {
  private readonly windowMs: number;
  private readonly buckets = new Map<string, Partial<P5eMatchBundle> & { uuids: string[] }>();
  private readonly emitted = new Set<string>();
  private onMatch?: (bundle: P5eMatchBundle) => void;

  constructor(options?: { windowMs?: number; onMatch?: (bundle: P5eMatchBundle) => void }) {
    this.windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.onMatch = options?.onMatch;
  }

  setOnMatch(handler: (bundle: P5eMatchBundle) => void) {
    this.onMatch = handler;
  }

  ingest(event: P5eRawEvent): P5eMatchBundle | null {
    if (event.kind !== 'http') return null;
    const apiKind = classifyP5eUrl(event.url);
    if (!apiKind) return null;

    const uuids = extractUuidsFromRequest(event.requestBody);
    if (uuids.length < 2) return null;

    const key = uuidKey(uuids);
    const now = event.capturedAt || new Date().toISOString();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        uuids,
        capturedAt: now,
        platformGameId: `5e-${Date.now()}-${hashUuids(uuids)}`,
      };
      this.buckets.set(key, bucket);
    }

    const payload: P5eApiPayload = {
      url: event.url,
      requestBody: event.requestBody,
      responseBody: event.responseBody,
    };
    bucket[apiKind] = payload;

    if (apiKind === 'eloInfo' && event.requestBody && typeof event.requestBody === 'object') {
      const matchMode = (event.requestBody as Record<string, unknown>).match_mode;
      if (Array.isArray(matchMode)) bucket.matchMode = matchMode as number[];
    }

    this.pruneExpired();
    return this.tryFinalize(key, bucket);
  }

  ingestFixtureEvents(events: Record<string, P5eApiPayload>): P5eMatchBundle | null {
    const userReq = events.userInfo?.requestBody;
    const uuids = extractUuidsFromRequest(userReq);
    if (!uuids.length) return null;

    const key = uuidKey(uuids);
    const bucket: Partial<P5eMatchBundle> & { uuids: string[] } = {
      uuids,
      capturedAt: new Date().toISOString(),
      platformGameId: `5e-fixture-${hashUuids(uuids)}`,
      userInfo: events.userInfo,
      eloInfo: events.eloInfo,
      mapExt: events.mapExt,
    };
    if (events.eloInfo?.requestBody && typeof events.eloInfo.requestBody === 'object') {
      const matchMode = (events.eloInfo.requestBody as Record<string, unknown>).match_mode;
      if (Array.isArray(matchMode)) bucket.matchMode = matchMode as number[];
    }
    this.buckets.set(key, bucket);
    return this.tryFinalize(key, bucket, true, false);
  }

  ingestNdjson(text: string): P5eMatchBundle[] {
    const results: P5eMatchBundle[] = [];
    for (const line of text.split(/\r?\n/)) {
      const event = parseP5eNdjsonLine(line);
      if (!event) continue;
      const bundle = this.ingest(event);
      if (bundle) results.push(bundle);
    }
    return results;
  }

  private tryFinalize(
    key: string,
    bucket: Partial<P5eMatchBundle> & { uuids: string[] },
    force = false,
    notify = true,
  ): P5eMatchBundle | null {
    if (!bucket.userInfo || !bucket.eloInfo || !bucket.mapExt) {
      if (!force) return null;
      if (!bucket.userInfo && !bucket.eloInfo && !bucket.mapExt) return null;
      if (!force) return null;
    }

    if (!force && (!bucket.userInfo || !bucket.eloInfo || !bucket.mapExt)) return null;
    if (this.emitted.has(key) && !force) return null;

    const complete = Boolean(bucket.userInfo && bucket.eloInfo && bucket.mapExt);
    if (!complete && !force) return null;

    const bundle: P5eMatchBundle = {
      platformGameId: bucket.platformGameId ?? `5e-${Date.now()}`,
      uuids: bucket.uuids,
      matchMode: bucket.matchMode,
      matchCode: bucket.matchCode,
      mapName: bucket.mapName,
      matchDetail: bucket.matchDetail,
      capturedAt: bucket.capturedAt ?? new Date().toISOString(),
      userInfo: bucket.userInfo,
      eloInfo: bucket.eloInfo,
      mapExt: bucket.mapExt,
    };

    this.emitted.add(key);
    if (notify) this.onMatch?.(bundle);
    return bundle;
  }

  private pruneExpired() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, bucket] of this.buckets) {
      const ts = Date.parse(bucket.capturedAt ?? '');
      if (!Number.isNaN(ts) && ts < cutoff) this.buckets.delete(key);
    }
  }
}
