import type { DebugLogEntry, LogLine } from '@core/log/types';
import type { MatchRecord } from '@core/match/models';
import type { WatcherStatus } from '@core/types';
import { getActivePlatform } from '@platforms/registry';
import { findLastMatchEventInLogLines, isLogLineWithinMaxAge, BOOTSTRAP_MATCH_MAX_AGE_MS } from '@platforms/perfect/log-parser';
import { homeDir } from '@tauri-apps/api/path';
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { getLogStatus, onLogLine, onWatcherStatus, readLatestLogLines, startLogWatch, stopLogWatch } from '../native';

const MAX_DEBUG_LOG_ENTRIES = 500;

export function useLogWatcher() {
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
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      parsed,
      isMatchEvent,
    };
    const next = [...logEntries.value, entry];
    logEntries.value =
      next.length > MAX_DEBUG_LOG_ENTRIES
        ? next.slice(next.length - MAX_DEBUG_LOG_ENTRIES)
        : next;
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
  }

  function handleLogLine(raw: string) {
    const platform = getActivePlatform();
    const parsed = platform.parseLogLine(raw);
    const eventData = platform.extractMatchEvents(parsed.decoded);
    pushLogEntry(parsed, Boolean(eventData));
    if (!eventData) return;
    pushMatchRecord(eventData, 'log', parsed);
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

  onMounted(async () => {
    unlistenLine = await onLogLine((payload) => {
      handleLogLine(payload.raw);
    });

    unlistenStatus = await onWatcherStatus((status) => {
      watcher.value = status;
    });
  });

  onUnmounted(() => {
    unlistenLine?.();
    unlistenStatus?.();
    void stopWatching();
  });

  return { watcher, matches, logEntries, clearLogEntries, injectMatch, startWatching, stopWatching };
}
