<script setup lang="ts">
import {
  DEEPSEEK_API_KEYS_URL,
  formatModelBudgetHint,
  getApiKeyLabel,
  resolveModelOption,
  type AiProviderMode,
} from '@core/ai/types';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Plug,
  Sparkles,
  Zap,
} from 'lucide-vue-next';
import { computed, toRef } from 'vue';
import DeepSeekIcon from '../DeepSeekIcon.vue';
import type { useAiAnalysis } from '../../composables/useAiAnalysis';
import { useAiSettingsForm } from '../../composables/useAiSettingsForm';
import { openExternalUrl } from '../../native';
import SettingsCard from './SettingsCard.vue';
import SettingsToggle from './SettingsToggle.vue';
import { localize as l } from '../../i18n';

const props = defineProps<{
  ai: ReturnType<typeof useAiAnalysis>;
  settingsVisible?: boolean;
}>();

const {
  AI_MODEL_OPTIONS,
  AI_PROVIDER_OPTIONS,
  analysisEnabled,
  providerMode,
  isDeepSeekMode,
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
  selectProviderMode,
  flushSave,
} = useAiSettingsForm(props.ai, toRef(props, 'settingsVisible'));

const apiKeyLabel = computed(() => getApiKeyLabel(providerMode.value));

const selectedModelOption = computed(() => resolveModelOption(model.value));

function providerCardClass(mode: AiProviderMode) {
  const selected = providerMode.value === mode;
  if (mode === 'deepseek' && selected) {
    return 'border-[#5686FE]/35 bg-[#5686FE]/5 ring-1 ring-[#5686FE]/20 shadow-sm';
  }
  return selected
    ? 'border-accent bg-accent/5 ring-1 ring-accent/25 shadow-sm'
    : 'border-border bg-surface hover:border-accent/35 hover:bg-elevated/50';
}

function providerIconBoxClass(mode: AiProviderMode) {
  const selected = providerMode.value === mode;
  if (mode === 'deepseek') {
    return selected ? 'bg-[#5686FE]/12' : 'bg-elevated';
  }
  return selected ? 'bg-accent/15 text-accent' : 'bg-elevated text-fg-muted';
}
</script>

<template>
  <div class="space-y-5">
    <SettingsCard
      :title="l('AI 分析', 'AI analysis')"
      :description="l('选择 DeepSeek 预设或 OpenAI 兼容服务，开启赛前智能预测', 'Choose DeepSeek or an OpenAI-compatible provider for pre-match analysis.')"
      :icon="Sparkles"
    >
      <SettingsToggle
        v-model="analysisEnabled"
        :label="l('启用 AI 分析', 'Enable AI analysis')"
        :description="
          hasConfiguredKey
            ? l('关闭后不会调用 API，也不会自动分析', 'When disabled, the app will not call the API or analyze matches automatically.')
            : l('请先填写 API Key 后才能启用', 'Add an API key before enabling analysis.')
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
          <span class="font-semibold">{{ l('API Key 未填写', 'API key required') }}</span>
          {{ l(`— 请先在下方的「${apiKeyLabel}」输入框中粘贴 Key，才能启用 AI 分析。`, `Add your key in the “${apiKeyLabel}” field below to enable AI analysis.`) }}
        </p>
      </div>

      <!-- 服务模式 -->
      <div class="space-y-2">
        <p class="text-[12px] font-medium text-fg-secondary">{{ l('服务模式', 'Provider') }}</p>
        <div
          class="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          :aria-label="l('AI 服务模式', 'AI provider')"
        >
          <button
            v-for="opt in AI_PROVIDER_OPTIONS"
            :key="opt.value"
            type="button"
            role="radio"
            class="relative flex cursor-pointer flex-col rounded-xl border px-4 py-3.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            :class="providerCardClass(opt.value)"
            :aria-checked="providerMode === opt.value"
            @click="selectProviderMode(opt.value)"
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200"
                :class="providerIconBoxClass(opt.value)"
              >
                <DeepSeekIcon
                  v-if="opt.value === 'deepseek'"
                  size="sm"
                  :muted="providerMode !== opt.value"
                />
                <Plug v-else class="h-4 w-4" aria-hidden="true" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-semibold text-fg">{{ opt.value === 'deepseek' ? l('DeepSeek 预设', 'DeepSeek preset') : l('OpenAI 兼容', 'OpenAI-compatible') }}</span>
                  <span
                    v-if="opt.value === 'deepseek'"
                    class="rounded-full bg-[#5686FE]/10 px-2 py-0.5 text-[10px] font-medium text-[#5686FE]"
                  >
                    {{ l('推荐', 'Recommended') }}
                  </span>
                </div>
                <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
                  {{ opt.value === 'deepseek' ? l('官方 API，含模型选择与思考模式', 'Official API with model selection and reasoning mode') : l('自定义模型', 'Custom model and endpoint') }}
                </p>
              </div>
              <Check
                v-if="providerMode === opt.value"
                class="h-4 w-4 shrink-0 text-accent"
                aria-hidden="true"
              />
            </div>
          </button>
        </div>
      </div>

      <!-- API Key -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label
            class="text-[12px] font-medium"
            :class="hasConfiguredKey ? 'text-fg-secondary' : 'font-semibold text-amber-800'"
            for="ai-api-key"
          >
            {{ apiKeyLabel }}
            <span v-if="!hasConfiguredKey" class="ml-1 text-warning">*</span>
          </label>
          <a
            v-if="isDeepSeekMode"
            href="#"
            class="inline-flex cursor-pointer items-center gap-1 text-[11px] text-accent transition-colors duration-200 hover:text-accent-hover hover:underline"
            @click.prevent="openExternalUrl(DEEPSEEK_API_KEYS_URL)"
          >
            {{ l('前往获取', 'Get a key') }}
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
            :aria-label="showKey ? l('隐藏 API Key', 'Hide API key') : l('显示 API Key', 'Show API key')"
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
        <!-- DeepSeek 预设区 -->
        <template v-if="isDeepSeekMode">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <label class="text-[12px] font-medium text-fg-secondary" for="ai-model">
                {{ l('模型', 'Model') }}
              </label>
              <span v-if="selectedModelOption" class="text-[11px] text-fg-muted">
                {{ l(`当前约 ${selectedModelOption.durationSec} 秒 · ${selectedModelOption.costLabel}/次`, `About ${selectedModelOption.durationSec}s · ${selectedModelOption.costLabel} per analysis`) }}
              </span>
            </div>
            <select
              id="ai-model"
              v-model="model"
              class="w-full cursor-pointer rounded-lg border border-border bg-base px-3.5 py-2.5 text-[13px] text-fg outline-none transition-colors duration-200 focus:border-accent focus:ring-2 focus:ring-accent/15"
            >
              <option v-for="opt in AI_MODEL_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.value === 'deepseek-v4-flash' ? l('DeepSeek V4 Flash（推荐，快速）', 'DeepSeek V4 Flash (recommended, fast)') : l('DeepSeek V4 Pro（更准确，较慢）', 'DeepSeek V4 Pro (more accurate, slower)') }} · {{ l(formatModelBudgetHint(opt), `about ${opt.durationSec}s · ${opt.costLabel} per analysis`) }}
              </option>
            </select>
          </div>

          <SettingsToggle
            v-model="thinkingEnabled"
            :label="l('启用思考模式', 'Enable reasoning mode')"
            :description="l('开启后模型会进行更深度的推理，耗时更长（仅 DeepSeek）', 'Uses deeper reasoning and takes longer. DeepSeek only.')"
          />
        </template>

        <!-- OpenAI 兼容自定义区 -->
        <template v-else>
          <div
            class="flex items-start gap-2 rounded-xl border border-border bg-elevated/40 px-3.5 py-3"
          >
            <Zap class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <p class="text-[11px] leading-relaxed text-fg-muted">
              {{ l('需兼容 OpenAI Chat Completions 接口、Bearer Token 和 SSE 流式。适用于 OpenAI、硅基流动、本地代理等。', 'Requires an OpenAI Chat Completions-compatible endpoint, Bearer token, and SSE streaming.') }}
            </p>
          </div>

          <div class="space-y-2">
            <label class="block text-[12px] font-medium text-fg-secondary" for="ai-base-url">
              API Base URL
            </label>
            <input
              id="ai-base-url"
              v-model="baseUrl"
              type="url"
              class="w-full rounded-lg border border-border bg-base px-3.5 py-2.5 font-mono text-[13px] text-fg outline-none transition-colors duration-200 focus:border-accent focus:ring-2 focus:ring-accent/15"
              placeholder="https://api.openai.com/v1"
              @blur="flushSave"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-[12px] font-medium text-fg-secondary" for="ai-custom-model">
              {{ l('模型名称', 'Model name') }}
            </label>
            <input
              id="ai-custom-model"
              v-model="model"
              type="text"
              class="w-full rounded-lg border border-border bg-base px-3.5 py-2.5 font-mono text-[13px] text-fg outline-none transition-colors duration-200 focus:border-accent focus:ring-2 focus:ring-accent/15"
              placeholder="gpt-4o-mini"
              spellcheck="false"
              @blur="flushSave"
            />
            <p class="text-[11px] text-fg-muted">{{ l('费用与耗时取决于你所选服务商', 'Cost and latency depend on your provider.') }}</p>
          </div>
        </template>
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
