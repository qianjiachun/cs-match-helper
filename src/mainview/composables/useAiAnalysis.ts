import type { MatchRecord } from '@core/match/models';
import { buildAiAnalysisRequest, parseAiAnalysisResult } from '@core/ai/prompt';
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

export function useAiAnalysis(options?: { autoInit?: boolean }) {
  const autoInit = options?.autoInit ?? true;
  const settings = ref<AiSettingsPublic | null>(null);
  const status = ref<AiAnalysisStatus>('idle');
  const activeMatchId = ref<string | null>(null);
  const streamingText = ref('');
  const result = shallowRef<AiAnalysisResult | null>(null);
  const usage = ref<AiTokenUsage | null>(null);
  const elapsedMs = ref<number | null>(null);
  const error = ref<string | null>(null);
  const startedAt = ref<number | null>(null);

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

  function resetForMatch(matchId: string) {
    activeMatchId.value = matchId;
    status.value = 'loading';
    streamingText.value = '';
    result.value = null;
    usage.value = null;
    elapsedMs.value = null;
    error.value = null;
    startedAt.value = null;
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
            streamingText.value = '';
            error.value = null;
          }),
          onAiAnalysisDelta((evt) => {
            if (activeMatchId.value && evt.matchId !== activeMatchId.value) return;
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
            status.value = 'done';
            streamingText.value = evt.fullText;
            usage.value = evt.usage;
            elapsedMs.value = evt.elapsedMs;
            result.value = parseAiAnalysisResult(evt.fullText);
            if (!result.value) {
              status.value = 'error';
              error.value = 'AI 返回格式无法解析，请重试';
            }
          }),
          onAiAnalysisError((evt) => {
            if (activeMatchId.value && evt.matchId !== activeMatchId.value) return;
            status.value = 'error';
            error.value = evt.error;
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

    try {
      await cancelAiAnalysis();
      const request = buildAiAnalysisRequest(record);
      await startAiAnalysis(request);
    } catch (e) {
      status.value = 'error';
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function retry(record: MatchRecord) {
    await analyzeMatch(record, true);
  }

  async function stop() {
    await cancelAiAnalysis();
    if (status.value === 'loading' || status.value === 'streaming') {
      status.value = 'cancelled';
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
    elapsedMs.value = 0;
    error.value = null;
    startedAt.value = Date.now();
    return null;
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
    void cancelAiAnalysis();
  });

  return {
    settings,
    status,
    activeMatchId,
    streamingText,
    result,
    usage,
    elapsedMs,
    error,
    startedAt,
    ensureSettingsLoaded,
    ensureAnalysisListeners,
    ensureReady,
    refreshSettings,
    saveSettings,
    analyzeMatch,
    retry,
    stop,
    injectResult,
  };
}
