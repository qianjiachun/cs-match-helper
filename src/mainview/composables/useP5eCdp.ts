import type { DebugLogEntry } from '@core/log/types';
import type { MatchRecord } from '@core/match/models';
import { P5eMatchAggregator } from '@platforms/5e/aggregator';
import type { P5eCaptureProgress } from '@platforms/5e/match-session';
import { P5eMatchSession } from '@platforms/5e/match-session';
import {
  classifyP5eUrl,
  extractUuidsFromRequest,
  parseP5eNdjsonLine,
  sanitizeP5eHttpEvent,
} from '@platforms/5e/events';
import { enrichP5eBundleWithLiveMap } from '@platforms/5e/match-api';
import { enrichP5eBundleWithPlayerHome, formatP5eHomeEnrichError } from '@platforms/5e/home-api';
import { createP5eMatchRecord } from '@platforms/5e/match-parser';
import type { P5eApiKind, P5eCdpEvent, P5eCdpStatus, P5eHttpEvent, P5eMatchBundle, P5eWsEvent } from '@platforms/5e/types';
import { formatWsEventDetail, isP5eHttpEvent, isP5eWsEvent, summarizeWsEvent } from '@platforms/5e/ws-events';
import {
  get5eCdpStatus,
  launch5eWithCdp,
  on5eCdpEvent,
  on5eCdpStatus,
  probe5eEnvironment,
  set5eCdpGateDebugMode,
  set5eCdpWsDebugMode,
  start5eCdpCollector,
  stop5eCdpCollector,
} from '@core/platform/5e';
import { onUnmounted, ref, shallowRef } from 'vue';

const MAX_P5E_DEBUG_LOG_ENTRIES = 100;
const DISCONNECT_WARN_MS = 5_000;
export const P5E_AUTO_RECOVER_MAX = 1;

const API_KIND_LABEL: Record<string, string> = {
  userInfo: '用户信息',
  eloInfo: 'Elo 批量',
  mapExt: '地图扩展',
  gateDebug: 'Gate 调试',
  wsOpen: 'WS 打开',
  wsFrame: 'WS 帧',
  wsClose: 'WS 关闭',
};

const MISSING_API_LABEL: Record<P5eApiKind, string> = {
  userInfo: 'user/info',
  eloInfo: 'elo/info',
  mapExt: 'map-ext',
};

/** 启动门控：仅 CDP 已就绪且由本应用启动时才允许进入采集。 */
export function getP5eLaunchCollectError(launch: {
  cdpReady: boolean;
  launched: boolean;
  message: string;
}): string | null {
  if (launch.cdpReady && !launch.launched) {
    return 'EXTERNAL_5E_RUNNING';
  }
  if (!launch.cdpReady) {
    return launch.message || '未能连接 5E，请完全退出后重试';
  }
  return null;
}

export function shouldTriggerP5eAutoRecover(params: {
  needsRelaunch?: boolean;
  appLaunchedSession: boolean;
  autoRecovering: boolean;
  autoRecoverAttempts: number;
  intentionalStop: boolean;
}): boolean {
  return Boolean(
    params.needsRelaunch
    && params.appLaunchedSession
    && !params.intentionalStop
    && !params.autoRecovering
    && params.autoRecoverAttempts < P5E_AUTO_RECOVER_MAX,
  );
}

export function shouldPromptManualP5eRelaunch(params: {
  needsRelaunch?: boolean;
  autoRecoverAttempts: number;
  intentionalStop: boolean;
  alreadyPrompted: boolean;
}): boolean {
  return Boolean(
    params.needsRelaunch
    && !params.intentionalStop
    && !params.alreadyPrompted
    && params.autoRecoverAttempts >= P5E_AUTO_RECOVER_MAX,
  );
}

function jsonByteSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function summarizeHttpEvent(event: P5eHttpEvent): string {
  const apiKind = classifyP5eUrl(event.url);
  const uuids = extractUuidsFromRequest(event.requestBody);
  const reqBytes = jsonByteSize(event.requestBody);
  const respBytes = jsonByteSize(event.responseBody);
  const parts = [
    `${event.method} ${event.url}`,
    apiKind ? `api=${apiKind}` : null,
    uuids.length ? `uuids=${uuids.length}` : null,
    `req=${reqBytes}B`,
    `resp=${respBytes}B`,
    event.captureError ? `err=${event.captureError}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function useP5eCdp(
  onMatch: (record: MatchRecord) => void,
  options?: { autoInit?: boolean; onClientExit?: () => void },
) {
  const autoInit = options?.autoInit ?? true;
  const status = ref<P5eCdpStatus>({
    running: false,
    port: 9222,
    phase: 'idle',
    eventsEmitted: 0,
  });

  const lastError = ref<string | null>(null);
  const gateDebugMode = ref(true);
  const wsDebugMode = ref(true);
  const captureProgress = ref<P5eCaptureProgress | null>(null);
  const autoRecovering = ref(false);
  const logEntries = shallowRef<DebugLogEntry[]>([]);
  const emitInFlight = new Map<string, Promise<void>>();

  let appLaunchedSession = false;
  let intentionalStop = false;
  let autoRecoverAttempts = 0;
  let manualRelaunchPrompted = false;
  let recoverInFlight: Promise<void> | null = null;
  let disconnectSince: number | null = null;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function pushStatusLog(category: string, message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') {
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      parsed: {
        level,
        category,
        decoded: message,
        raw: message,
      },
      isMatchEvent: false,
    };
    const next = [...logEntries.value, entry];
    logEntries.value =
      next.length > MAX_P5E_DEBUG_LOG_ENTRIES
        ? next.slice(next.length - MAX_P5E_DEBUG_LOG_ENTRIES)
        : next;
  }

  function pushWsLogEntry(event: P5eWsEvent) {
    const category =
      event.kind === 'ws_open'
        ? API_KIND_LABEL.wsOpen
        : event.kind === 'ws_close'
          ? API_KIND_LABEL.wsClose
          : API_KIND_LABEL.wsFrame;

    const decoded = wsDebugMode.value
      ? formatWsEventDetail(event)
      : summarizeWsEvent(event);

    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      parsed: {
        time: event.capturedAt,
        level: event.kind === 'ws_frame' && event.parseError ? 'WARN' : 'DEBUG',
        category,
        decoded,
        raw: `${event.kind} ${event.url}`,
      },
      isMatchEvent: false,
    };
    const next = [...logEntries.value, entry];
    logEntries.value =
      next.length > MAX_P5E_DEBUG_LOG_ENTRIES
        ? next.slice(next.length - MAX_P5E_DEBUG_LOG_ENTRIES)
        : next;
  }

  function pushLogEntry(event: P5eHttpEvent, isMatchEvent = false) {
    const apiKind = classifyP5eUrl(event.url);
    const category = event.gateDebug
      ? API_KIND_LABEL.gateDebug
      : apiKind
        ? (API_KIND_LABEL[apiKind] ?? apiKind)
        : '5E HTTP';

    const decoded =
      gateDebugMode.value && event.gateDebug
        ? JSON.stringify(
            {
              url: event.url,
              method: event.method,
              requestBody: event.requestBody,
              responseBody: event.responseBody,
            },
            null,
            2,
          ).slice(0, 32_768)
        : summarizeHttpEvent(event);

    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      parsed: {
        time: event.capturedAt,
        level: 'DEBUG',
        category,
        decoded,
        raw: `${event.method} ${event.url}`,
      },
      isMatchEvent,
    };
    const next = [...logEntries.value, entry];
    logEntries.value =
      next.length > MAX_P5E_DEBUG_LOG_ENTRIES
        ? next.slice(next.length - MAX_P5E_DEBUG_LOG_ENTRIES)
        : next;
  }

  function pushMatchLogEntry(record: MatchRecord) {
    const playerCount =
      record.detail.teams.reduce((n, t) => n + t.players.length, 0) +
      record.detail.unassigned.length;
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      parsed: {
        level: 'INFO',
        category: '匹配完成',
        decoded: JSON.stringify(
          {
            id: record.id,
            platformId: record.platformId,
            mapName: record.summary.mapName ?? record.detail.mapName,
            playerCount,
            warnings: record.detail.parseWarnings,
          },
          null,
          2,
        ),
        raw: `[5e-match] ${record.summary.mapName ?? record.detail.mapName ?? '未知地图'} · ${playerCount} 人`,
      },
      isMatchEvent: true,
    };
    const next = [...logEntries.value, entry];
    logEntries.value =
      next.length > MAX_P5E_DEBUG_LOG_ENTRIES
        ? next.slice(next.length - MAX_P5E_DEBUG_LOG_ENTRIES)
        : next;
  }

  function clearLogEntries() {
    logEntries.value = [];
  }

  function bundleEmitKey(bundle: P5eMatchBundle): string {
    return bundle.gameId ?? bundle.wsAnchor?.gameId ?? [...bundle.uuids].sort().join('|');
  }

  async function enrichBundleForMatch(bundle: P5eMatchBundle): Promise<P5eMatchBundle> {
    const withMap = await enrichP5eBundleWithLiveMap(bundle);
    return enrichP5eBundleWithPlayerHome(withMap);
  }

  function logHomeEnrichGap(enriched: P5eMatchBundle) {
    const homeN = Object.keys(enriched.playerHome ?? {}).length;
    const total = enriched.uuids.length;
    if (homeN < total) {
      const msg = enriched.homeEnrichError
        ? formatP5eHomeEnrichError(enriched.homeEnrichError)
        : '部分玩家缺少主页数据';
      console.warn(`[5e] player/home ${homeN}/${total}`, msg);
      pushStatusLog('player/home', msg, 'WARN');
    }
  }

  async function emitMatch(bundle: P5eMatchBundle) {
    const key = bundleEmitKey(bundle);
    const existing = emitInFlight.get(key);
    if (existing) {
      await existing;
      return;
    }

    const task = (async () => {
      if (bundle.incomplete) {
        const missing = [
          !bundle.userInfo ? MISSING_API_LABEL.userInfo : null,
          !bundle.eloInfo ? MISSING_API_LABEL.eloInfo : null,
          !bundle.mapExt ? MISSING_API_LABEL.mapExt : null,
        ].filter(Boolean);
        pushStatusLog(
          '采集',
          `接口不完整（${3 - missing.length}/3），仍尝试生成：缺 ${missing.join('、')}`,
          'WARN',
        );
      }

      const enriched = await enrichBundleForMatch(bundle);
      logHomeEnrichGap(enriched);
      const record = createP5eMatchRecord(enriched);
      onMatch(record);
      pushMatchLogEntry(record);
      captureProgress.value = null;
    })();

    emitInFlight.set(key, task);
    try {
      await task;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushStatusLog('匹配 enrich', formatP5eHomeEnrichError(message), 'ERROR');
      lastError.value = formatP5eHomeEnrichError(message);
    } finally {
      emitInFlight.delete(key);
    }
  }

  let lastProgressCollected = 0;
  let lastWsCovKey = '';

  const matchSession = new P5eMatchSession({
    onMatch: (bundle) => {
      void emitMatch(bundle);
    },
    onProgress: (progress) => {
      captureProgress.value = progress;
      if (progress.gameId) {
        const coverage = progress.coverage;
        const userCov = coverage?.userInfo;
        const eloCov = coverage?.eloInfo;
        const mapCov = coverage?.mapExt;
        const covKey = `${userCov?.covered ?? 0}-${eloCov?.covered ?? 0}-${mapCov?.covered ?? 0}-${progress.readyCount ?? 0}`;
        if (covKey !== lastWsCovKey) {
          lastWsCovKey = covKey;
          pushStatusLog(
            'WS 定锚',
            `对局 ${progress.gameId.slice(0, 24)}… · 接受 ${progress.readyCount ?? 0}/${progress.playerTotal ?? 10} · user ${userCov?.covered ?? 0}/${userCov?.total ?? 10} · elo ${eloCov?.covered ?? 0}/${eloCov?.total ?? 10} · map ${mapCov?.covered ?? 0}/${mapCov?.total ?? 10}`,
            'INFO',
          );
        }
      }
      if (progress.collected <= lastProgressCollected) return;
      lastProgressCollected = progress.collected;
      if (progress.missing.length) {
        const labels = progress.missing.map((k) => MISSING_API_LABEL[k]).join('、');
        pushStatusLog('采集', `已捕获 ${progress.collected}/${progress.total}，等待 ${labels}`, 'INFO');
      }
    },
  });

  const fixtureAggregator = new P5eMatchAggregator();

  let unlistenEvent: (() => void) | null = null;
  let unlistenStatus: (() => void) | null = null;

  function clearDisconnectTimer() {
    if (disconnectTimer !== null) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    disconnectSince = null;
  }

  function handleCdpPhase(phase: P5eCdpStatus['phase']) {
    if (phase === 'collecting' || phase === 'cdpReady') {
      clearDisconnectTimer();
      return;
    }

    if (phase === 'needsRelaunch' || autoRecovering.value) {
      clearDisconnectTimer();
      return;
    }

    if (phase === 'reconnecting' || phase === 'error') {
      if (disconnectSince === null) disconnectSince = Date.now();
      if (disconnectTimer === null) {
        disconnectTimer = setTimeout(() => {
          pushStatusLog(
            '5E 连接',
            '5E CDP 连接不稳定，若持续出现请重启 5E；已捕获的数据仍会尝试生成',
            'WARN',
          );
        }, DISCONNECT_WARN_MS);
      }
      return;
    }

    if (phase === 'stopped') {
      clearDisconnectTimer();
    }
  }

  async function recoverP5eAfterUpdate(clientRoot?: string) {
    autoRecovering.value = true;
    pushStatusLog(
      '5E 连接',
      '检测到 5E 可能已更新并重启，正在重新连接…',
      'WARN',
    );
    try {
      status.value = await stop5eCdpCollector();
      const launch = await launch5eWithCdp({ clientRoot });
      const gateError = getP5eLaunchCollectError(launch);
      if (gateError) throw new Error(gateError);

      status.value = await start5eCdpCollector({
        port: launch.port,
        clientRoot: launch.clientRoot,
      });
      autoRecoverAttempts += 1;
      appLaunchedSession = true;
      intentionalStop = false;
      pushStatusLog('5E 连接', '已重新连接，继续等待对局', 'INFO');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError.value = message;
      appLaunchedSession = false;
      pushStatusLog(
        '5E 连接',
        '5E 更新后调试连接已断开，请重新启动 5E',
        'ERROR',
      );
      options?.onClientExit?.();
    } finally {
      autoRecovering.value = false;
    }
  }

  function handleNeedsRelaunch(next: P5eCdpStatus) {
    if (shouldPromptManualP5eRelaunch({
      needsRelaunch: next.needsRelaunch,
      autoRecoverAttempts,
      intentionalStop,
      alreadyPrompted: manualRelaunchPrompted,
    })) {
      manualRelaunchPrompted = true;
      pushStatusLog(
        '5E 连接',
        '5E 更新后调试连接已断开，请重新启动 5E',
        'ERROR',
      );
      appLaunchedSession = false;
      options?.onClientExit?.();
      return;
    }

    if (!shouldTriggerP5eAutoRecover({
      needsRelaunch: next.needsRelaunch,
      appLaunchedSession,
      autoRecovering: autoRecovering.value,
      autoRecoverAttempts,
      intentionalStop,
    })) {
      return;
    }

    if (recoverInFlight) return;
    recoverInFlight = recoverP5eAfterUpdate(next.clientRoot).finally(() => {
      recoverInFlight = null;
    });
  }

  function handleClientExit(status: P5eCdpStatus) {
    if (!status.clientExited || !appLaunchedSession || intentionalStop) return;
    appLaunchedSession = false;
    captureProgress.value = null;
    pushStatusLog('5E 连接', '5E 已关闭，请重新启动', 'WARN');
    options?.onClientExit?.();
  }

  function handleEvent(raw: P5eCdpEvent) {
    if (isP5eWsEvent(raw)) {
      pushWsLogEntry(raw);
      if (raw.kind === 'ws_frame') {
        matchSession.ingestWs(raw);
      }
      return;
    }
    if (!isP5eHttpEvent(raw)) return;
    const event = sanitizeP5eHttpEvent(raw);
    if (!event) return;
    pushLogEntry(event);
    if (classifyP5eUrl(event.url)) {
      matchSession.ingestHttp(event);
    }
  }

  async function setGateDebugMode(enabled: boolean) {
    try {
      const next = await set5eCdpGateDebugMode(enabled);
      status.value = next;
      gateDebugMode.value = Boolean(next.gateDebugMode);
    } catch (err) {
      lastError.value = String(err);
      throw err;
    }
  }

  async function setWsDebugMode(enabled: boolean) {
    try {
      const next = await set5eCdpWsDebugMode(enabled);
      status.value = next;
      wsDebugMode.value = Boolean(next.wsDebugMode);
      pushStatusLog('WS 调试', enabled ? '已开启 Comet WebSocket 采集' : '已关闭', 'INFO');
    } catch (err) {
      lastError.value = String(err);
      throw err;
    }
  }

  async function simulateFixture(mapName?: string) {
    if (!import.meta.env.DEV) {
      lastError.value = '模拟数据仅在开发环境可用';
      return null;
    }

    lastError.value = null;
    try {
      const { loadP5eDevFixture } = await import('@platforms/5e/fixtures/load-dev-fixture');
      const fixture = loadP5eDevFixture();
      const bundle = fixtureAggregator.ingestFixtureEvents(fixture.events);
      if (!bundle) {
        lastError.value = 'fixture 数据不完整';
        return null;
      }
      if (typeof fixture.matchCode === 'string') bundle.matchCode = fixture.matchCode;
      if (mapName) bundle.mapName = mapName;
      const enriched = await enrichBundleForMatch(bundle);
      logHomeEnrichGap(enriched);
      const record = createP5eMatchRecord(enriched);
      onMatch(record);
      pushMatchLogEntry(record);
      return record;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError.value = formatP5eHomeEnrichError(message);
      pushStatusLog('模拟匹配', lastError.value, 'ERROR');
      return null;
    }
  }

  function replayNdjson(text: string): P5eMatchBundle[] {
    for (const line of text.split('\n')) {
      const event = parseP5eNdjsonLine(line);
      if (event?.kind === 'http') pushLogEntry(event);
    }
    return fixtureAggregator.ingestNdjson(text);
  }

  async function startCollect(options?: { port?: number; clientRoot?: string }) {
    lastError.value = null;
    try {
      status.value = await start5eCdpCollector(options);
    } catch (err) {
      lastError.value = String(err);
      throw err;
    }
  }

  async function launchAndCollect(options?: { clientRoot?: string }) {
    const clientRoot = options?.clientRoot;
    const probe = await probe5eEnvironment({ clientRoot });
    pushStatusLog('探测', probe.message, probe.externalRunning ? 'WARN' : 'INFO');
    if (!probe.installed) {
      throw new Error('NOT_INSTALLED_5E');
    }

    lastError.value = null;
    const launch = await launch5eWithCdp({ clientRoot: probe.clientRoot ?? clientRoot });
    pushStatusLog('启动', launch.message);

    const gateError = getP5eLaunchCollectError(launch);
    if (gateError) {
      if (gateError !== 'EXTERNAL_5E_RUNNING') {
        pushStatusLog('启动', gateError, 'ERROR');
      }
      throw new Error(gateError);
    }

    pushStatusLog('采集', `开始连接端口 ${launch.port}`);
    try {
      status.value = await start5eCdpCollector({
        port: launch.port,
        clientRoot: launch.clientRoot,
      });
      pushStatusLog('采集', `采集器已启动，端口 ${launch.port}`);
      appLaunchedSession = true;
      intentionalStop = false;
      autoRecoverAttempts = 0;
      manualRelaunchPrompted = false;
    } catch (err) {
      const msg = String(err);
      pushStatusLog('采集', msg, 'ERROR');
      throw err;
    }
    return launch;
  }

  async function stopCollect() {
    intentionalStop = true;
    appLaunchedSession = false;
    try {
      status.value = await stop5eCdpCollector();
    } catch (err) {
      lastError.value = String(err);
    }
  }

  async function refreshStatus() {
    try {
      status.value = await get5eCdpStatus();
      gateDebugMode.value = Boolean(status.value.gateDebugMode);
      wsDebugMode.value = Boolean(status.value.wsDebugMode);
    } catch {
      // ignore when backend unavailable
    }
  }

  let listenersReady = false;

  async function ensureReady() {
    if (listenersReady) return;
    listenersReady = true;
    unlistenEvent = await on5eCdpEvent(handleEvent);
    unlistenStatus = await on5eCdpStatus((s) => {
      status.value = s;
      gateDebugMode.value = Boolean(s.gateDebugMode);
      wsDebugMode.value = Boolean(s.wsDebugMode);
      handleCdpPhase(s.phase);
      handleNeedsRelaunch(s);
      handleClientExit(s);
      if (s.lastError && !s.clientExited) {
        pushStatusLog('状态', s.lastError, 'ERROR');
      }
    });
    await refreshStatus();
    gateDebugMode.value = Boolean(status.value.gateDebugMode);
    wsDebugMode.value = Boolean(status.value.wsDebugMode);
    if (!gateDebugMode.value) {
      try {
        await setGateDebugMode(true);
      } catch {
        // backend may be unavailable in dev web preview
      }
    }
    if (!wsDebugMode.value) {
      try {
        await setWsDebugMode(true);
      } catch {
        // backend may be unavailable in dev web preview
      }
    }
  }

  if (autoInit) {
    void ensureReady();
  }

  onUnmounted(() => {
    clearDisconnectTimer();
    unlistenEvent?.();
    unlistenStatus?.();
  });

  return {
    status,
    lastError,
    gateDebugMode,
    wsDebugMode,
    autoRecovering,
    captureProgress,
    setGateDebugMode,
    setWsDebugMode,
    logEntries,
    clearLogEntries,
    ensureReady,
    startCollect,
    launchAndCollect,
    stopCollect,
    refreshStatus,
    simulateFixture,
    replayNdjson,
  };
}
