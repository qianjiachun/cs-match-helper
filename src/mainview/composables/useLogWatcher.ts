import type { DebugLogEntry, LogLine } from '@core/log/types';
import type { MatchRecord } from '@core/match/models';
import type { WatcherStatus } from '@core/types';
import { getActivePlatform } from '@platforms/registry';
import { findLastMatchEventInLogLines, isLogLineWithinMaxAge, BOOTSTRAP_MATCH_MAX_AGE_MS } from '@platforms/perfect/log-parser';
import { homeDir } from '@tauri-apps/api/path';
import { onUnmounted, ref, shallowRef } from 'vue';
import { getLogStatus, onLogLine, onWatcherStatus, readLatestLogLines, startLogWatch, stopLogWatch } from '../native';
import { debugEnabled } from './useDebugUnlock';

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
  let unlistenLine: (() => void) | null = null;
  let unlistenStatus: (() => void) | null = null;
  let watching = false;

  function pushLogEntry(parsed: LogLine, isMatchEvent: boolean) {
    if (!debugEnabled.value) return;
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      parsed,
      isMatchEvent,
    };
    logEntries.value = [...logEntries.value, entry];
  }

  function clearLogEntries() {
    logEntries.value = [];
  }

  function pushMatchRecord(data: Record<string, unknown>, source: 'log' | 'debug', logLine?: LogLine) {
    const line: LogLine = logLine ?? {
      time: new Date().toLocaleString('zh-CN'),
      level: 'DEBUG',
      category: source === 'debug' ? 'manual' : 'log',
      decoded: JSON.stringify(data),
      raw: source === 'debug' ? '[debug] manual inject' : '',
    };

    const platform = getActivePlatform();
    const gameId = data.platform_game_id ?? data.platformGameId;
    const recordId =
      typeof gameId === 'string' && gameId
        ? gameId
        : `${source}-${Date.now()}`;

    const record = platform.createMatchRecord(recordId, line, data);
    matches.value = [record];
    return record;
  }

  function handleLogLine(raw: string) {
    const platform = getActivePlatform();
    const parsed = platform.parseLogLine(raw);
    const eventData = platform.extractMatchEvents(parsed.decoded);
    pushLogEntry(parsed, Boolean(eventData));
    if (!eventData) return;
    const record = pushMatchRecord(eventData, 'log', parsed);
    options?.onNewMatch?.(record);
  }

  function injectMatch(data: Record<string, unknown>) {
    pushMatchRecord(data, 'debug');
  }

  async function bootstrapLastMatchFromLog() {
    try {
      const platform = getActivePlatform();
      const logDir = platform.buildLogDir(await homeDir());
      const lines = await readLatestLogLines(logDir);
      const found = findLastMatchEventInLogLines(lines);
      if (!found) return;
      if (!isLogLineWithinMaxAge(found.logLine, BOOTSTRAP_MATCH_MAX_AGE_MS)) return;
      pushLogEntry(found.logLine, true);
      pushMatchRecord(found.data, 'log', found.logLine);
    } catch {
      // 日志目录不存在或尚无日志时静默忽略
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
      // ignore
    }

    watcher.value = {
      running: false,
      logPath: '',
      fileExists: false,
      fileSize: 0,
      linesReceived: 0,
    };
  }

  let listenersReady = false;

  async function ensureListeners() {
    if (listenersReady) return;
    listenersReady = true;
    unlistenLine = await onLogLine((payload) => {
      handleLogLine(payload.raw);
    });
    unlistenStatus = await onWatcherStatus((status) => {
      watcher.value = status;
    });
  }

  if (autoInit) {
    void ensureListeners();
  }

  onUnmounted(() => {
    unlistenLine?.();
    unlistenStatus?.();
    void stopWatching();
  });

  return {
    watcher,
    matches,
    logEntries,
    clearLogEntries,
    injectMatch,
    ensureListeners,
    startWatching,
    stopWatching,
  };
}
