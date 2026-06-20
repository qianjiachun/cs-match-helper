import type { DebugLogEntry } from '@core/log/types';
import type { MatchRecord } from '@core/match/models';
import { P5eMatchAggregator } from '@platforms/5e/aggregator';
import { classifyP5eUrl, parseP5eNdjsonLine, sanitizeP5eHttpEvent } from '@platforms/5e/events';
import { enrichP5eBundleWithLiveMap } from '@platforms/5e/match-api';
import { createP5eMatchRecord } from '@platforms/5e/match-parser';
import type { P5eCdpStatus, P5eHttpEvent, P5eMatchBundle } from '@platforms/5e/types';
import {
  get5eCdpStatus,
  launch5eWithCdp,
  on5eCdpEvent,
  on5eCdpStatus,
  probe5eEnvironment,
  start5eCdpCollector,
  stop5eCdpCollector,
} from '@core/platform/5e';
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';

const MAX_P5E_DEBUG_LOG_ENTRIES = 500;

const API_KIND_LABEL: Record<string, string> = {
  userInfo: '用户信息',
  eloInfo: 'Elo 批量',
  mapExt: '地图扩展',
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

export function useP5eCdp(onMatch: (record: MatchRecord) => void) {
  const status = ref<P5eCdpStatus>({
    running: false,
    port: 9222,
    phase: 'idle',
    eventsEmitted: 0,
  });

  const lastError = ref<string | null>(null);
  const logEntries = shallowRef<DebugLogEntry[]>([]);
  const emitInFlight = new Map<string, Promise<void>>();

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

  function pushLogEntry(event: P5eHttpEvent, isMatchEvent = false) {
    const apiKind = classifyP5eUrl(event.url);
    const category = apiKind ? (API_KIND_LABEL[apiKind] ?? apiKind) : '5E HTTP';
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      parsed: {
        time: event.capturedAt,
        level: 'DEBUG',
        category,
        decoded: JSON.stringify(
          {
            url: event.url,
            method: event.method,
            requestBody: event.requestBody,
            responseBody: event.responseBody,
          },
          null,
          2,
        ),
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
    return [...bundle.uuids].sort().join('|');
  }

  async function emitMatch(bundle: P5eMatchBundle) {
    const key = bundleEmitKey(bundle);
    const existing = emitInFlight.get(key);
    if (existing) {
      await existing;
      return;
    }

    const task = (async () => {
      const enriched = await enrichP5eBundleWithLiveMap(bundle);
      const record = createP5eMatchRecord(enriched);
      onMatch(record);
      pushMatchLogEntry(record);
    })();

    emitInFlight.set(key, task);
    try {
      await task;
    } finally {
      emitInFlight.delete(key);
    }
  }

  const aggregator = new P5eMatchAggregator({
    onMatch: (bundle) => {
      void emitMatch(bundle);
    },
  });

  let unlistenEvent: (() => void) | null = null;
  let unlistenStatus: (() => void) | null = null;

  function handleEvent(raw: P5eHttpEvent) {
    const event = sanitizeP5eHttpEvent(raw);
    if (!event) return;
    pushLogEntry(event);
    aggregator.ingest(event);
  }

  async function simulateFixture(mapName?: string) {
    if (!import.meta.env.DEV) {
      lastError.value = '模拟数据仅在开发环境可用';
      return null;
    }

    const { loadP5eDevFixture } = await import('@platforms/5e/fixtures/load-dev-fixture');
    const fixture = loadP5eDevFixture();
    const bundle = aggregator.ingestFixtureEvents(fixture.events);
    if (!bundle) {
      lastError.value = 'fixture 数据不完整';
      return null;
    }
    if (typeof fixture.matchCode === 'string') bundle.matchCode = fixture.matchCode;
    if (mapName) bundle.mapName = mapName;
    const enriched = await enrichP5eBundleWithLiveMap(bundle);
    const record = createP5eMatchRecord(enriched);
    onMatch(record);
    pushMatchLogEntry(record);
    return record;
  }

  function replayNdjson(text: string): P5eMatchBundle[] {
    for (const line of text.split('\n')) {
      const event = parseP5eNdjsonLine(line);
      if (event?.kind === 'http') pushLogEntry(event);
    }
    return aggregator.ingestNdjson(text);
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
    if (probe.externalRunning) {
      throw new Error('EXTERNAL_5E_RUNNING');
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
    } catch (err) {
      const msg = String(err);
      pushStatusLog('采集', msg, 'ERROR');
      throw err;
    }
    return launch;
  }

  async function stopCollect() {
    try {
      status.value = await stop5eCdpCollector();
    } catch (err) {
      lastError.value = String(err);
    }
  }

  async function refreshStatus() {
    try {
      status.value = await get5eCdpStatus();
    } catch {
      // ignore when backend unavailable
    }
  }

  onMounted(async () => {
    unlistenEvent = await on5eCdpEvent(handleEvent);
    unlistenStatus = await on5eCdpStatus((s) => {
      status.value = s;
      if (s.lastError) {
        pushStatusLog('状态', s.lastError, 'ERROR');
      }
    });
    await refreshStatus();
  });

  onUnmounted(() => {
    unlistenEvent?.();
    unlistenStatus?.();
  });

  return {
    status,
    lastError,
    logEntries,
    clearLogEntries,
    startCollect,
    launchAndCollect,
    stopCollect,
    refreshStatus,
    simulateFixture,
    replayNdjson,
  };
}
