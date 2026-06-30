import {
  AI_MODEL_OPTIONS,
  AI_PROVIDER_OPTIONS,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  isDeepSeekProvider,
  type AiProviderMode,
  type SaveAiSettingsInput,
} from '@core/ai/types';
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { getAiSettingsPath } from '../native';
import type { useAiAnalysis } from './useAiAnalysis';

export function useAiSettingsForm(
  ai: ReturnType<typeof useAiAnalysis>,
  visible?: Ref<boolean>,
) {
  const saving = ref(false);
  const saveMessage = ref('');
  const settingsPath = ref('');
  const showKey = ref(false);
  const syncingFromServer = ref(false);

  const analysisEnabled = ref(true);
  const providerMode = ref<AiProviderMode>('deepseek');
  const apiKeyInput = ref('');
  const baseUrl = ref(DEEPSEEK_DEFAULT_BASE_URL);
  const model = ref(DEEPSEEK_DEFAULT_MODEL);
  const thinkingEnabled = ref(false);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveSeq = 0;
  let hasInitialSynced = false;
  const formReady = ref(false);

  const isDeepSeekMode = computed(() => isDeepSeekProvider(providerMode.value));

  const hasConfiguredKey = computed(
    () => Boolean(apiKeyInput.value.trim() || ai.settings.value?.hasApiKey),
  );

  function applySettingsToForm() {
    const s = ai.settings.value;
    if (!s) return;
    syncingFromServer.value = true;
    analysisEnabled.value = s.analysisEnabled;
    providerMode.value = s.providerMode ?? 'deepseek';
    apiKeyInput.value = s.apiKey ?? '';
    baseUrl.value = s.baseUrl;
    model.value = s.model;
    thinkingEnabled.value = s.thinkingEnabled;
    syncingFromServer.value = false;
    hasInitialSynced = true;
  }

  function applyDeepSeekPreset() {
    baseUrl.value = DEEPSEEK_DEFAULT_BASE_URL;
    if (!AI_MODEL_OPTIONS.some((opt) => opt.value === model.value)) {
      model.value = DEEPSEEK_DEFAULT_MODEL;
    }
  }

  const maskedHint = computed(() => {
    if (!ai.settings.value?.hasApiKey) return '尚未配置 API Key';
    if (apiKeyInput.value.trim()) return 'Key 已填写，修改后将自动保存';
    const masked = ai.settings.value.apiKeyMasked;
    return masked ? `已保存：${masked}` : 'Key 已保存';
  });

  const statusText = computed(() => {
    if (saving.value) return '正在保存…';
    if (saveMessage.value) return saveMessage.value;
    return '修改后将自动保存';
  });

  const isSaveSuccess = computed(() => saveMessage.value === '已自动保存');
  const isSaveError = computed(
    () => saveMessage.value.includes('失败') || saveMessage.value.includes('错误'),
  );

  function buildInput(): SaveAiSettingsInput {
    return {
      analysisEnabled: analysisEnabled.value,
      providerMode: providerMode.value,
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrl.value.trim(),
      model: model.value.trim(),
      thinkingEnabled: thinkingEnabled.value,
    };
  }

  async function persistSettings() {
    const seq = ++saveSeq;
    saving.value = true;
    saveMessage.value = '';
    try {
      const saved = await ai.saveSettings(buildInput());
      if (seq !== saveSeq) return;
      syncingFromServer.value = true;
      analysisEnabled.value = saved.analysisEnabled;
      providerMode.value = saved.providerMode ?? 'deepseek';
      apiKeyInput.value = saved.apiKey ?? '';
      baseUrl.value = saved.baseUrl;
      model.value = saved.model;
      thinkingEnabled.value = saved.thinkingEnabled;
      syncingFromServer.value = false;
      saveMessage.value = '已自动保存';
      try {
        settingsPath.value = await getAiSettingsPath();
      } catch {
        // ignore
      }
    } catch (e) {
      if (seq !== saveSeq) return;
      saveMessage.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (seq === saveSeq) saving.value = false;
    }
  }

  function scheduleSave(delayMs = 500) {
    if (syncingFromServer.value) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistSettings();
    }, delayMs);
  }

  function flushSave() {
    if (syncingFromServer.value) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    void persistSettings();
  }

  function selectProviderMode(mode: AiProviderMode) {
    if (providerMode.value === mode) return;
    providerMode.value = mode;
    if (mode === 'deepseek') {
      applyDeepSeekPreset();
      flushSave();
      return;
    }
    flushSave();
  }

  watch([baseUrl, model], () => {
    if (!formReady.value) return;
    scheduleSave(400);
  });

  watch([analysisEnabled, thinkingEnabled], () => {
    if (!formReady.value) return;
    flushSave();
  });

  watch(apiKeyInput, () => {
    if (!formReady.value) return;
    if (!apiKeyInput.value.trim() && !ai.settings.value?.hasApiKey) {
      analysisEnabled.value = false;
    }
    scheduleSave(800);
  });

  if (visible) {
    watch(visible, (isVisible, wasVisible) => {
      if (wasVisible && !isVisible) flushSave();
    });
  }

  async function init() {
    if (!ai.settings.value) {
      await ai.refreshSettings();
    }
    if (!hasInitialSynced) {
      applySettingsToForm();
    }
    saveMessage.value = '';
    try {
      settingsPath.value = await getAiSettingsPath();
    } catch {
      settingsPath.value = '';
    }
    formReady.value = true;
  }

  function cleanup() {
    if (saveTimer) clearTimeout(saveTimer);
    flushSave();
  }

  onMounted(() => {
    void init();
  });

  onUnmounted(() => {
    cleanup();
  });

  return {
    AI_MODEL_OPTIONS,
    AI_PROVIDER_OPTIONS,
    saving,
    saveMessage,
    settingsPath,
    showKey,
    analysisEnabled,
    providerMode,
    isDeepSeekMode,
    apiKeyInput,
    baseUrl,
    model,
    thinkingEnabled,
    maskedHint,
    statusText,
    isSaveSuccess,
    isSaveError,
    hasConfiguredKey,
    selectProviderMode,
    flushSave,
    init,
    cleanup,
  };
}
