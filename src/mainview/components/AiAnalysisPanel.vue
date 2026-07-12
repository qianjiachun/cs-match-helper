<script setup lang="ts">
import {
  AlertTriangle,
  ArrowRight,
  KeyRound,
  RefreshCw,
  Shield,
  Swords,
  Target,
} from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AiLoadingAnimation from './AiLoadingAnimation.vue';
import AiSparklesIcon from './AiSparklesIcon.vue';
import {
  enrichPlayerNotes,
  formatPlayerRole,
  placeholderPlayerNotes,
} from '@core/ai/player-notes';
import {
  DEEPSEEK_API_KEYS_URL,
  getApiKeyLabel,
  getMissingApiKeyMessage,
  hasKnownModelPricing,
  isDeepSeekProvider,
} from '@core/ai/types';
import { estimateTokenCostCny, formatCostLabel, formatCostTooltip } from '@core/ai/pricing';
import type { AiFactorType, AiKeyFactor } from '@core/ai/types';
import type { MatchRecord } from '@core/match/models';
import type { useAiAnalysis } from '../composables/useAiAnalysis';
import { openExternalUrl } from '../native';
import PlayerAvatar from './PlayerAvatar.vue';

const props = defineProps<{
  match: MatchRecord;
  ai: ReturnType<typeof useAiAnalysis>;
  highlightedSide?: 'A' | 'B' | null;
  highlightedSteamId?: string | null;
  historyMode?: boolean;
}>();

const emit = defineEmits<{
  highlightSide: [side: 'A' | 'B' | null];
  highlightPlayer: [steamId: string | null];
  openSettings: [];
  analyze: [];
  stop: [];
}>();

const tick = ref(0);
let tickTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  tickTimer = setInterval(() => {
    if (props.ai.status.value === 'loading' || props.ai.status.value === 'streaming') {
      tick.value++;
    }
  }, 500);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});

type AiSetupState = 'active' | 'disabled' | 'no-key';

const setupState = computed((): AiSetupState => {
  const s = props.ai.settings.value;
  if (!s?.analysisEnabled) return 'disabled';
  if (!s.hasApiKey) return 'no-key';
  return 'active';
});

const isDeepSeekMode = computed(() =>
  isDeepSeekProvider(props.ai.settings.value?.providerMode),
);
const apiKeyLabel = computed(() => getApiKeyLabel(props.ai.settings.value?.providerMode));
const missingApiKeyMessage = computed(() =>
  getMissingApiKeyMessage(props.ai.settings.value?.providerMode),
);

const showSetupGuide = computed(() => setupState.value !== 'active');
const isDisabled = computed(() => showSetupGuide.value);
const isLoading = computed(
  () => props.ai.status.value === 'loading' || props.ai.status.value === 'streaming',
);
const isMapSupplementing = computed(() => props.ai.analysisPhase.value === 'map-supplement');
const isError = computed(() => props.ai.status.value === 'error');
const isNoKey = computed(() => props.ai.status.value === 'no-key');
const result = computed(() => props.ai.result.value);
const localInsights = computed(() => props.match.detail.insights);

const canRunHistoryAnalysis = computed(
  () => Boolean(props.historyMode) && setupState.value === 'active' && !isLoading.value,
);

const showHistoryAnalyzeCta = computed(
  () => canRunHistoryAnalysis.value && (!result.value || isError.value),
);

const showHistoryRerunCta = computed(
  () => canRunHistoryAnalysis.value && Boolean(result.value) && !isError.value,
);

const showHistoryEmptyState = computed(
  () => Boolean(props.historyMode) && showHistoryAnalyzeCta.value,
);

const showHistoryLoadingState = computed(
  () =>
    Boolean(props.historyMode) &&
    isLoading.value &&
    !result.value?.headline,
);

const winA = computed(() => result.value?.winProbability.A ?? 50);
const winB = computed(() => result.value?.winProbability.B ?? 50);

const localHeadline = computed(() => {
  const ins = localInsights.value;
  if (!ins?.strongerSide) return '双方数据接近，等待 AI 细化判断';
  return `本地初判：队伍 ${ins.strongerSide} 综合数据略优`;
});

const headline = computed(() => {
  if (isDisabled.value) {
    if (props.ai.settings.value?.analysisEnabled && !props.ai.settings.value?.hasApiKey) {
      return '请先在设置中填写 API Key 以启用 AI 分析';
    }
    return 'AI 分析已关闭，可在设置中开启';
  }
  if (result.value?.headline) return result.value.headline;
  if (isLoading.value) return `${localHeadline.value}，AI 正在校准…`;
  if (isNoKey.value) return missingApiKeyMessage.value;
  return '等待 AI 分析…';
});

const quickChips = computed(() => {
  if (result.value?.quickReasons?.length) {
    return result.value.quickReasons.slice(0, 3);
  }
  if (isLoading.value && localInsights.value?.highlights?.length) {
    return localInsights.value.highlights.slice(0, 2);
  }
  return [];
});

const stabilityText = computed(() => {
  if (!result.value) return null;
  const reason = result.value.stabilityReason;
  const pct = result.value.confidence;
  if (reason) return `数据把握 ${pct}% · ${reason}`;
  return `数据把握 ${pct}%`;
});

const elapsedLabel = computed(() => {
  void tick.value;
  if (props.ai.elapsedMs.value != null) {
    return `${(props.ai.elapsedMs.value / 1000).toFixed(1)}s`;
  }
  if (props.ai.startedAt.value) {
    const sec = Math.max(0, (Date.now() - props.ai.startedAt.value) / 1000);
    return `${sec.toFixed(1)}s`;
  }
  return '—';
});

const usageLabel = computed(() => {
  const u = props.ai.usage.value;
  if (!u) return isLoading.value ? '统计中…' : '—';
  const breakdown = props.ai.usageBreakdown.value;
  if (breakdown && breakdown.mapSupplement.totalTokens > 0) {
    return `输入 ${u.promptTokens} · 输出 ${u.completionTokens} · 合计 ${u.totalTokens}`;
  }
  return `输入 ${u.promptTokens} · 输出 ${u.completionTokens} · 合计 ${u.totalTokens}`;
});

const usageTooltip = computed(() => {
  const breakdown = props.ai.usageBreakdown.value;
  if (!breakdown || breakdown.mapSupplement.totalTokens <= 0) return '';
  const { base, mapSupplement } = breakdown;
  return `首轮 输入 ${base.promptTokens} · 输出 ${base.completionTokens} · 地图补充 输入 ${mapSupplement.promptTokens} · 输出 ${mapSupplement.completionTokens}`;
});

const costLabel = computed(() => {
  const u = props.ai.usage.value;
  const model = props.ai.settings.value?.model ?? 'deepseek-v4-flash';
  if (!u) return '';
  return formatCostLabel(model, u);
});

const costTooltip = computed(() => {
  const u = props.ai.usage.value;
  const model = props.ai.settings.value?.model ?? 'deepseek-v4-flash';
  if (!u) return '';
  const cost = hasKnownModelPricing(model) ? estimateTokenCostCny(model, u) : 0;
  return formatCostTooltip(model, u, cost);
});

const HIGHLIGHT_TYPES: AiFactorType[] = ['strength', 'form', 'map', 'party'];

function factorsByTypes(types: AiFactorType[], limit = 4): AiKeyFactor[] {
  if (!result.value?.keyFactors?.length) return [];
  return [...result.value.keyFactors]
    .filter((f) => types.includes(f.type))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, limit);
}

const highlightFactors = computed(() => factorsByTypes(HIGHLIGHT_TYPES, 4));

interface RiskDisplayItem {
  text: string;
  side?: 'A' | 'B' | 'Both';
  isFactor: boolean;
}

const riskDisplayItems = computed((): RiskDisplayItem[] => {
  const items: RiskDisplayItem[] = [];
  const seen = new Set<string>();

  for (const f of factorsByTypes(['risk'], 3)) {
    if (!seen.has(f.text)) {
      seen.add(f.text);
      items.push({ text: f.text, side: f.side, isFactor: true });
    }
  }

  const risks = result.value?.risks ?? [];
  for (const risk of risks) {
    if (!seen.has(risk)) {
      seen.add(risk);
      items.push({ text: risk, isFactor: false });
    }
  }

  if (!items.length && isLoading.value && localInsights.value?.risks?.length) {
    return localInsights.value.risks.slice(0, 2).map((text) => ({ text, isFactor: false }));
  }

  return items.slice(0, 4);
});

const displayPlayerNotes = computed(() => {
  if (result.value?.playerNotes?.length) {
    return enrichPlayerNotes(result.value.playerNotes, props.match);
  }
  if (isLoading.value) {
    return placeholderPlayerNotes(props.match);
  }
  return [];
});

const showPlayerSection = computed(() => displayPlayerNotes.value.length > 0);

function sideClass(side: 'A' | 'B' | 'Both') {
  if (side === 'A') return 'border-blue-200/80 bg-blue-50/60 text-blue-800';
  if (side === 'B') return 'border-orange-200/80 bg-orange-50/60 text-orange-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function onFactorClick(side: 'A' | 'B' | 'Both') {
  emit('highlightSide', side === 'Both' ? null : side);
}

function onPlayerNoteClick(steamId: string, side: 'A' | 'B', isPending?: boolean) {
  if (isPending) return;
  emit('highlightSide', side);
  emit('highlightPlayer', steamId);
}

</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-4">
    <!-- 未就绪：引导页 -->
    <div v-if="showSetupGuide" class="flex h-full flex-col items-center justify-center p-6">
      <!-- 缺少 API Key：高对比警示态 -->
      <div
        v-if="setupState === 'no-key'"
        class="w-full max-w-md rounded-2xl border-2 border-amber-300/90 bg-linear-to-b from-amber-50/90 to-white p-6 text-center shadow-[0_8px_24px_rgb(250_173_20/0.12)]"
      >
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 ring-4 ring-amber-100/60">
          <KeyRound class="h-7 w-7 text-warning" aria-hidden="true" />
        </div>
        <p class="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100/80 px-3 py-1 text-[11px] font-semibold text-amber-800">
          <AlertTriangle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          缺少必要配置
        </p>
        <h2 class="mb-3 text-[18px] font-bold text-slate-800">
          请先填写
          <span class="text-warning">API Key</span>
        </h2>
        <p class="mb-4 text-[13px] leading-relaxed text-slate-600">
          你已在设置中开启 AI 分析，但尚未填写
          <span class="font-semibold text-amber-800">{{ apiKeyLabel }}</span>。
          填写后即可使用赛前预测与维度分析。
        </p>
        <div class="mb-5 rounded-xl border border-amber-200/90 bg-white/80 px-4 py-3 text-left text-[12px] leading-relaxed text-slate-700">
          <p class="font-medium text-amber-900">在设置中找到「{{ apiKeyLabel }}」并粘贴你的 Key</p>
          <p v-if="isDeepSeekMode" class="mt-1.5 text-slate-500">
            还没有 Key？
            <a
              href="#"
              class="cursor-pointer font-medium text-accent transition-colors duration-200 hover:text-accent-hover hover:underline"
              @click.prevent="openExternalUrl(DEEPSEEK_API_KEYS_URL)"
            >
              前往 DeepSeek 获取 API Key
            </a>
          </p>
          <p v-else class="mt-1.5 text-slate-500">
            请向你所选服务商获取兼容 OpenAI 的 API Key。
          </p>
        </div>
        <button
          type="button"
          class="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-warning px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors duration-200 hover:brightness-95 hover:shadow-md"
          @click="emit('openSettings')"
        >
          去设置填写 API Key
          <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <!-- 未开启 AI 分析：柔和引导态 -->
      <div v-else class="max-w-sm p-4 text-center">
        <div class="mb-6 flex items-center justify-center">
          <div class="origin-center scale-[1.75]">
            <AiSparklesIcon badge size="md" static />
          </div>
        </div>
        <h2 class="mb-3 text-[18px] font-bold text-slate-800">未开启 AI 分析</h2>
        <p class="mb-6 text-[13px] leading-relaxed text-slate-500">
          开启后，匹配助手将根据双方数据进行胜负预测与维度分析。
        </p>
        <button
          type="button"
          class="group inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition-colors duration-200 hover:bg-accent-hover hover:shadow-md"
          @click="emit('openSettings')"
        >
          去设置中开启
          <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>

    <!-- 历史模式：尚无分析结果 -->
    <div
      v-else-if="showHistoryEmptyState"
      class="flex h-full min-h-[280px] flex-col items-center justify-center px-6 py-12"
    >
      <div class="flex w-full max-w-sm flex-col items-center text-center">
        <div class="mb-4 flex items-center justify-center">
          <div class="origin-center scale-[1.75]">
            <AiSparklesIcon size="md" static />
          </div>
        </div>

        <h2 class="text-[1rem] leading-6 font-semibold text-slate-900">
          {{ isError ? '分析未完成' : '本局暂无赛前分析' }}
        </h2>
        <p class="mt-1.5 text-sm leading-relaxed text-slate-500">
          {{
            isError
              ? '可重新生成，结果会写回本局历史'
              : '可按当时对局数据补跑，并保存至历史记录'
          }}
        </p>

        <p
          v-if="isError && ai.error.value"
          class="mt-4 flex w-full items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-[12px] leading-relaxed text-rose-700"
        >
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {{ ai.error.value }}
        </p>

        <button
          type="button"
          class="mt-6 w-full cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition-colors duration-200 hover:bg-accent-hover active:scale-[0.98]"
          @click="emit('analyze')"
        >
          {{ isError ? '重试' : '生成分析' }}
        </button>
      </div>
    </div>

    <!-- 历史模式：分析进行中（首包未到） -->
    <div
      v-else-if="showHistoryLoadingState"
      class="flex h-full min-h-[280px] flex-col items-center justify-center gap-5 px-6 py-10"
    >
      <AiLoadingAnimation />
      <button
        type="button"
        class="cursor-pointer rounded-lg px-4 py-2 text-[12px] font-medium text-slate-500 transition-[background-color,color] duration-200 hover:bg-slate-100 hover:text-slate-700"
        @click="emit('stop')"
      >
        停止分析
      </button>
    </div>

    <!-- 加载状态：首包未到时显示动画（非历史模式；地图补充时保留已有结论） -->
    <div
      v-else-if="isLoading && !result?.headline && !isMapSupplementing"
      class="flex h-full flex-col items-center justify-center"
    >
      <AiLoadingAnimation />
    </div>

    <div v-else class="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <p
        v-if="isMapSupplementing"
        class="rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-800"
      >
        地图已确认，正在补充分析…
      </p>
      <!-- 主结论卡 -->
      <section
        class="ai-hero-card overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm"
        data-match-reveal="compare"
      >
        <div class="space-y-3 px-5 py-4">
          <p
            class="text-[15px] font-semibold leading-relaxed text-slate-800"
            :class="isLoading && !result?.headline ? 'ai-pulse-text' : ''"
          >
            {{ headline }}
          </p>

          <div v-if="isLoading && !result?.winProbability" class="rounded-lg border border-dashed border-blue-200/80 bg-blue-50/40 px-3 py-2 text-[11px] text-blue-700">
            {{ localHeadline }}
          </div>

          <div v-if="result?.winProbability || isLoading" class="space-y-2">
            <div class="flex items-center gap-3">
              <span
                class="min-w-[72px] rounded-lg px-2.5 py-1 text-center text-[14px] font-black tabular-nums transition-all duration-300"
                :class="
                  highlightedSide === 'A'
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300'
                    : 'bg-blue-50 text-blue-600'
                "
              >
                A {{ winA }}%
              </span>
              <div class="flex h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                <div
                  class="h-full bg-linear-to-r from-blue-400 to-blue-500 transition-all duration-500 ease-out"
                  :style="{ width: `${winA}%` }"
                />
                <div
                  class="h-full bg-linear-to-l from-orange-400 to-orange-500 transition-all duration-500 ease-out"
                  :style="{ width: `${winB}%` }"
                />
              </div>
              <span
                class="min-w-[72px] rounded-lg px-2.5 py-1 text-center text-[14px] font-black tabular-nums transition-all duration-300"
                :class="
                  highlightedSide === 'B'
                    ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-300'
                    : 'bg-orange-50 text-orange-600'
                "
              >
                B {{ winB }}%
              </span>
            </div>
            <p class="text-center text-[10px] text-slate-400">赛前胜率预估，非对局结果</p>
          </div>

          <div v-if="quickChips.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="(chip, i) in quickChips"
              :key="'chip-' + i"
              class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600"
            >
              {{ chip }}
            </span>
          </div>

          <p v-if="stabilityText" class="text-[10px] leading-relaxed text-slate-400">
            {{ stabilityText }}
          </p>

          <p v-if="isError" class="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
            {{ ai.error.value }}
          </p>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50/80 px-5 py-2 text-[10px] text-slate-500">
          <span>耗时 {{ elapsedLabel }}</span>
          <span v-if="result?.dataQuality" class="text-slate-400">{{ result.dataQuality }}</span>
          <span class="flex items-center gap-2">
            <span :title="usageTooltip || undefined">Tokens · {{ usageLabel }}</span>
            <span
              v-if="costLabel"
              class="font-medium text-slate-600"
              :title="costTooltip"
            >
              {{ costLabel }}
            </span>
            <button
              v-if="showHistoryRerunCta"
              type="button"
              class="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-500 transition-[background-color,color] duration-200 hover:bg-slate-200/60 hover:text-slate-700"
              @click="emit('analyze')"
            >
              <RefreshCw class="h-2.5 w-2.5" aria-hidden="true" />
              重新分析
            </button>
            <button
              v-if="historyMode && isLoading"
              type="button"
              class="ml-1 cursor-pointer rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-500 transition-[background-color,color] duration-200 hover:bg-slate-200/60 hover:text-slate-700"
              @click="emit('stop')"
            >
              停止
            </button>
          </span>
        </div>
      </section>

      <!-- 双栏：看点 / 风险 -->
      <div class="grid gap-3 md:grid-cols-2">
        <section class="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm" data-match-reveal="compare">
          <div class="mb-2 flex items-center gap-1.5">
            <Swords class="h-3.5 w-3.5 text-blue-500" />
            <h3 class="text-[12px] font-bold text-slate-800">看点</h3>
          </div>
          <ul v-if="highlightFactors.length" class="space-y-1.5">
            <li
              v-for="(f, i) in highlightFactors"
              :key="'h-' + i"
              :class="f.type === 'map' && isMapSupplementing ? 'animate-pulse' : ''"
            >
              <button
                type="button"
                class="flex w-full cursor-pointer items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-relaxed transition-colors duration-200 hover:shadow-sm"
                :class="sideClass(f.side)"
                @click="onFactorClick(f.side)"
              >
                <Target class="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                <span>{{ f.text }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="text-[11px] text-slate-400">等待 AI 返回…</p>
        </section>

        <section class="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm" data-match-reveal="compare">
          <div class="mb-2 flex items-center gap-1.5">
            <Shield class="h-3.5 w-3.5 text-amber-500" />
            <h3 class="text-[12px] font-bold text-slate-800">风险</h3>
          </div>
          <ul v-if="riskDisplayItems.length" class="space-y-1.5">
            <li v-for="(item, i) in riskDisplayItems" :key="'r-' + i">
              <button
                v-if="item.isFactor && item.side"
                type="button"
                class="flex w-full cursor-pointer items-start gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50/50 px-2.5 py-1.5 text-left text-[11px] leading-relaxed text-amber-900 transition-colors duration-200 hover:shadow-sm"
                @click="onFactorClick(item.side!)"
              >
                <AlertTriangle class="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                <span>{{ item.text }}</span>
              </button>
              <p v-else class="text-[11px] leading-relaxed text-slate-600">
                · {{ item.text }}
              </p>
            </li>
          </ul>
          <p v-else class="text-[11px] text-slate-400">暂无显著风险</p>
        </section>
      </div>

      <!-- 重点玩家：自适应网格，完整展示点评 -->
      <section
        v-if="showPlayerSection"
        class="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm"
        data-match-reveal="compare"
      >
        <h3 class="mb-3 text-[13px] font-bold text-slate-800">重点玩家</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <button
            v-for="note in displayPlayerNotes"
            :key="note.steamId"
            type="button"
            class="player-note-card group flex cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 hover:shadow-md"
            :class="[
              note.side === 'A'
                ? 'border-blue-200/70 hover:border-blue-300/80'
                : 'border-orange-200/70 hover:border-orange-300/80',
              note.isPending ? 'opacity-60' : '',
              highlightedSteamId === note.steamId ? 'ring-2 ring-indigo-300' : '',
            ]"
            @click="onPlayerNoteClick(note.steamId, note.side, note.isPending)"
          >
            <div
              class="flex items-center gap-3 px-4 py-3.5"
              :class="
                note.side === 'A'
                  ? 'bg-linear-to-r from-blue-50/80 to-white'
                  : 'bg-linear-to-r from-orange-50/80 to-white'
              "
            >
              <PlayerAvatar
                :src="note.avatar"
                :alt="note.nickname"
                size="md"
                shape="rounded"
              />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span
                    class="text-[13px] font-bold"
                    :class="note.side === 'A' ? 'text-blue-700' : 'text-orange-600'"
                  >
                    {{ note.nickname }}
                  </span>
                  <span
                    v-if="formatPlayerRole(note.role)"
                    class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    :class="
                      note.side === 'A'
                        ? 'bg-blue-100/80 text-blue-700'
                        : 'bg-orange-100/80 text-orange-700'
                    "
                  >
                    {{ formatPlayerRole(note.role) }}
                  </span>
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    v-if="note.score"
                    class="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 shadow-sm"
                  >
                    {{ note.score }}
                  </span>
                  <span
                    v-if="note.rating"
                    class="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 shadow-sm"
                  >
                    R {{ note.rating.toFixed(2) }}
                  </span>
                  <span class="text-[10px] text-slate-400">队伍 {{ note.side }}</span>
                </div>
              </div>
            </div>
            <div class="border-t border-slate-100/80 px-4 py-3">
              <p
                class="text-[12px] leading-[1.65] text-slate-600"
                :class="note.isPending ? 'italic text-slate-400' : ''"
              >
                {{ note.text }}
              </p>
            </div>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ai-hero-card {
  box-shadow: 0 4px 20px rgb(59 130 246 / 0.06);
}

.player-note-card {
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.04);
}

.player-note-card:hover {
  box-shadow: 0 4px 16px rgb(15 23 42 / 0.08);
}

.ai-pulse-text {
  animation: ai-text-pulse 1.5s ease-in-out infinite;
}

@keyframes ai-text-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.75;
  }
}
</style>
