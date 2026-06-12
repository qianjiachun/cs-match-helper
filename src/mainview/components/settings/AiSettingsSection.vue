<script setup lang="ts">
import { formatModelBudgetHint } from '@core/ai/types';
import { AlertTriangle, ExternalLink, Eye, EyeOff, Sparkles } from 'lucide-vue-next';
import { computed, toRef } from 'vue';
import type { useAiAnalysis } from '../../composables/useAiAnalysis';
import { useAiSettingsForm } from '../../composables/useAiSettingsForm';
import { openExternalUrl } from '../../native';
import SettingsCard from './SettingsCard.vue';
import SettingsToggle from './SettingsToggle.vue';

const props = defineProps<{
  ai: ReturnType<typeof useAiAnalysis>;
  settingsVisible?: boolean;
}>();

const {
  AI_MODEL_OPTIONS,
  analysisEnabled,
  apiKeyInput,
  baseUrl,
  model,
  thinkingEnabled,
  showKey,
  maskedHint,
  statusText,
  isSaveError,
  isSaveSuccess,
  settingsPath,
  hasConfiguredKey,
  flushSave,
} = useAiSettingsForm(props.ai, toRef(props, 'settingsVisible'));

const selectedModelOption = computed(
  () => AI_MODEL_OPTIONS.find((opt) => opt.value === model.value) ?? AI_MODEL_OPTIONS[0],
);
</script>

<template>
  <div class="space-y-5">
    <SettingsCard
      title="AI 分析"
      description="配置 DeepSeek API，开启赛前智能预测"
      :icon="Sparkles"
    >
      <SettingsToggle
        v-model="analysisEnabled"
        label="启用 AI 分析"
        :description="
          hasConfiguredKey
            ? '关闭后不会调用 API，也不会自动分析'
            : '请先填写 API Key 后才能启用'
        "
        :disabled="!hasConfiguredKey"
      />

      <div
        v-if="!hasConfiguredKey"
        class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3"
        role="alert"
      >
        <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p class="text-[12px] leading-relaxed text-amber-900">
          <span class="font-semibold">API Key 未填写</span>
          — 请先在下方的「DeepSeek API Key」输入框中粘贴 Key，才能启用 AI 分析。
        </p>
      </div>

      <!-- API Key 始终可编辑，避免清空 Key 后因 analysisEnabled=false 导致无法重新输入 -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label
            class="text-[12px] font-medium"
            :class="hasConfiguredKey ? 'text-fg-secondary' : 'font-semibold text-amber-800'"
            for="ai-api-key"
          >
            DeepSeek API Key
            <span v-if="!hasConfiguredKey" class="ml-1 text-warning">*</span>
          </label>
          <a
            href="#"
            class="inline-flex cursor-pointer items-center gap-1 text-[11px] text-accent transition-colors duration-200 hover:text-accent-hover hover:underline"
            @click.prevent="openExternalUrl('https://platform.deepseek.com/api_keys')"
          >
            前往获取
            <ExternalLink class="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        </div>
        <div class="relative">
          <input
            id="ai-api-key"
            v-model="apiKeyInput"
            :type="showKey ? 'text' : 'password'"
            class="w-full rounded-lg border bg-base py-2.5 pl-3.5 pr-11 font-mono text-[13px] text-fg outline-none transition-colors duration-200 focus:ring-2"
            :class="
              hasConfiguredKey
                ? 'border-border focus:border-accent focus:ring-accent/15'
                : 'border-amber-300 ring-1 ring-amber-200/80 focus:border-warning focus:ring-warning/20'
            "
            placeholder="sk-..."
            autocomplete="off"
            spellcheck="false"
            @blur="flushSave"
          />
          <button
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
            :aria-label="showKey ? '隐藏 API Key' : '显示 API Key'"
            @click="showKey = !showKey"
          >
            <EyeOff v-if="showKey" class="h-4 w-4" />
            <Eye v-else class="h-4 w-4" />
          </button>
        </div>
        <p
          class="text-[11px]"
          :class="hasConfiguredKey ? 'text-fg-muted' : 'font-medium text-amber-700'"
        >
          {{ maskedHint }}
        </p>
      </div>

      <div
        class="space-y-4 transition-opacity duration-200"
        :class="analysisEnabled ? '' : 'pointer-events-none opacity-45'"
      >
        <div class="space-y-2">
          <label class="block text-[12px] font-medium text-fg-secondary" for="ai-base-url">
            API Base URL
          </label>
          <input
            id="ai-base-url"
            v-model="baseUrl"
            type="url"
            class="w-full rounded-lg border border-border bg-base px-3.5 py-2.5 text-[13px] text-fg outline-none transition-colors duration-200 focus:border-accent focus:ring-2 focus:ring-accent/15"
            @blur="flushSave"
          />
        </div>

        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <label class="text-[12px] font-medium text-fg-secondary" for="ai-model">
              模型
            </label>
            <span class="text-[11px] text-fg-muted">
              当前约 {{ selectedModelOption.durationSec }} 秒 · {{ selectedModelOption.costLabel }}/次
            </span>
          </div>
          <select
            id="ai-model"
            v-model="model"
            class="w-full cursor-pointer rounded-lg border border-border bg-base px-3.5 py-2.5 text-[13px] text-fg outline-none transition-colors duration-200 focus:border-accent focus:ring-2 focus:ring-accent/15"
          >
            <option v-for="opt in AI_MODEL_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }} · {{ formatModelBudgetHint(opt) }}
            </option>
          </select>
        </div>

        <SettingsToggle
          v-model="thinkingEnabled"
          label="启用思考模式"
          description="开启后模型会进行更深度的推理，耗时更长"
        />
      </div>
    </SettingsCard>

    <div
      class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-elevated/60 px-4 py-3"
    >
      <p
        class="text-[12px]"
        :class="isSaveError ? 'text-danger' : isSaveSuccess ? 'text-success' : 'text-fg-muted'"
      >
        {{ statusText }}
      </p>
      <p
        v-if="settingsPath"
        class="max-w-full truncate text-[11px] text-fg-muted"
        :title="settingsPath"
      >
        {{ settingsPath }}
      </p>
    </div>
  </div>
</template>
