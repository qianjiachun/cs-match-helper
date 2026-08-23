import type { MatchRecord } from '@core/match/models';
import { buildAiAnalysisRequest, parseAiAnalysisResult } from '@core/ai/prompt';
import {
  buildAiAnalysisContext,
  calibrateWinProbability,
  type AiAnalysisContext,
} from '@core/ai/analysis-v2';
import { extractPartialAiResult } from '@core/ai/stream-parse';
import { isPerfectAiAnalysisReady } from '@core/ai/perfect-readiness';
import {
  addTokenUsage,
  buildP5eMapSupplementRequest,
  hasP5eMapReady,
  mergeAiMapSupplement,
  parseP5eMapSupplementResult,
  resolveP5eMapName,
  type AiTokenUsageBreakdown,
} from '@core/ai/p5e-map-supplement';
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
  onAiAnalysisCancelled,
  onAiAnalysisStart,
  saveAiSettings,
  startAiAnalysis,
} from '../native';
import { currentLocale, i18n, localizeErrorMessage, type AppLocale } from '../i18n';

export type AiAnalysisPhase = 'base' | 'map-supplement' | null;

export interface AiAnalysisPreview {
  predictedWinner: 'A' | 'B' | 'Even' | 'Unknown';
  modelWinProbability: { A: number; B: number };
  winProbability: { A: number; B: number };
  confidence: number | null;
  dataCoverage: number;
  headline: string | null;
}

const STREAM_UPDATE_INTERVAL_MS = 80;

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
  locale: AppLocale;
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
  const activeJobId = ref<number | null>(null);
  const streamingText = ref('');
  const preview = shallowRef<AiAnalysisPreview | null>(null);
  const result = shallowRef<AiAnalysisResult | null>(null);
  const usage = ref<AiTokenUsage | null>(null);
  const usageBreakdown = ref<AiTokenUsageBreakdown | null>(null);
  const elapsedMs = ref<number | null>(null);
  const error = ref<string | null>(null);
  const startedAt = ref<number | null>(null);
  const analysisPhase = ref<AiAnalysisPhase>(null);
  const supplementedMap = ref<string | null>(null);
  const resultLocale = ref<AppLocale | null>(null);
  const pendingMapSupplementRecord = ref<MatchRecord | null>(null);

  let baseResultSnapshot: AiAnalysisResult | null = null;
  let activeAnalysisContext: AiAnalysisContext | null = null;
  let activeAnalysisLocale: AppLocale = currentLocale();
  let baseElapsedMsSnapshot = 0;

  const unlisteners: Array<() => void> = [];
  let settingsLoadPromise: Promise<void> | null = null;
  let listenersReady = false;
  let listenersPromise: Promise<void> | null = null;
  let pendingAutoFingerprint: string | null = null;
  let analysisRequestVersion = 0;
  let pendingStreamText: string | null = null;
  let streamUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStreamUpdateAt = 0;

  function normalizeProbability(raw: { A: number; B: number }): { A: number; B: number } {
    const a = Number.isFinite(raw.A) ? Math.max(0, raw.A) : 50;
    const b = Number.isFinite(raw.B) ? Math.max(0, raw.B) : 50;
    const total = a + b;
    if (total <= 0) return { A: 50, B: 50 };
    const normalizedA = Math.round((a / total) * 100);
    return { A: normalizedA, B: 100 - normalizedA };
  }

  function previewWinner(probability: { A: number; B: number }): AiAnalysisPreview['predictedWinner'] {
    if (Math.abs(probability.A - probability.B) <= 4) return 'Even';
    return probability.A > probability.B ? 'A' : 'B';
  }

  function applyStreamUpdate(fullText: string) {
    streamingText.value = fullText;
    lastStreamUpdateAt = Date.now();
    if (analysisPhase.value === 'map-supplement') return;

    const partial = extractPartialAiResult(fullText);
    const rawProbability = partial?.modelWinProbability ?? partial?.winProbability;
    if (!partial || !rawProbability) return;

    const dataCoverage = activeAnalysisContext?.dataCoverage ?? result.value?.dataCoverage ?? 0;
    const modelWinProbability = normalizeProbability(rawProbability);
    const winProbability = calibrateWinProbability(modelWinProbability, dataCoverage);
    const modelConfidence = partial.confidence;
    preview.value = {
      predictedWinner: previewWinner(winProbability),
      modelWinProbability,
      winProbability,
      confidence: modelConfidence == null
        ? null
        : Math.round(dataCoverage * 70 + Math.min(100, Math.max(0, modelConfidence)) * 0.3),
      dataCoverage,
      headline: partial.headline ?? preview.value?.headline ?? null,
    };
  }

  function scheduleStreamUpdate(fullText: string) {
    pendingStreamText = fullText;
    if (streamUpdateTimer) return;
    const elapsed = Date.now() - lastStreamUpdateAt;
    const delay = Math.max(0, STREAM_UPDATE_INTERVAL_MS - elapsed);
    streamUpdateTimer = setTimeout(() => {
      streamUpdateTimer = null;
      const nextText = pendingStreamText;
      pendingStreamText = null;
      if (nextText != null) applyStreamUpdate(nextText);
    }, delay);
  }

  function flushStreamUpdate(fullText?: string) {
    if (fullText != null) pendingStreamText = fullText;
    if (streamUpdateTimer) {
      clearTimeout(streamUpdateTimer);
      streamUpdateTimer = null;
    }
    const nextText = pendingStreamText;
    pendingStreamText = null;
    if (nextText != null) applyStreamUpdate(nextText);
  }

  function clearStreamState() {
    if (streamUpdateTimer) clearTimeout(streamUpdateTimer);
    streamUpdateTimer = null;
    pendingStreamText = null;
    lastStreamUpdateAt = 0;
    preview.value = null;
  }

  async function refreshSettings() {
    try {
      settings.value = await loadAiSettings();
    } catch (e) {
      settings.value = null;
      error.value = localizeErrorMessage(e);
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
    clearStreamState();
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
    resetSupplementState();
  }

  function emitSettled(matchId: string, settledStatus: AiHistoryStatus, settledError?: string) {
    onAnalysisSettled?.({
      matchId,
      status: settledStatus,
      result: result.value,
      usage: usage.value,
      elapsedMs: elapsedMs.value,
      error: settledError ?? error.value,
      model: settings.value?.model,
      providerMode: settings.value?.providerMode,
      analyzedAt: Date.now(),
      locale: activeAnalysisLocale,
    });
  }

  function shouldAwaitLiveMapSupplement(record: MatchRecord, force: boolean): boolean {
    return !force && isP5eRecord(record) && !hasP5eMapReady(record);
  }

  async function runMapSupplement(record: MatchRecord, viewerSteamId?: string | null) {
    const mapName = resolveP5eMapName(record);
    if (!mapName || !isP5eRecord(record)) return;
    if (supplementedMap.value === mapName) return;
    if (!result.value) return;
    activeAnalysisContext = buildAiAnalysisContext(record, viewerSteamId);

    baseResultSnapshot = result.value;
    baseElapsedMsSnapshot = elapsedMs.value ?? 0;
    if (usage.value) {
      usageBreakdown.value = { base: { ...usage.value }, mapSupplement: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    }

    analysisPhase.value = 'map-supplement';
    status.value = 'loading';
    clearStreamState();
    streamingText.value = '';
    error.value = null;
    supplementedMap.value = mapName;

    try {
      const request = buildP5eMapSupplementRequest(record, baseResultSnapshot, activeAnalysisLocale, viewerSteamId);
      await startAiAnalysis(request);
    } catch (e) {
      analysisPhase.value = null;
      supplementedMap.value = null;
      status.value = 'error';
      error.value = localizeErrorMessage(e);
    }
  }

  function queueMapSupplementIfReady(record: MatchRecord) {
    if (!isP5eRecord(record) || !hasP5eMapReady(record)) return;
    const mapName = resolveP5eMapName(record)!;
    if (supplementedMap.value === mapName) return;
    if (status.value === 'loading' || status.value === 'streaming') {
      pendingMapSupplementRecord.value = record;
      return;
    }

    if (!result.value) return;

    if (status.value === 'done') {
      void runMapSupplement(record);
    }
  }

  async function ensureAnalysisListeners() {
    if (listenersReady) return;
    if (!listenersPromise) {
      listenersPromise = (async () => {
        const [onStart, onDelta, onDone, onError, onCancelled] = await Promise.all([
          onAiAnalysisStart((evt) => {
            if (evt.matchId !== activeMatchId.value) return;
            activeJobId.value = typeof evt.jobId === 'number' ? evt.jobId : null;
            status.value = 'streaming';
            startedAt.value = evt.startedAt;
            if (analysisPhase.value !== 'map-supplement') {
              clearStreamState();
              streamingText.value = '';
            }
            error.value = null;
          }),
          onAiAnalysisDelta((evt) => {
            if (evt.matchId !== activeMatchId.value || (activeJobId.value != null && evt.jobId !== activeJobId.value)) return;
            status.value = 'streaming';
            scheduleStreamUpdate(evt.fullText);
          }),
          onAiAnalysisDone((evt) => {
            if (evt.matchId !== activeMatchId.value || (activeJobId.value != null && evt.jobId !== activeJobId.value)) return;
            flushStreamUpdate(evt.fullText);

            if (analysisPhase.value === 'map-supplement') {
              const delta = parseP5eMapSupplementResult(evt.fullText);
              if (!delta || !baseResultSnapshot) {
                status.value = 'error';
                error.value = i18n.global.t('aiErrors.mapSupplementParse');
                analysisPhase.value = null;
                emitSettled(evt.matchId, 'error', i18n.global.t('aiErrors.mapSupplementParse'));
                return;
              }
              result.value = mergeAiMapSupplement(
                baseResultSnapshot,
                delta,
                activeAnalysisContext ?? undefined,
              );
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
              preview.value = null;
              analysisPhase.value = null;
              emitSettled(evt.matchId, 'done');
              return;
            }

            usage.value = evt.usage;
            elapsedMs.value = evt.elapsedMs;
            const parsed = parseAiAnalysisResult(evt.fullText, activeAnalysisContext ?? undefined);
            if (!parsed) {
              preview.value = null;
              status.value = 'error';
              error.value = i18n.global.t('aiErrors.responseParse');
              emitSettled(evt.matchId, 'error', i18n.global.t('aiErrors.responseParse'));
              return;
            }
            result.value = parsed;
            preview.value = null;
            status.value = 'done';

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
            if (evt.matchId !== activeMatchId.value || (activeJobId.value != null && evt.jobId !== activeJobId.value)) return;
            flushStreamUpdate();
            preview.value = null;
            status.value = 'error';
            error.value = localizeErrorMessage(evt.error);
            if (analysisPhase.value === 'map-supplement') {
              supplementedMap.value = null;
            }
            analysisPhase.value = null;
            emitSettled(evt.matchId, 'error', evt.error);
          }),
          onAiAnalysisCancelled((evt) => {
            if (evt.matchId !== activeMatchId.value || (activeJobId.value != null && evt.jobId !== activeJobId.value)) return;
            flushStreamUpdate();
            preview.value = null;
            status.value = 'cancelled';
            elapsedMs.value = evt.elapsedMs;
            analysisPhase.value = null;
            pendingMapSupplementRecord.value = null;
            emitSettled(evt.matchId, 'cancelled');
          }),
        ]);
        unlisteners.push(onStart, onDelta, onDone, onError, onCancelled);
        listenersReady = true;
      })();
    }
    await listenersPromise;
  }

  async function analyzeMatch(record: MatchRecord, force = false, viewerSteamId?: string | null) {
    if (!isPerfectAiAnalysisReady(record)) return;
    const context = buildAiAnalysisContext(record, viewerSteamId);
    const fingerprint = context.inputFingerprint;
    if (
      !force &&
      (pendingAutoFingerprint === fingerprint
        || result.value?.inputFingerprint === fingerprint
        || (activeAnalysisContext?.inputFingerprint === fingerprint
          && (status.value === 'loading' || status.value === 'streaming')))
    ) {
      return;
    }

    const requestVersion = ++analysisRequestVersion;
    if (!force) pendingAutoFingerprint = fingerprint;

    try {
      await ensureSettingsLoaded();
      await ensureAnalysisListeners();
      if (requestVersion !== analysisRequestVersion || !isPerfectAiAnalysisReady(record)) return;

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

      const keepResult = activeMatchId.value === record.id && Boolean(result.value);
      resetForMatch(record.id, { keepResult });
      activeJobId.value = null;
      activeAnalysisContext = context;
      activeAnalysisLocale = currentLocale();
      resultLocale.value = activeAnalysisLocale;
      analysisPhase.value = shouldAwaitLiveMapSupplement(record, force) ? 'base' : null;
      if (force || hasP5eMapReady(record)) {
        const mapName = resolveP5eMapName(record);
        if (mapName) supplementedMap.value = mapName;
      }

      if (requestVersion !== analysisRequestVersion) return;
      const request = buildAiAnalysisRequest(record, activeAnalysisLocale, viewerSteamId);
      await startAiAnalysis(request);
    } catch (e) {
      if (requestVersion !== analysisRequestVersion) return;
      status.value = 'error';
      error.value = localizeErrorMessage(e);
      analysisPhase.value = null;
      if (activeMatchId.value === record.id) {
        emitSettled(record.id, 'error', error.value);
      }
    } finally {
      if (pendingAutoFingerprint === fingerprint) pendingAutoFingerprint = null;
    }
  }

  function prepareForMatch(record: MatchRecord, viewerSteamId?: string | null) {
    if (activeMatchId.value === record.id) return;
    analysisRequestVersion += 1;
    void cancelAiAnalysis();
    activeAnalysisContext = buildAiAnalysisContext(record, viewerSteamId);
    clearStreamState();
    activeMatchId.value = record.id;
    activeJobId.value = null;
    status.value = 'idle';
    streamingText.value = '';
    result.value = null;
    usage.value = null;
    elapsedMs.value = null;
    error.value = null;
    startedAt.value = null;
    resetSupplementState();
  }

  async function maybeAutoAnalyze(record: MatchRecord, viewerSteamId?: string | null) {
    prepareForMatch(record, viewerSteamId);
    await ensureSettingsLoaded();
    if (!settings.value?.autoAnalyze) return;
    await analyzeMatch(record, false, viewerSteamId);
  }

  async function supplementMapAnalysis(record: MatchRecord, _viewerSteamId?: string | null) {
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
    analysisRequestVersion += 1;
    pendingAutoFingerprint = null;
    flushStreamUpdate();
    preview.value = null;
    if (status.value === 'loading' || status.value === 'streaming') {
      await cancelAiAnalysis();
    }
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
  async function injectResult(record: MatchRecord, raw: string, viewerSteamId?: string | null): Promise<string | null> {
    const context = buildAiAnalysisContext(record, viewerSteamId);
    const parsed = parseAiAnalysisResult(raw, context);
    if (!parsed) return i18n.global.t('aiErrors.injectParse');
    if (status.value === 'loading' || status.value === 'streaming') {
      await cancelAiAnalysis();
    }
    activeAnalysisContext = context;
    activeMatchId.value = record.id;
    activeJobId.value = null;
    status.value = 'done';
    clearStreamState();
    streamingText.value = raw.trim();
    result.value = parsed;
    resultLocale.value = currentLocale();
    usage.value = null;
    usageBreakdown.value = null;
    elapsedMs.value = 0;
    error.value = null;
    startedAt.value = Date.now();
    analysisPhase.value = null;
    emitSettled(record.id, 'done');
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
    activeAnalysisContext = null;
    clearStreamState();
    status.value = statusMap[historyAi.status] ?? 'idle';
    streamingText.value = '';
    result.value = historyAi.result;
    resultLocale.value = historyAi.locale ?? null;
    usage.value = historyAi.usage;
    usageBreakdown.value = null;
    elapsedMs.value = historyAi.elapsedMs;
    error.value = historyAi.error ? localizeErrorMessage(historyAi.error) : null;
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
    clearStreamState();
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
    preview,
    result,
    usage,
    usageBreakdown,
    elapsedMs,
    error,
    startedAt,
    analysisPhase,
    supplementedMap,
    resultLocale,
    ensureSettingsLoaded,
    ensureAnalysisListeners,
    ensureReady,
    refreshSettings,
    saveSettings,
    analyzeMatch,
    maybeAutoAnalyze,
    prepareForMatch,
    supplementMapAnalysis,
    retry,
    stop,
    injectResult,
    hydrateFromHistory,
  };
}
