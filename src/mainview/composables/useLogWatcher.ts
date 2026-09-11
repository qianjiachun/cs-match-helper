import type { DebugLogEntry, LogLine } from '@core/log/types';
import type { MatchRecord, PerfectPlayerLoadState } from '@core/match/models';
import type { WatcherStatus } from '@core/types';
import { getActivePlatform } from '@platforms/registry';
import {
  extractPerfectMatchEvent,
  findLatestPerfectSessionInLogLines,
  parseLogLineTime,
} from '@platforms/perfect/log-parser';
import { fetchPerfectPlayerStatsDetailed, getCachedPerfectBoardId, resolvePerfectBoardUser } from '@platforms/perfect/player-api';
import {
  PerfectMatchSession,
  snapshotPerfectMatchRecord,
  type PerfectSessionUpdate,
} from '@platforms/perfect/session';
import { homeDir } from '@tauri-apps/api/path';
import { onUnmounted, ref, shallowRef } from 'vue';
import { getLogStatus, onLogLine, onWatcherStatus, readLatestLogLines, startLogWatch, stopLogWatch } from '../native';
import { debugEnabled } from './useDebugUnlock';
import { currentLocale } from '../i18n';

export function useLogWatcher(options?: { autoInit?: boolean; onNewMatch?: (record: MatchRecord) => void }) {
  const autoInit = options?.autoInit ?? true;
  const watcher = ref<WatcherStatus>({
    running: false,
    logPath: '',
    fileExists: false,
    fileSize: 0,
    linesReceived: 0,
  });

  const matches = shallowRef<MatchRecord[]>([]);
  const logEntries = shallowRef<DebugLogEntry[]>([]);
  const session = new PerfectMatchSession();
  let unlistenLine: (() => void) | null = null;
  let unlistenStatus: (() => void) | null = null;
  let watching = false;
  let expiryTimer: number | null = null;

  function publish(record: MatchRecord | null) {
    matches.value = record ? [snapshotPerfectMatchRecord(record)] : [];
  }

  function scheduleSessionExpiry() {
    if (expiryTimer != null) window.clearTimeout(expiryTimer);
    expiryTimer = null;
    if (!session.current || session.current.detail.perfectSessionPhase === 'assigned') return;
    if (session.clearIfExpired()) {
      publish(null);
      return;
    }
    const token = session.token;
    expiryTimer = window.setTimeout(() => {
      if (session.token === token && session.clearIfExpired()) publish(null);
      expiryTimer = null;
    }, 2 * 60 * 1000 + 100);
  }

  function pushLogEntry(parsed: LogLine, isMatchEvent: boolean) {
    if (!debugEnabled.value) return;
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toLocaleTimeString(currentLocale(), { hour12: false }),
      parsed,
      isMatchEvent,
    };
    logEntries.value = [...logEntries.value, entry];
  }

  function clearLogEntries() {
    logEntries.value = [];
  }

  function pushPerfectApiLog(
    steamId: string,
    status: 'requesting' | 'success' | 'partial_failure' | 'error',
    detail?: unknown,
  ) {
    if (!debugEnabled.value) return;
    const decoded = JSON.stringify({
      steamId,
      status,
      endpoints: ['overview', 'season-stats'],
      ...(status === 'error' ? { error: detail } : detail ? { result: detail } : {}),
    }, null, 2);
    pushLogEntry({
      time: new Date().toLocaleString(currentLocale()),
      level: status === 'error' ? 'ERROR' : status === 'partial_failure' ? 'WARN' : 'INFO',
      category: 'perfect-api',
      decoded,
      raw: decoded,
    }, false);
  }

  function schedulePlayerEnrichment(steamId: string, token: number): Promise<void> {
    pushPerfectApiLog(steamId, 'requesting');
    session.setStatsLoading(steamId);
    const cachedBoardId = getCachedPerfectBoardId(steamId);
    session.patchPlayer(steamId, {
      ...(cachedBoardId ? { platformBoardId: cachedBoardId } : {}),
      perfectLoadState: {
        ...session.current?.detail.unassigned.find((player) => player.steamId === steamId)?.perfectLoadState!,
        stats: 'loading',
        boardIdentity: cachedBoardId ? 'loaded' : 'loading',
        internalComments: 'loading',
        platformComments: cachedBoardId ? 'loading' : 'idle',
      },
    });
    publish(session.current);

    const requests: Promise<unknown>[] = [];
    requests.push(fetchPerfectPlayerStatsDetailed(steamId).then(({ raw, stats }) => {
      pushPerfectApiLog(
        steamId,
        stats.partialFailure ? 'partial_failure' : 'success',
        { response: raw, normalized: stats },
      );
      if (session.token !== token) return;
      session.setStats(steamId, stats);
      publish(session.current);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      pushPerfectApiLog(steamId, 'error', message);
      if (session.token !== token) return;
      session.setStatsError(steamId, message);
      publish(session.current);
    }));

    if (!cachedBoardId) {
      requests.push(resolvePerfectBoardUser(steamId).then((user) => {
        if (session.token !== token) return;
        const player = session.current
          ? [...session.current.detail.unassigned, ...session.current.detail.teams.flatMap((team) => team.players)]
            .find((item) => item.steamId === steamId)
          : undefined;
        session.patchPlayer(steamId, {
          platformBoardId: user?.wanmeiId,
          nickname: user?.name ?? player?.nickname ?? `Steam ...${steamId.slice(-6)}`,
          avatar: user?.avatar ?? player?.avatar,
          perfectLoadState: {
            ...player?.perfectLoadState!,
            boardIdentity: 'loaded',
            platformComments: user ? 'loading' : 'loaded',
          },
        });
        publish(session.current);
      }).catch((error: unknown) => {
        if (session.token !== token) return;
        const player = session.current
          ? [...session.current.detail.unassigned, ...session.current.detail.teams.flatMap((team) => team.players)]
            .find((item) => item.steamId === steamId)
          : undefined;
        session.patchPlayer(steamId, {
          perfectLoadState: {
            ...player?.perfectLoadState!,
            boardIdentity: 'error',
            platformComments: 'error',
            boardIdentityError: error instanceof Error ? error.message : String(error),
          },
        });
        publish(session.current);
      }));
    }

    return Promise.all(requests).then(() => undefined);
  }

  function playerIdsForEnrichment(update: PerfectSessionUpdate): string[] {
    if (!update.record) return [];
    if (update.record.detail.source === 'ladder-events') return update.newPlayerIds;
    if (update.record.detail.source !== 'legacy-create-game' || !update.newSession) return [];
    return [
      ...update.record.detail.unassigned,
      ...update.record.detail.teams.flatMap((team) => team.players),
    ].map((player) => player.steamId);
  }

  function scheduleUpdatePlayerEnrichment(update: PerfectSessionUpdate) {
    const token = session.token;
    for (const steamId of new Set(playerIdsForEnrichment(update))) {
      void schedulePlayerEnrichment(steamId, token);
    }
  }

  function processParsedLine(parsed: LogLine, replay = false) {
    const event = extractPerfectMatchEvent(parsed.decoded);
    pushLogEntry(parsed, Boolean(event));
    if (!event) return;
    const eventTime = parseLogLineTime(parsed.time)?.getTime() ?? Date.now();
    const update = session.apply(event, parsed, eventTime);
    publish(update.record);
    scheduleSessionExpiry();
    if (update.newSession && update.record && !replay) options?.onNewMatch?.(update.record);
    scheduleUpdatePlayerEnrichment(update);
  }

  function handleLogLine(raw: string) {
    processParsedLine(getActivePlatform().parseLogLine(raw));
  }

  function injectMatch(data: Record<string, unknown>) {
    const line: LogLine = {
      time: new Date().toLocaleString(currentLocale()),
      level: 'DEBUG',
      category: 'manual',
      decoded: JSON.stringify(data),
      raw: '[debug] manual inject',
    };
    const update = session.apply({ kind: 'legacy-create-game', data }, line);
    publish(update.record);
    if (getActivePlatform().id === 'perfect') scheduleUpdatePlayerEnrichment(update);
  }

  async function replayPerfectFixture() {
    const { default: logFixture } = await import('@platforms/perfect/fixtures/perfect-9220102482485790732-log.json');
    const enrichmentTasks = new Map<string, Promise<void>>();
    let previousDelay = 0;
    let readyCount = 0;
    for (const item of logFixture.events) {
      const parsed = getActivePlatform().parseLogLine(item.raw);
      const event = extractPerfectMatchEvent(parsed.decoded);
      if (!event) continue;
      const scaledDelay = Math.min(900, Math.max(45, (item.delayMs - previousDelay) * 0.08));
      const waitMs = event.kind === 'ready' && readyCount === 0
        ? Math.max(420, scaledDelay)
        : scaledDelay;
      previousDelay = item.delayMs;
      await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      const update = session.apply(event, parsed, Date.now());
      publish(update.record);
      if (update.newSession && update.record) options?.onNewMatch?.(update.record);
      if (event.kind === 'ready') readyCount += 1;
      for (const steamId of update.newPlayerIds) {
        if (!enrichmentTasks.has(steamId)) {
          enrichmentTasks.set(steamId, schedulePlayerEnrichment(steamId, session.token));
        }
      }
    }
    await Promise.all(enrichmentTasks.values());
  }

  function patchPlayerLoadState(steamId: string, patch: Partial<PerfectPlayerLoadState>) {
    const player = session.current
      ? [...session.current.detail.unassigned, ...session.current.detail.teams.flatMap((team) => team.players)]
        .find((value) => value.steamId === steamId)
      : undefined;
    if (!player?.perfectLoadState) return;
    session.patchPlayer(steamId, {
      perfectLoadState: { ...player.perfectLoadState, ...patch },
    });
    publish(session.current);
  }

  async function bootstrapLastMatchFromLog() {
    try {
      const platform = getActivePlatform();
      const logDir = platform.buildLogDir(await homeDir());
      const lines = await readLatestLogLines(logDir);
      for (const { event, logLine } of findLatestPerfectSessionInLogLines(lines)) {
        pushLogEntry(logLine, true);
        const eventTime = parseLogLineTime(logLine.time)?.getTime() ?? Date.now();
        const update = session.apply(event, logLine, eventTime);
        publish(update.record);
        scheduleUpdatePlayerEnrichment(update);
      }
      scheduleSessionExpiry();
    } catch {
      // Missing logs are expected before the Perfect client has been opened.
    }
  }

  async function startWatching() {
    if (watching) return;
    await ensureListeners();
    watching = true;
    await startLogWatch();
    await bootstrapLastMatchFromLog();
    watcher.value = await getLogStatus();
  }

  async function stopWatching() {
    if (!watching) return;
    watching = false;
    try {
      await stopLogWatch();
    } catch {
      // Ignore shutdown races.
    }
    watcher.value = { running: false, logPath: '', fileExists: false, fileSize: 0, linesReceived: 0 };
  }

  let listenersReady = false;
  async function ensureListeners() {
    if (listenersReady) return;
    listenersReady = true;
    unlistenLine = await onLogLine((payload) => handleLogLine(payload.raw));
    unlistenStatus = await onWatcherStatus((status) => { watcher.value = status; });
  }

  if (autoInit) void ensureListeners();

  onUnmounted(() => {
    unlistenLine?.();
    unlistenStatus?.();
    if (expiryTimer != null) window.clearTimeout(expiryTimer);
    void stopWatching();
  });

  return { watcher, matches, logEntries, clearLogEntries, injectMatch, replayPerfectFixture, patchPlayerLoadState, ensureListeners, startWatching, stopWatching };
}
