import { classifyP5eUrl, extractUuidsFromRequest, parseP5eNdjsonLine } from './events';
import type { P5eApiKind, P5eApiPayload, P5eMatchBundle, P5eRawEvent } from './types';

const DEFAULT_WINDOW_MS = 30_000;
const ALL_API_KINDS: P5eApiKind[] = ['userInfo', 'eloInfo', 'mapExt'];

function uuidKey(uuids: string[]): string {
  return [...uuids].sort().join('|');
}

function hashUuids(uuids: string[]): string {
  let h = 0;
  const key = uuidKey(uuids);
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

type Bucket = Partial<P5eMatchBundle> & {
  uuids: string[];
  lastActivityAt: number;
};

export interface P5eCaptureProgress {
  collected: number;
  total: number;
  missing: P5eApiKind[];
}

export class P5eMatchAggregator {
  private readonly windowMs: number;
  private readonly buckets = new Map<string, Bucket>();
  private readonly emitted = new Set<string>();
  private onMatch?: (bundle: P5eMatchBundle) => void;
  private onProgress?: (progress: P5eCaptureProgress) => void;

  constructor(options?: {
    windowMs?: number;
    onMatch?: (bundle: P5eMatchBundle) => void;
    onProgress?: (progress: P5eCaptureProgress) => void;
  }) {
    this.windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.onMatch = options?.onMatch;
    this.onProgress = options?.onProgress;
  }

  setOnMatch(handler: (bundle: P5eMatchBundle) => void) {
    this.onMatch = handler;
  }

  setOnProgress(handler: (progress: P5eCaptureProgress) => void) {
    this.onProgress = handler;
  }

  ingest(event: P5eRawEvent): P5eMatchBundle | null {
    if (event.kind !== 'http') return null;
    const apiKind = classifyP5eUrl(event.url);
    if (!apiKind) return null;

    const uuids = extractUuidsFromRequest(event.requestBody);
    if (uuids.length < 2) return null;

    const key = uuidKey(uuids);
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        uuids,
        capturedAt: event.capturedAt || new Date().toISOString(),
        platformGameId: `5e-${now}-${hashUuids(uuids)}`,
        lastActivityAt: now,
      };
      this.buckets.set(key, bucket);
    }

    bucket.lastActivityAt = now;

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

    this.notifyProgress(bucket);
    this.flushExpired();

    return this.tryFinalize(key, bucket);
  }

  ingestFixtureEvents(events: Record<string, P5eApiPayload>): P5eMatchBundle | null {
    const userReq = events.userInfo?.requestBody;
    const uuids = extractUuidsFromRequest(userReq);
    if (!uuids.length) return null;

    const key = uuidKey(uuids);
    const now = Date.now();
    const bucket: Bucket = {
      uuids,
      capturedAt: new Date().toISOString(),
      platformGameId: `5e-fixture-${hashUuids(uuids)}`,
      lastActivityAt: now,
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

  private collectedKinds(bucket: Bucket): P5eApiKind[] {
    return ALL_API_KINDS.filter((k) => Boolean(bucket[k]));
  }

  private missingKinds(bucket: Bucket): P5eApiKind[] {
    return ALL_API_KINDS.filter((k) => !bucket[k]);
  }

  private notifyProgress(bucket: Bucket) {
    const collected = this.collectedKinds(bucket);
    const missing = this.missingKinds(bucket);
    this.onProgress?.({
      collected: collected.length,
      total: ALL_API_KINDS.length,
      missing,
    });
  }

  private tryFinalize(
    key: string,
    bucket: Bucket,
    force = false,
    notify = true,
    incomplete = false,
  ): P5eMatchBundle | null {
    const complete = Boolean(bucket.userInfo && bucket.eloInfo && bucket.mapExt);

    if (!force && !complete) return null;
    if (!force && !complete && !incomplete) return null;

    if (!complete && incomplete) {
      const hasAny = bucket.userInfo || bucket.eloInfo || bucket.mapExt;
      if (!hasAny) return null;
    }

    if (this.emitted.has(key) && !force) return null;

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
      incomplete: incomplete || !complete,
    };

    this.emitted.add(key);
    if (notify) this.onMatch?.(bundle);
    return bundle;
  }

  private flushExpired() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastActivityAt >= cutoff) continue;
      if (this.emitted.has(key)) {
        this.buckets.delete(key);
        continue;
      }
      const hasAny = bucket.userInfo || bucket.eloInfo || bucket.mapExt;
      if (!hasAny) {
        this.buckets.delete(key);
        continue;
      }
      this.tryFinalize(key, bucket, true, true, true);
      this.buckets.delete(key);
    }
  }
}
