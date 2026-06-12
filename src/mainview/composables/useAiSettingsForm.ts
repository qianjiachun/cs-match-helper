import { AI_MODEL_OPTIONS, type SaveAiSettingsInput } from '@core/ai/types';
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
  const apiKeyInput = ref('');
  const baseUrl = ref('https://api.deepseek.com');
  const model = ref('deepseek-v4-flash');
  const thinkingEnabled = ref(false);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveSeq = 0;
  let hasInitialSynced = false;
  const formReady = ref(false);

  const hasConfiguredKey = computed(
    () => Boolean(apiKeyInput.value.trim() || ai.settings.value?.hasApiKey),
  );

  function applySettingsToForm() {
    const s = ai.settings.value;
    if (!s) return;
    syncingFromServer.value = true;
    analysisEnabled.value = s.analysisEnabled;
    apiKeyInput.value = s.apiKey ?? '';
    baseUrl.value = s.baseUrl;
    model.value = s.model;
    thinkingEnabled.value = s.thinkingEnabled;
    syncingFromServer.value = false;
    hasInitialSynced = true;
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
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrl.value.trim(),
      model: model.value,
      thinkingEnabled: thinkingEnabled.value,
      reasoningEffort: ai.settings.value?.reasoningEffort ?? 'medium',
      autoAnalyze: ai.settings.value?.autoAnalyze ?? true,
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
    saving,
    saveMessage,
    settingsPath,
    showKey,
    analysisEnabled,
    apiKeyInput,
    baseUrl,
    model,
    thinkingEnabled,
    maskedHint,
    statusText,
    isSaveSuccess,
    isSaveError,
    hasConfiguredKey,
    flushSave,
    init,
    cleanup,
  };
}
