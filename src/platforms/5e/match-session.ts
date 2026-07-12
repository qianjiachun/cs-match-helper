import {
  ALL_P5E_API_KINDS,
  countApiCoverage,
  intersectsCanonicalUuids,
  mergeApiPayload,
} from './api-merge';
import {
  classifyP5eUrl,
  extractUuidsFromRequest,
  isP5eMatchingBatchUrl,
  parseMatchingBatchMapSignal,
  sameUuidSet,
  type P5eMatchingBatchMapSignal,
} from './events';
import {
  mergeGameAnchors,
  parseGameContextFromWsEvent,
  type P5eWsGameAnchor,
} from './game-context';
import type {
  P5eApiKind,
  P5eApiPayload,
  P5eHttpEvent,
  P5eMatchBundle,
  P5eRawEvent,
  P5eWsFrameEvent,
} from './types';

const HTTP_BUFFER_MS = 15_000;
const SESSION_TIMEOUT_MS = 30_000;

interface BufferedHttpEvent {
  event: P5eHttpEvent;
  at: number;
}

interface SessionState {
  anchor: P5eWsGameAnchor;
  capturedAt: string;
  lastActivityAt: number;
  matchMode?: number[];
  userInfo?: P5eApiPayload;
  eloInfo?: P5eApiPayload;
  mapExt?: P5eApiPayload;
  /** matching/batch 或外部补图写入的本局地图 */
  mapName?: string;
}

export interface P5eCaptureProgress {
  collected: number;
  total: number;
  missing: P5eApiKind[];
  gameId?: string;
  readyCount?: number;
  playerTotal?: number;
  coverage?: Partial<Record<P5eApiKind, { covered: number; total: number }>>;
}

export class P5eMatchSession {
  private session: SessionState | null = null;
  private readonly httpBuffer: BufferedHttpEvent[] = [];
  /** 已完成首次 finalize 的 gameId */
  private readonly emitted = new Set<string>();
  /** 各 gameId 最近一次成功发出的地图（空串表示曾以无图发出） */
  private readonly lastEmittedMap = new Map<string, string>();
  private readonly sessionTimeoutMs: number;
  private onMatch?: (bundle: P5eMatchBundle) => void;
  private onProgress?: (progress: P5eCaptureProgress) => void;

  constructor(options?: {
    sessionTimeoutMs?: number;
    onMatch?: (bundle: P5eMatchBundle) => void;
    onProgress?: (progress: P5eCaptureProgress) => void;
  }) {
    this.sessionTimeoutMs = options?.sessionTimeoutMs ?? SESSION_TIMEOUT_MS;
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
    if (event.kind === 'ws_frame') return this.ingestWs(event);
    if (event.kind === 'http') return this.ingestHttp(event);
    return null;
  }

  ingestWs(event: P5eWsFrameEvent): P5eMatchBundle | null {
    const anchor = parseGameContextFromWsEvent(event);
    const now = Date.now();
    if (this.session) {
      this.flushExpired(now);
    }
    if (!anchor) {
      return null;
    }

    if (!this.session || this.session.anchor.gameId !== anchor.gameId) {
      this.session = {
        anchor,
        capturedAt: event.capturedAt || anchor.capturedAt,
        lastActivityAt: now,
      };
      this.replayHttpBuffer();
    } else {
      this.session.anchor = mergeGameAnchors(this.session.anchor, anchor);
      this.session.lastActivityAt = now;
    }

    this.notifyProgress();
    this.flushExpired(now);
    return this.tryFinalize(false);
  }

  ingestHttp(event: P5eHttpEvent): P5eMatchBundle | null {
    if (isP5eMatchingBatchUrl(event.url)) {
      return this.ingestMatchingBatch(event);
    }

    const apiKind = classifyP5eUrl(event.url);
    if (!apiKind) return null;

    const now = Date.now();
    this.pushHttpBuffer(event, now);
    if (this.session) {
      this.flushExpired(now);
    }
    if (!this.session) return null;

    const requestUuids = extractUuidsFromRequest(event.requestBody);
    if (!intersectsCanonicalUuids(requestUuids, this.canonicalUuids())) return null;

    this.session.lastActivityAt = now;
    const payload: P5eApiPayload = {
      url: event.url,
      requestBody: event.requestBody,
      responseBody: event.responseBody,
    };

    const existing = this.session[apiKind];
    this.session[apiKind] = mergeApiPayload(existing, payload, this.canonicalUuids());

    if (apiKind === 'eloInfo' && event.requestBody && typeof event.requestBody === 'object') {
      const matchMode = (event.requestBody as Record<string, unknown>).match_mode;
      if (Array.isArray(matchMode)) this.session.matchMode = matchMode as number[];
    }

    this.notifyProgress();
    return this.tryFinalize(false);
  }

  /** 直接应用已解析的地图信号（供外部 Gate 轮询等通道） */
  applyMapSignal(signal: P5eMatchingBatchMapSignal): P5eMatchBundle | null {
    return this.applyResolvedMap(signal.mapName, signal.uuids);
  }

  getAnchor(): P5eWsGameAnchor | undefined {
    return this.session?.anchor;
  }

  getPendingMapName(): string | undefined {
    return this.session?.mapName;
  }

  private ingestMatchingBatch(event: P5eHttpEvent): P5eMatchBundle | null {
    const signal = parseMatchingBatchMapSignal(event.requestBody);
    if (!signal) return null;
    if (this.session) {
      this.session.lastActivityAt = Date.now();
    }
    return this.applyResolvedMap(signal.mapName, signal.uuids);
  }

  private applyResolvedMap(mapName: string, uuids: string[]): P5eMatchBundle | null {
    const trimmed = mapName.trim();
    if (!trimmed) return null;
    if (!this.session) return null;
    if (!sameUuidSet(uuids, this.canonicalUuids())) return null;

    const gameId = this.session.anchor.gameId;
    const previous = this.session.mapName;
    if (previous === trimmed) {
      // 已持有相同地图：若曾无图发出则仍可能需要补发
      return this.tryEmitMapUpdate(trimmed);
    }

    this.session.mapName = trimmed;
    this.session.lastActivityAt = Date.now();

    if (!this.emitted.has(gameId)) {
      // 首次 emit 前预存地图；若已齐数据则直接带图发出
      return this.tryFinalize(false);
    }

    return this.tryEmitMapUpdate(trimmed);
  }

  private tryEmitMapUpdate(mapName: string): P5eMatchBundle | null {
    if (!this.session) return null;
    const gameId = this.session.anchor.gameId;
    if (!this.emitted.has(gameId)) return null;

    const last = this.lastEmittedMap.get(gameId);
    if (last === mapName) return null;
    // 仅允许从「无图」补到「有图」，或纠正为空后的首次有效值
    if (last && last.length > 0) return null;

    const hasAny = Boolean(this.session.userInfo || this.session.eloInfo || this.session.mapExt);
    if (!hasAny) return null;

    const bundle = this.buildBundle(!this.isComplete());
    this.lastEmittedMap.set(gameId, mapName);
    this.onMatch?.(bundle);
    return bundle;
  }

  private canonicalUuids(): string[] {
    if (!this.session) return [];
    return [...this.session.anchor.team1Uuids, ...this.session.anchor.team2Uuids];
  }

  private pushHttpBuffer(event: P5eHttpEvent, at: number) {
    this.httpBuffer.push({ event, at });
    const cutoff = at - HTTP_BUFFER_MS;
    while (this.httpBuffer.length > 0 && this.httpBuffer[0].at < cutoff) {
      this.httpBuffer.shift();
    }
  }

  private replayHttpBuffer() {
    if (!this.session) return;
    const snapshot = [...this.httpBuffer];
    for (const { event } of snapshot) {
      this.ingestHttp(event);
    }
  }

  private coverageFor(kind: P5eApiKind): number {
    if (!this.session) return 0;
    return countApiCoverage(this.session[kind], this.canonicalUuids());
  }

  private isComplete(): boolean {
    return ALL_P5E_API_KINDS.every((kind) => this.coverageFor(kind) >= 10);
  }

  private missingKinds(): P5eApiKind[] {
    return ALL_P5E_API_KINDS.filter((kind) => this.coverageFor(kind) < 10);
  }

  private notifyProgress() {
    if (!this.session) return;
    const total = this.canonicalUuids().length;
    const coverage: P5eCaptureProgress['coverage'] = {};
    let collectedKinds = 0;
    for (const kind of ALL_P5E_API_KINDS) {
      const covered = this.coverageFor(kind);
      coverage[kind] = { covered, total };
      if (covered >= total) collectedKinds += 1;
    }
    const missing = this.missingKinds();
    this.onProgress?.({
      collected: collectedKinds,
      total: ALL_P5E_API_KINDS.length,
      missing,
      gameId: this.session.anchor.gameId,
      readyCount: this.session.anchor.readyUuids.length,
      playerTotal: total,
      coverage,
    });
  }

  private buildBundle(incomplete: boolean): P5eMatchBundle {
    const session = this.session!;
    const uuids = this.canonicalUuids();
    return {
      platformGameId: session.anchor.gameId,
      gameId: session.anchor.gameId,
      uuids,
      matchMode: session.matchMode,
      capturedAt: session.capturedAt,
      wsAnchor: session.anchor,
      mapName: session.mapName,
      userInfo: session.userInfo,
      eloInfo: session.eloInfo,
      mapExt: session.mapExt,
      incomplete,
    };
  }

  private tryFinalize(force: boolean, incomplete = false): P5eMatchBundle | null {
    if (!this.session) return null;
    const gameId = this.session.anchor.gameId;
    if (this.emitted.has(gameId) && !force) return null;

    const complete = this.isComplete();
    if (!force && !complete) return null;
    if (!complete && !incomplete) return null;

    const hasAny = Boolean(this.session.userInfo || this.session.eloInfo || this.session.mapExt);
    if (!complete && incomplete && !hasAny) return null;

    const bundle = this.buildBundle(!complete);
    this.emitted.add(gameId);
    this.lastEmittedMap.set(gameId, bundle.mapName?.trim() ?? '');
    this.onMatch?.(bundle);
    return bundle;
  }

  private flushExpired(now = Date.now()) {
    if (!this.session) return;
    const expired = now - this.session.lastActivityAt >= this.sessionTimeoutMs;
    if (!expired) return;
    if (this.emitted.has(this.session.anchor.gameId)) {
      this.session = null;
      return;
    }
    this.tryFinalize(true, true);
    this.session = null;
  }
}
