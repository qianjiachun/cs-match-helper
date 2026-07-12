import type { MatchRecord } from '@core/match/models';
import { buildAiAnalysisRequest, parseAiAnalysisResult } from '@core/ai/prompt';
import {
  addTokenUsage,
  buildP5eMapSupplementRequest,
  hasP5eMapReady,
  mergeAiMapSupplement,
  parseP5eMapSupplementResult,
  resolveP5eMapName,
  type AiTokenUsageBreakdown,
} from '@core/ai/p5e-map-supplement';
import { extractPartialAiResult, mergePartialResult } from '@core/ai/stream-parse';
import {
  getMissingApiKeyMessage,
  isAiAnalysisActive,
  type AiAnalysisResult,
  type AiAnalysisStatus,
  type AiSettingsPublic,
  type AiTokenUsage,
  type SaveAiSettingsInput,
} from '@core/ai/types';
import type { AiHistoryStatus, MatchHistoryViewModel } from '@core/match/history';
import { onUnmounted, ref, shallowRef } from 'vue';
import {
  cancelAiAnalysis,
  loadAiSettings,
  onAiAnalysisDelta,
  onAiAnalysisDone,
  onAiAnalysisError,
  onAiAnalysisStart,
  saveAiSettings,
  startAiAnalysis,
} from '../native';

export type AiAnalysisPhase = 'base' | 'map-supplement' | null;

export interface AiAnalysisSettledPayload {
  matchId: string;
  status: AiHistoryStatus;
  result: AiAnalysisResult | null;
  usage: AiTokenUsage | null;
  elapsedMs: number | null;
  error: string | null;
  model?: string;
  providerMode?: string;
  analyzedAt: number;
}

function isP5eRecord(record: MatchRecord): boolean {
  return record.platformId === '5e' || record.detail.platformId === '5e';
}

export function useAiAnalysis(options?: {
  autoInit?: boolean;
  onAnalysisSettled?: (payload: AiAnalysisSettledPayload) => void;
}) {
  const autoInit = options?.autoInit ?? true;
  const onAnalysisSettled = options?.onAnalysisSettled;
  const settings = ref<AiSettingsPublic | null>(null);
  const status = ref<AiAnalysisStatus>('idle');
  const activeMatchId = ref<string | null>(null);
  const streamingText = ref('');
  const result = shallowRef<AiAnalysisResult | null>(null);
  const usage = ref<AiTokenUsage | null>(null);
  const usageBreakdown = ref<AiTokenUsageBreakdown | null>(null);
  const elapsedMs = ref<number | null>(null);
  const error = ref<string | null>(null);
  const startedAt = ref<number | null>(null);
  const analysisPhase = ref<AiAnalysisPhase>(null);
  const supplementedMap = ref<string | null>(null);
  const pendingMapSupplementRecord = ref<MatchRecord | null>(null);

  let baseResultSnapshot: AiAnalysisResult | null = null;
  let baseElapsedMsSnapshot = 0;

  const unlisteners: Array<() => void> = [];
  let settingsLoadPromise: Promise<void> | null = null;
  let listenersReady = false;
  let listenersPromise: Promise<void> | null = null;

  async function refreshSettings() {
    try {
      settings.value = await loadAiSettings();
    } catch (e) {
      settings.value = null;
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function ensureSettingsLoaded() {
    if (settings.value) return;
    if (!settingsLoadPromise) {
      settingsLoadPromise = refreshSettings().then(() => undefined);
    }
    await settingsLoadPromise;
  }

  async function saveSettings(input: SaveAiSettingsInput) {
    const saved = await saveAiSettings(input);
    settings.value = saved;
    return saved;
  }

  function resetSupplementState() {
    analysisPhase.value = null;
    usageBreakdown.value = null;
    supplementedMap.value = null;
    pendingMapSupplementRecord.value = null;
    baseResultSnapshot = null;
    baseElapsedMsSnapshot = 0;
  }

  function resetForMatch(matchId: string, options?: { keepResult?: boolean }) {
    activeMatchId.value = matchId;
    status.value = 'loading';
    streamingText.value = '';
    if (!options?.keepResult) {
      result.value = null;
    }
    usage.value = null;
    elapsedMs.value = null;
    error.value = null;
    startedAt.value = null;
    if (!options?.keepResult) {
      resetSupplementState();
    }
  }

  function emitSettled(matchId: string, settledStatus: AiHistoryStatus, settledError?: string) {
    onAnalysisSettled?.({
      matchId,
      status: settledStatus,
      result: settledStatus === 'done' ? result.value : null,
      usage: usage.value,
      elapsedMs: elapsedMs.value,
      error: settledError ?? error.value,
      model: settings.value?.model,
      providerMode: settings.value?.providerMode,
      analyzedAt: Date.now(),
    });
  }

  function shouldAwaitLiveMapSupplement(record: MatchRecord, force: boolean): boolean {
    return !force && isP5eRecord(record) && !hasP5eMapReady(record);
  }

  async function runMapSupplement(record: MatchRecord) {
    const mapName = resolveP5eMapName(record);
    if (!mapName || !isP5eRecord(record)) return;
    if (supplementedMap.value === mapName) return;
    if (!result.value) return;

    baseResultSnapshot = result.value;
    baseElapsedMsSnapshot = elapsedMs.value ?? 0;
    if (usage.value) {
      usageBreakdown.value = { base: { ...usage.value }, mapSupplement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    }

    analysisPhase.value = 'map-supplement';
    status.value = 'loading';
    streamingText.value = '';
    error.value = null;
    supplementedMap.value = mapName;

    try {
      await cancelAiAnalysis();
      const request = buildP5eMapSupplementRequest(record, baseResultSnapshot);
      await startAiAnalysis(request);
    } catch (e) {
      analysisPhase.value = null;
      supplementedMap.value = null;
      status.value = 'error';
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  function queueMapSupplementIfReady(record: MatchRecord) {
    if (!isP5eRecord(record) || !hasP5eMapReady(record)) return;
    const mapName = resolveP5eMapName(record)!;
    if (supplementedMap.value === mapName) return;
    if (!result.value) return;

    if (status.value === 'loading' || status.value === 'streaming') {
      pendingMapSupplementRecord.value = record;
      return;
    }

    if (status.value === 'done') {
      void runMapSupplement(record);
    }
  }

  async function ensureAnalysisListeners() {
    if (listenersReady) return;
    if (!listenersPromise) {
      listenersPromise = (async () => {
        const [onStart, onDelta, onDone, onError] = await Promise.all([
          onAiAnalysisStart((evt) => {
            if (activeMatchId.value && evt.matchId !== activeMatchId.value) return;
            status.value = 'streaming';
            startedAt.value = evt.startedAt;
            if (analysisPhase.value !== 'map-supplement') {
              streamingText.value = '';
            }
            error.value = null;
          }),
          onAiAnalysisDelta((evt) => {
            if (activeMatchId.value && evt.matchId !== activeMatchId.value) return;
            if (analysisPhase.value === 'map-supplement') {
              status.value = 'streaming';
              streamingText.value = evt.fullText;
              return;
            }
            status.value = 'streaming';
            streamingText.value = evt.fullText;
            const full = parseAiAnalysisResult(evt.fullText);
            if (full) {
              result.value = full;
            } else {
              const partial = extractPartialAiResult(evt.fullText);
              if (partial) {
                result.value = mergePartialResult(result.value, partial);
              }
            }
          }),
          onAiAnalysisDone((evt) => {
            if (activeMatchId.value && evt.matchId !== activeMatchId.value) return;

            if (analysisPhase.value === 'map-supplement') {
              const delta = parseP5eMapSupplementResult(evt.fullText);
              if (!delta || !baseResultSnapshot) {
                status.value = 'error';
                error.value = '地图补充结果无法解析，请重试';
                analysisPhase.value = null;
                emitSettled(evt.matchId, 'error', '地图补充结果无法解析，请重试');
                return;
              }
              result.value = mergeAiMapSupplement(baseResultSnapshot, delta);
              const mapUsage = evt.usage;
              if (usageBreakdown.value?.base && mapUsage) {
                usageBreakdown.value = {
                  base: usageBreakdown.value.base,
                  mapSupplement: mapUsage,
                };
                usage.value = addTokenUsage(usageBreakdown.value.base, mapUsage);
              } else {
                usage.value = addTokenUsage(usage.value, mapUsage);
              }
              elapsedMs.value = baseElapsedMsSnapshot + evt.elapsedMs;
              status.value = 'done';
              streamingText.value = evt.fullText;
              analysisPhase.value = null;
              emitSettled(evt.matchId, 'done');
              return;
            }

            status.value = 'done';
            streamingText.value = evt.fullText;
            usage.value = evt.usage;
            elapsedMs.value = evt.elapsedMs;
            result.value = parseAiAnalysisResult(evt.fullText);
            if (!result.value) {
              status.value = 'error';
              error.value = 'AI 返回格式无法解析，请重试';
              emitSettled(evt.matchId, 'error', 'AI 返回格式无法解析，请重试');
              return;
            }

            if (analysisPhase.value === 'base' && usage.value) {
              usageBreakdown.value = {
                base: { ...usage.value },
                mapSupplement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              };
            }

            const pending = pendingMapSupplementRecord.value;
            pendingMapSupplementRecord.value = null;
            if (pending && analysisPhase.value === 'base') {
              analysisPhase.value = null;
              void runMapSupplement(pending);
              return;
            }

            analysisPhase.value = null;
            emitSettled(evt.matchId, 'done');
          }),
          onAiAnalysisError((evt) => {
            if (activeMatchId.value && evt.matchId !== activeMatchId.value) return;
            status.value = 'error';
            error.value = evt.error;
            if (analysisPhase.value === 'map-supplement') {
              supplementedMap.value = null;
            }
            analysisPhase.value = null;
            emitSettled(evt.matchId, 'error', evt.error);
          }),
        ]);
        unlisteners.push(onStart, onDelta, onDone, onError);
        listenersReady = true;
      })();
    }
    await listenersPromise;
  }

  async function analyzeMatch(record: MatchRecord, force = false) {
    if (
      !force &&
      activeMatchId.value === record.id &&
      (status.value === 'loading' || status.value === 'streaming' || status.value === 'done')
    ) {
      return;
    }

    await ensureSettingsLoaded();
    await ensureAnalysisListeners();

    if (!isAiAnalysisActive(settings.value)) {
      if (force && settings.value?.analysisEnabled && !settings.value?.hasApiKey) {
        status.value = 'no-key';
        error.value = getMissingApiKeyMessage(settings.value?.providerMode);
        return;
      }
      status.value = 'idle';
      error.value = null;
      return;
    }

    resetForMatch(record.id);
    analysisPhase.value = shouldAwaitLiveMapSupplement(record, force) ? 'base' : null;
    if (force || hasP5eMapReady(record)) {
      const mapName = resolveP5eMapName(record);
      if (mapName) supplementedMap.value = mapName;
    }

    try {
      await cancelAiAnalysis();
      const request = buildAiAnalysisRequest(record);
      await startAiAnalysis(request);
    } catch (e) {
      status.value = 'error';
      error.value = e instanceof Error ? e.message : String(e);
      analysisPhase.value = null;
    }
  }

  async function supplementMapAnalysis(record: MatchRecord) {
    if (!isP5eRecord(record)) return;
    if (!hasP5eMapReady(record)) return;
    if (activeMatchId.value && activeMatchId.value !== record.id) return;

    await ensureSettingsLoaded();
    await ensureAnalysisListeners();

    if (!isAiAnalysisActive(settings.value)) return;

    queueMapSupplementIfReady(record);
  }

  async function retry(record: MatchRecord) {
    await analyzeMatch(record, true);
  }

  async function stop() {
    await cancelAiAnalysis();
    if (status.value === 'loading' || status.value === 'streaming') {
      status.value = 'cancelled';
      analysisPhase.value = null;
      pendingMapSupplementRecord.value = null;
      if (activeMatchId.value) {
        emitSettled(activeMatchId.value, 'cancelled');
      }
    }
  }

  /** 调试注入：跳过 API 请求，直接展示 AI 分析 JSON */
  async function injectResult(matchId: string, raw: string): Promise<string | null> {
    const parsed = parseAiAnalysisResult(raw);
    if (!parsed) return 'AI 结果 JSON 无法解析，请检查格式';
    await cancelAiAnalysis();
    activeMatchId.value = matchId;
    status.value = 'done';
    streamingText.value = raw.trim();
    result.value = parsed;
    usage.value = null;
    usageBreakdown.value = null;
    elapsedMs.value = 0;
    error.value = null;
    startedAt.value = Date.now();
    analysisPhase.value = null;
    emitSettled(matchId, 'done');
    return null;
  }

  /** 从历史文档 AI section 回填展示态（不触发请求） */
  function hydrateFromHistory(
    matchId: string,
    historyAi: MatchHistoryViewModel['ai'],
  ) {
    const statusMap: Record<AiHistoryStatus, AiAnalysisStatus> = {
      none: 'idle',
      done: 'done',
      error: 'error',
      cancelled: 'cancelled',
    };
    activeMatchId.value = matchId;
    status.value = statusMap[historyAi.status] ?? 'idle';
    streamingText.value = '';
    result.value = historyAi.result;
    usage.value = historyAi.usage;
    usageBreakdown.value = null;
    elapsedMs.value = historyAi.elapsedMs;
    error.value = historyAi.error;
    startedAt.value = historyAi.analyzedAt ?? null;
    resetSupplementState();
  }

  async function ensureReady() {
    await ensureSettingsLoaded();
    await ensureAnalysisListeners();
  }

  if (autoInit) {
    void ensureReady();
  }

  onUnmounted(() => {
    unlisteners.forEach((fn) => fn());
    if (status.value === 'loading' || status.value === 'streaming') {
      void cancelAiAnalysis();
    }
  });

  return {
    settings,
    status,
    activeMatchId,
    streamingText,
    result,
    usage,
    usageBreakdown,
    elapsedMs,
    error,
    startedAt,
    analysisPhase,
    supplementedMap,
    ensureSettingsLoaded,
    ensureAnalysisListeners,
    ensureReady,
    refreshSettings,
    saveSettings,
    analyzeMatch,
    supplementMapAnalysis,
    retry,
    stop,
    injectResult,
    hydrateFromHistory,
  };
}
