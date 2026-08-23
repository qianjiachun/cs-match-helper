<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Crown,
  Crosshair,
  Eye,
  Gauge,
  MapPinned,
  RefreshCw,
  Scale,
  Shield,
  ShieldAlert,
  Swords,
  Target,
  TriangleAlert,
  Users,
  XCircle,
  Zap,
} from 'lucide-vue-next';
import type { MatchRecord } from '@core/match/models';
import type {
  AiEvidenceSnapshot,
  AiMatchupDimension,
  AiPlayerSignal,
  AiPlayerSignalKind,
} from '@core/ai/types';
import { DEEPSEEK_API_KEYS_URL, getApiKeyLabel, isAiAnalysisActive } from '@core/ai/types';
import { formatCostLabel } from '@core/ai/pricing';
import { displayPerspectiveText, sideRelationshipLabel, type AiSide } from '@core/ai/perspective';
import type { useAiAnalysis } from '../composables/useAiAnalysis';
import { currentLocale, localize as l } from '../i18n';
import { openExternalUrl } from '../native';
import AiLoadingAnimation from './AiLoadingAnimation.vue';
import AiSparklesIcon from './AiSparklesIcon.vue';

const props = defineProps<{
  match: MatchRecord;
  ai: ReturnType<typeof useAiAnalysis>;
  historyMode?: boolean;
  highlightedSide?: 'A' | 'B' | null;
  focusedSteamId?: string | null;
  selfSide?: AiSide | null;
}>();

const emit = defineEmits<{
  highlightSide: [side: 'A' | 'B' | null];
  openSettings: [];
  analyze: [];
  stop: [];
}>();

const result = computed(() => props.ai.result.value);
const preview = computed(() => props.ai.preview.value);
const probabilityResult = computed(() => preview.value ?? result.value);
const isLoading = computed(() => props.ai.status.value === 'loading' || props.ai.status.value === 'streaming');
const isError = computed(() => props.ai.status.value === 'error');
const aiEnabled = computed(() => Boolean(props.ai.settings.value?.analysisEnabled));
const aiConfigured = computed(() => isAiAnalysisActive(props.ai.settings.value));
const autoAnalyze = computed(() => props.ai.settings.value?.autoAnalyze !== false);
const apiKeyLabel = computed(() => getApiKeyLabel(props.ai.settings.value?.providerMode));

function sideLabel(side: AiSide): string {
  return sideRelationshipLabel(side, props.selfSide, currentLocale());
}

function perspectiveText(text: string): string {
  return displayPerspectiveText(text, props.selfSide, currentLocale());
}

const winA = computed(() => Math.round(probabilityResult.value?.winProbability.A ?? 50));
const winB = computed(() => 100 - winA.value);
const modelA = computed(() => Math.round(probabilityResult.value?.modelWinProbability.A ?? winA.value));
const coveragePct = computed(() => Math.round((probabilityResult.value?.dataCoverage ?? 0) * 100));
const displayConfidence = computed(() => preview.value?.confidence ?? result.value?.confidence ?? 0);
const confidenceLabel = computed(() => {
  const value = displayConfidence.value;
  if (value >= 75) return l('高可信', 'High confidence');
  if (value >= 50) return l('中等可信', 'Moderate confidence');
  return l('谨慎参考', 'Low confidence');
});

const winnerText = computed(() => {
  if (probabilityResult.value?.predictedWinner === 'A') return l(`${sideLabel('A')}略占优势`, `${sideLabel('A')} favored`);
  if (probabilityResult.value?.predictedWinner === 'B') return l(`${sideLabel('B')}略占优势`, `${sideLabel('B')} favored`);
  if (probabilityResult.value?.predictedWinner === 'Even') return l('双方势均力敌', 'Matchup is even');
  return l('暂时难以判断', 'Outcome unclear');
});

const signalGroups = computed(() => {
  const signals = result.value?.playerSignals ?? [];
  const groups: Array<{ id: string; label: string; tone: string; items: AiPlayerSignal[] }> = [
    {
      id: 'positive',
      label: l('正面信号', 'Positive signals'),
      tone: 'text-emerald-700',
      items: signals.filter((item) => ['carry', 'anchor', 'specialist'].includes(item.kind)),
    },
    {
      id: 'negative',
      label: l('负面信号', 'Negative signals'),
      tone: 'text-rose-700',
      items: signals.filter((item) => item.kind === 'weakLink'),
    },
    {
      id: 'variable',
      label: l('变量与旧关注', 'Variables and legacy watch'),
      tone: 'text-amber-700',
      items: signals.filter((item) => item.kind === 'volatile' || item.kind === 'watch'),
    },
  ];
  return groups.filter((group) => group.items.length);
});

function signalLabel(kind: AiPlayerSignalKind): string {
  if (kind === 'carry') return l('强点', 'Carry');
  if (kind === 'anchor') return l('支点', 'Anchor');
  if (kind === 'specialist') return l('专长', 'Specialist');
  if (kind === 'weakLink') return l('短板', 'Weak link');
  if (kind === 'volatile') return l('变量', 'Volatile');
  return l('旧关注', 'Legacy watch');
}

function signalIcon(kind: AiPlayerSignalKind) {
  if (kind === 'carry') return Crown;
  if (kind === 'anchor') return Shield;
  if (kind === 'specialist') return Crosshair;
  if (kind === 'weakLink') return TriangleAlert;
  if (kind === 'volatile') return Zap;
  return Eye;
}

function signalTone(kind: AiPlayerSignalKind): string {
  if (kind === 'carry') return 'bg-emerald-50 text-emerald-700';
  if (kind === 'anchor') return 'bg-blue-50 text-blue-700';
  if (kind === 'specialist') return 'bg-violet-50 text-violet-700';
  if (kind === 'weakLink') return 'bg-rose-50 text-rose-700';
  if (kind === 'volatile') return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

const dimensionMeta: Record<AiMatchupDimension, { label: string; icon: typeof Gauge }> = {
  strength: { label: l('强度', 'Strength'), icon: Gauge },
  aim: { label: l('枪法', 'Aim'), icon: Crosshair },
  opening: { label: l('首杀', 'Openings'), icon: Target },
  utility: { label: l('道具', 'Utility'), icon: ShieldAlert },
  clutch: { label: l('残局', 'Clutch'), icon: Swords },
  map: { label: l('地图', 'Map'), icon: MapPinned },
  form: { label: l('状态', 'Form'), icon: BarChart3 },
  party: { label: l('组排', 'Party'), icon: Users },
};

function advantageLabel(side: 'A' | 'B' | 'Even'): string {
  return side === 'Even' ? l('持平', 'Even') : sideLabel(side);
}

function advantageTone(side: 'A' | 'B' | 'Even'): string {
  if (side === 'A') return 'bg-blue-50 text-blue-700';
  if (side === 'B') return 'bg-orange-50 text-orange-700';
  return 'bg-slate-100 text-slate-600';
}

function evidenceValue(evidence: AiEvidenceSnapshot): string {
  return evidence.value ?? (evidence.valueA && evidence.valueB
    ? `${evidence.valueA} / ${evidence.valueB}`
    : '');
}

function evidencePillText(evidence: AiEvidenceSnapshot): string {
  const value = evidenceValue(evidence);
  return value ? `${evidence.label} ${value}` : evidence.label;
}

function evidenceTooltip(evidence: AiEvidenceSnapshot): string {
  const parts = [evidenceReliability(evidence)];
  if (evidence.sampleSize != null) parts.push(l(`${evidence.sampleSize} 场`, `${evidence.sampleSize} matches`));
  const comparison = comparisonText(evidence);
  if (comparison) parts.push(comparison);
  return parts.join(' · ');
}

function comparisonText(evidence: AiEvidenceSnapshot): string | null {
  const comparison = evidence.comparison;
  if (!comparison || comparison.lobbyDelta == null) return null;
  const delta = comparison.lobbyDelta;
  const formatted = Math.abs(delta) >= 10 ? Math.round(Math.abs(delta)).toString() : Math.abs(delta).toFixed(2).replace(/\.00$/, '');
  if (Math.abs(delta) < 0.001) return l('与全场中位数相当', 'Matches lobby median');
  const rawHigher = delta > 0;
  const favorable = comparison.higherIsBetter ? rawHigher : !rawHigher;
  return l(
    `${favorable ? '优于' : '弱于'}全场中位数 ${formatted}`,
    `${favorable ? 'Better' : 'Worse'} than lobby median by ${formatted}`,
  );
}

function evidenceReliability(evidence: AiEvidenceSnapshot): string {
  if (evidence.reliability === 'high') return l('高可靠', 'High');
  if (evidence.reliability === 'medium') return l('中可靠', 'Medium');
  return l('低样本', 'Low sample');
}

const elapsedLabel = computed(() => {
  const ms = props.ai.elapsedMs.value;
  if (ms == null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
});

const usageLabel = computed(() => props.ai.usage.value?.totalTokens.toLocaleString() ?? '—');
const costLabel = computed(() => {
  const usage = props.ai.usage.value;
  const model = props.ai.settings.value?.model;
  return usage && model ? formatCostLabel(model, usage) : null;
});

async function focusSignal(steamId: string | null | undefined) {
  if (!steamId) return;
  await nextTick();
  const element = document.getElementById(`ai-player-${steamId}`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => element?.focus({ preventScroll: true }), 280);
}

watch(() => props.focusedSteamId, focusSignal, { immediate: true });
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-slate-50/70 px-4 py-4 sm:px-6">
    <div v-if="!aiConfigured" class="flex min-h-full items-center justify-center py-10">
      <section class="w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-6 text-center shadow-sm">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-sm">
          <AiSparklesIcon size="md" static />
        </div>
        <h2 class="text-balance text-[17px] font-bold text-slate-900">
          {{ aiEnabled ? l('还差 API Key', 'API key required') : l('启用 AI 分析', 'Enable AI analysis') }}
        </h2>
        <p class="mt-2 text-pretty text-[13px] leading-relaxed text-slate-500">
          {{ aiEnabled ? l(`请先配置 ${apiKeyLabel}，再生成赛前分析。`, `Configure ${apiKeyLabel} before running analysis.`) : l('启用后可获得胜率预测、胜负手和方向明确的玩家信号。', 'Enable predictions, decisive factors, and directional player signals.') }}
        </p>
        <div class="mt-5 flex justify-center gap-2.5">
          <button
            v-if="aiEnabled && props.ai.settings.value?.providerMode !== 'openai_compatible'"
            type="button"
            class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-[12px] font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 active:scale-[0.96]"
            @click="openExternalUrl(DEEPSEEK_API_KEYS_URL)"
          >
            {{ l('获取 Key', 'Get key') }}
            <ArrowRight class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-[12px] font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 active:scale-[0.96]"
            @click="emit('openSettings')"
          >
            {{ l('打开设置', 'Open settings') }}
            <ArrowRight class="h-3.5 w-3.5" />
          </button>
        </div>
      </section>
    </div>

    <div v-else-if="!result && isLoading" class="flex min-h-full flex-col items-center justify-center gap-5">
      <AiLoadingAnimation />
      <section
        v-if="preview"
        class="w-full max-w-sm rounded-xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm"
        aria-live="polite"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="inline-flex items-center gap-1 text-[12px] font-bold text-indigo-600">
            <AiSparklesIcon size="sm" static />
            {{ winnerText }}
          </span>
          <span class="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{{ l('流式预估 · 正在校准', 'Live estimate · calibrating') }}</span>
        </div>
        <div class="mt-3 flex items-baseline justify-between tabular-nums">
          <span class="text-[12px] font-semibold text-blue-600">{{ sideLabel('A') }} <strong class="ml-1 text-[22px] font-bold text-slate-950">{{ winA }}%</strong></span>
          <span class="text-[12px] font-semibold text-orange-600"><strong class="mr-1 text-[22px] font-bold text-slate-950">{{ winB }}%</strong> {{ sideLabel('B') }}</span>
        </div>
        <div class="mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <span class="bg-blue-500 transition-[width] duration-300" :style="{ width: `${winA}%` }" />
          <span class="bg-orange-500 transition-[width] duration-300" :style="{ width: `${winB}%` }" />
        </div>
      </section>
      <button type="button" class="min-h-10 cursor-pointer rounded-lg px-4 text-[12px] font-medium text-slate-500 hover:bg-slate-100 active:scale-[0.96]" @click="emit('stop')">
        {{ l('停止分析', 'Stop analysis') }}
      </button>
    </div>

    <div v-else-if="!result" class="flex min-h-full items-center justify-center py-10">
      <section class="w-full max-w-md text-center">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Scale class="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 class="text-balance text-[17px] font-bold text-slate-900">
          {{ isError ? l('本次分析未完成', 'Analysis did not complete') : autoAnalyze ? l('等待对局数据', 'Waiting for match data') : l('自动分析已关闭', 'Automatic analysis is off') }}
        </h2>
        <p class="mt-2 text-pretty text-[13px] leading-relaxed text-slate-500">
          {{ isError && props.ai.error.value ? props.ai.error.value : l('准备好后可手动生成当前对局的 AI 报告。', 'Generate an AI report for this match when ready.') }}
        </p>
        <button
          type="button"
          class="mt-5 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 text-[12px] font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 active:scale-[0.96]"
          @click="emit('analyze')"
        >
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
          {{ isError ? l('重试', 'Retry') : l('开始分析', 'Analyze') }}
        </button>
      </section>
    </div>

    <main v-else class="ai-report w-full space-y-4">
      <!-- 状态条 -->
      <div v-if="isLoading" class="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-4 py-2 text-[12px] font-medium text-indigo-700">
        <RefreshCw class="h-3.5 w-3.5 animate-spin" />
        {{ l('正在更新分析，当前完整结果会保留到新结果生成。', 'Updating analysis. The current complete result remains visible until replacement.') }}
      </div>
      <div v-else-if="isError && props.ai.error.value" class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800">
        <AlertTriangle class="h-3.5 w-3.5 text-amber-600" />
        <span>{{ l('更新失败，继续显示上一次结果：', 'Update failed; showing the previous result:') }} {{ props.ai.error.value }}</span>
      </div>

      <!-- 1. Hero 对决战况看板 -->
      <section class="ai-report-enter rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs lg:p-6">
        <div class="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-[12px] font-bold text-indigo-700">
                <AiSparklesIcon size="sm" static />
                {{ winnerText }}
              </span>
              <span v-if="preview" class="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{{ l('流式校准中', 'Live calibrating') }}</span>
              <span class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums">
                {{ displayConfidence }}% {{ confidenceLabel }}
              </span>
              <span class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums">
                {{ l('覆盖', 'Coverage') }} {{ coveragePct }}%
              </span>
            </div>
            
            <h2 class="mt-2.5 max-w-3xl text-balance text-[20px] font-black tracking-tight text-slate-900 lg:text-[22px]">
              {{ perspectiveText(result.headline) }}
            </h2>

            <p
              class="mt-2 text-[12px] text-slate-400"
              :title="l('模型原始概率会按数据覆盖率向 50% 收敛', 'Raw model probability is calibrated toward 50% based on coverage')"
            >
              {{ l(`模型原始预估：${sideLabel('A')} ${modelA}% · 考虑样本覆盖率后收敛至最终预测`, `Raw model: ${sideLabel('A')} ${modelA}% · Calibrated by coverage`) }}
            </p>
          </div>

          <!-- 战力胜率天平 -->
          <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <div class="flex items-center justify-between pb-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">{{ l('战力胜率预测', 'Win Probability') }}</span>
              <span class="text-[11px] text-slate-400">{{ l('点击可高亮阵营', 'Click to highlight') }}</span>
            </div>
            <div class="flex items-baseline justify-between tabular-nums">
              <button
                type="button"
                class="group cursor-pointer rounded-lg p-1.5 text-left transition-colors hover:bg-blue-100/50 active:scale-[0.96]"
                :class="highlightedSide === 'A' ? 'bg-blue-100/70 ring-1 ring-blue-400' : ''"
                @click="emit('highlightSide', 'A')"
              >
                <div class="flex items-center gap-1.5">
                  <span class="h-2 w-2 rounded-full bg-blue-500" />
                  <span class="text-[12px] font-bold text-blue-700">{{ sideLabel('A') }}</span>
                  <span v-if="selfSide" class="rounded bg-blue-100/80 px-1 text-[10px] font-bold text-blue-600">A</span>
                </div>
                <strong class="mt-1 block text-[26px] font-black leading-none text-slate-900 group-hover:text-blue-700">{{ winA }}%</strong>
              </button>

              <div class="px-2 text-center text-[12px] font-black italic text-slate-300">VS</div>

              <button
                type="button"
                class="group cursor-pointer rounded-lg p-1.5 text-right transition-colors hover:bg-orange-100/50 active:scale-[0.96]"
                :class="highlightedSide === 'B' ? 'bg-orange-100/70 ring-1 ring-orange-400' : ''"
                @click="emit('highlightSide', 'B')"
              >
                <div class="flex items-center justify-end gap-1.5">
                  <span v-if="selfSide" class="rounded bg-orange-100/80 px-1 text-[10px] font-bold text-orange-600">B</span>
                  <span class="text-[12px] font-bold text-orange-700">{{ sideLabel('B') }}</span>
                  <span class="h-2 w-2 rounded-full bg-orange-500" />
                </div>
                <strong class="mt-1 block text-[26px] font-black leading-none text-slate-900 group-hover:text-orange-700">{{ winB }}%</strong>
              </button>
            </div>
            <div class="mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
              <span class="bg-blue-500 transition-all duration-300" :style="{ width: `${winA}%` }" />
              <span class="bg-orange-500 transition-all duration-300" :style="{ width: `${winB}%` }" />
            </div>
          </div>
        </div>
      </section>

      <!-- 2. 中间双栏：决定本局的因素 + 玩家信号 -->
      <div class="ai-report-enter grid gap-4 lg:grid-cols-2">
        <!-- 决定本局的因素 -->
        <section v-if="result.decisiveFactors.length" class="flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div class="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <div class="flex items-center gap-2">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Scale class="h-4 w-4" aria-hidden="true" />
              </div>
              <h3 class="text-[14px] font-bold text-slate-900">{{ l('决定本局的因素', 'Decisive factors') }}</h3>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {{ result.decisiveFactors.length }} {{ l('项核心胜负手', 'factors') }}
            </span>
          </div>

          <div class="space-y-3.5">
            <article
              v-for="factor in result.decisiveFactors"
              :key="factor.id"
              class="group rounded-lg border border-slate-100 bg-slate-50/50 p-3.5 transition-all hover:border-slate-200 hover:bg-slate-50/80 hover:shadow-xs"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                  <component :is="dimensionMeta[factor.dimension].icon" class="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <span class="text-[11px] font-bold text-slate-600">{{ dimensionMeta[factor.dimension].label }}</span>
                  <span class="rounded px-1.5 py-0.5 text-[10px] font-bold" :class="advantageTone(factor.advantage)">
                    {{ advantageLabel(factor.advantage) }}
                  </span>
                </div>
                
                <!-- 影响度指示器 -->
                <div
                  class="flex items-center gap-1"
                  :title="l(`影响度 ${factor.impact}/3`, `Impact ${factor.impact}/3`)"
                  :aria-label="l(`影响度 ${factor.impact}/3`, `Impact ${factor.impact}/3`)"
                >
                  <span class="text-[10px] text-slate-400 mr-0.5">{{ l('影响', 'Impact') }}</span>
                  <span
                    v-for="dot in 3"
                    :key="dot"
                    class="h-1.5 w-3 rounded-full transition-colors"
                    :class="dot <= factor.impact ? 'bg-indigo-600' : 'bg-slate-200'"
                  />
                </div>
              </div>

              <h4 class="mt-2 text-[13px] font-bold text-slate-900">{{ perspectiveText(factor.title) }}</h4>
              <p class="mt-1 text-[12px] leading-relaxed text-slate-600">{{ perspectiveText(factor.summary) }}</p>

              <!-- 关键证据指标 Pills -->
              <div v-if="factor.evidence.length" class="mt-2.5 flex flex-wrap gap-1.5 pt-1">
                <span
                  v-for="evidence in factor.evidence.slice(0, 2)"
                  :key="evidence.id"
                  class="inline-flex items-center rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700 shadow-2xs"
                  :title="evidenceTooltip(evidence)"
                >
                  <span class="text-slate-400 mr-1">#</span>
                  {{ evidencePillText(evidence) }}
                </span>
              </div>
            </article>
          </div>
        </section>

        <!-- 玩家信号 -->
        <section v-if="signalGroups.length" class="flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div class="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <div class="flex items-center gap-2">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Users class="h-4 w-4" aria-hidden="true" />
              </div>
              <h3 class="text-[14px] font-bold text-slate-900">{{ l('玩家信号', 'Player signals') }}</h3>
            </div>
            <span class="text-[11px] text-slate-400">{{ l('与主表格头像图标联动', 'Synced with table badges') }}</span>
          </div>

          <div class="space-y-4">
            <div v-for="group in signalGroups" :key="group.id">
              <div class="mb-2 flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full" :class="group.id === 'positive' ? 'bg-emerald-500' : group.id === 'negative' ? 'bg-rose-500' : 'bg-amber-500'" />
                <span class="text-[11px] font-bold tracking-wider uppercase" :class="group.tone">{{ group.label }}</span>
              </div>

              <div class="space-y-2.5">
                <article
                  v-for="signal in group.items"
                  :id="`ai-player-${signal.steamId}`"
                  :key="signal.steamId"
                  tabindex="-1"
                  class="group flex gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 outline-none transition-all hover:border-slate-200 hover:bg-slate-50 hover:shadow-xs focus:border-indigo-400 focus:bg-indigo-50/40 focus:ring-2 focus:ring-indigo-100"
                >
                  <!-- 角色专属战术徽章 -->
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-2xs" :class="signalTone(signal.kind)">
                    <component :is="signalIcon(signal.kind)" class="h-4 w-4" aria-hidden="true" />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span class="truncate text-[13px] font-bold text-slate-900">{{ signal.nickname }}</span>
                      <span class="inline-flex items-center gap-1 text-[11px] font-semibold" :class="signal.side === 'A' ? 'text-blue-600' : 'text-orange-600'">
                        <span class="h-1.5 w-1.5 rounded-full" :class="signal.side === 'A' ? 'bg-blue-500' : 'bg-orange-500'" />
                        {{ sideLabel(signal.side) }}
                        <span v-if="selfSide" class="font-normal text-slate-400">{{ signal.side }}</span>
                      </span>
                      <span class="rounded px-1.5 py-0.2 text-[10px] font-bold" :class="signalTone(signal.kind)">
                        {{ signalLabel(signal.kind) }}
                      </span>
                    </div>

                    <p class="mt-1 text-[12px] leading-relaxed text-slate-600">{{ perspectiveText(signal.summary) }}</p>

                    <!-- 附带精简证据 -->
                    <div v-if="signal.evidence.length" class="mt-2 flex flex-wrap gap-1.5">
                      <span
                        v-for="evidence in signal.evidence.slice(0, 2)"
                        :key="evidence.id"
                        class="inline-flex items-center rounded border border-slate-200/60 bg-white px-1.5 py-0.2 text-[10.5px] font-medium tabular-nums text-slate-600"
                        :title="evidenceTooltip(evidence)"
                      >
                        {{ evidencePillText(evidence) }}
                      </span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 3. 双方取胜路径 (Paths to victory) -->
      <section class="ai-report-enter rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div class="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Target class="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 class="text-[14px] font-bold text-slate-900">{{ l('双方取胜路径', 'Paths to victory') }}</h3>
          </div>
          <span class="text-[11px] text-slate-400">{{ l('核心胜负条件与潜在风险博弈', 'Tactical win conditions & vulnerabilities') }}</span>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div
            v-for="side in (['A', 'B'] as const)"
            :key="side"
            class="rounded-xl border p-4 transition-all"
            :class="side === 'A' ? 'border-blue-100/90 bg-blue-50/30' : 'border-orange-100/90 bg-orange-50/30'"
          >
            <!-- 队伍标题 -->
            <div class="flex items-center gap-2 border-b pb-2.5" :class="side === 'A' ? 'border-blue-100 text-blue-700' : 'border-orange-100 text-orange-700'">
              <span class="h-2 w-2 rounded-full" :class="side === 'A' ? 'bg-blue-500' : 'bg-orange-500'" />
              <h4 class="text-[13px] font-black">
                {{ sideLabel(side) }}
                <span v-if="selfSide" class="font-normal text-slate-400">({{ side }})</span>
                {{ l('战术推演', 'Tactical Roadmap') }}
              </h4>
            </div>

            <div class="mt-3 grid gap-4 sm:grid-cols-2">
              <!-- 取胜条件 -->
              <div class="rounded-lg bg-white/80 p-3 shadow-2xs">
                <p class="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-700">
                  <CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
                  {{ l('取胜条件', 'Win conditions') }}
                </p>
                <ul class="space-y-2">
                  <li
                    v-for="(claim, index) in result.teamPlans[side].winConditions"
                    :key="`win-${side}-${index}`"
                    class="text-[12px] leading-relaxed text-slate-700"
                  >
                    <div class="flex items-start gap-1.5">
                      <span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                      <div>
                        <span>{{ perspectiveText(claim.text) }}</span>
                        <div v-if="claim.evidence[0]" class="mt-1">
                          <span
                            class="inline-block rounded bg-emerald-50 px-1.5 py-0.2 text-[10.5px] font-medium text-emerald-700"
                            :title="evidenceTooltip(claim.evidence[0])"
                          >
                            {{ evidencePillText(claim.evidence[0]) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                  <li v-if="!result.teamPlans[side].winConditions.length" class="text-[11px] text-slate-400">
                    {{ l('暂无足够证据', 'Insufficient evidence') }}
                  </li>
                </ul>
              </div>

              <!-- 主要隐患 -->
              <div class="rounded-lg bg-white/80 p-3 shadow-2xs">
                <p class="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold text-rose-700">
                  <XCircle class="h-3.5 w-3.5 shrink-0" />
                  {{ l('主要隐患', 'Risks') }}
                </p>
                <ul class="space-y-2">
                  <li
                    v-for="(claim, index) in result.teamPlans[side].risks"
                    :key="`risk-${side}-${index}`"
                    class="text-[12px] leading-relaxed text-slate-700"
                  >
                    <div class="flex items-start gap-1.5">
                      <span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-500" />
                      <div>
                        <span>{{ perspectiveText(claim.text) }}</span>
                        <div v-if="claim.evidence[0]" class="mt-1">
                          <span
                            class="inline-block rounded bg-rose-50 px-1.5 py-0.2 text-[10.5px] font-medium text-rose-700"
                            :title="evidenceTooltip(claim.evidence[0])"
                          >
                            {{ evidencePillText(claim.evidence[0]) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                  <li v-if="!result.teamPlans[side].risks.length" class="text-[11px] text-slate-400">
                    {{ l('暂无明确隐患', 'No clear risk identified') }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. 数据边界与运行信息 (Footer) -->
      <div class="ai-report-enter space-y-3">
        <section v-if="result.uncertainties.length" class="rounded-xl border border-amber-200/60 bg-amber-50/40 p-4 shadow-2xs">
          <div class="flex items-center gap-2 text-amber-800">
            <AlertTriangle class="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <h3 class="text-[12.5px] font-bold">{{ l('数据边界', 'Data boundary') }}</h3>
          </div>
          <ul class="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <li v-for="item in result.uncertainties" :key="item" class="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-amber-900/80">
              <span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
              <span>{{ perspectiveText(item) }}</span>
            </li>
          </ul>
        </section>

        <details class="rounded-xl border border-slate-200/70 bg-white px-4 py-2.5 text-[11.5px] text-slate-500 shadow-2xs">
          <summary class="min-h-7 cursor-pointer select-none font-bold text-slate-600 transition-colors hover:text-slate-900">
            {{ l('运行信息', 'Run details') }}
          </summary>
          <div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-100 pt-2 tabular-nums">
            <span>{{ l('分析耗时', 'Elapsed') }}: <strong class="text-slate-700">{{ elapsedLabel }}</strong></span>
            <span>Token: <strong class="text-slate-700">{{ usageLabel }}</strong></span>
            <span v-if="costLabel">{{ l('费用', 'Cost') }}: <strong class="text-slate-700">{{ costLabel }}</strong></span>
            <span>数据质量: <strong class="text-slate-700">{{ result.dataQuality }}</strong></span>
          </div>
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11.5px] font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 active:scale-[0.96]"
              @click="emit('analyze')"
            >
              <RefreshCw class="h-3 w-3" />
              {{ l('重新分析', 'Analyze again') }}
            </button>
            <button
              v-if="isLoading"
              type="button"
              class="min-h-8 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-[11.5px] font-medium text-slate-500 hover:bg-slate-50 active:scale-[0.96]"
              @click="emit('stop')"
            >
              {{ l('停止', 'Stop') }}
            </button>
          </div>
        </details>
      </div>
    </main>
  </div>
</template>

<style scoped>
.ai-report-enter {
  animation: ai-report-in 360ms cubic-bezier(0.2, 0, 0, 1) both;
}

.ai-report-enter:nth-child(2) { animation-delay: 60ms; }
.ai-report-enter:nth-child(3) { animation-delay: 120ms; }
.ai-report-enter:nth-child(4) { animation-delay: 180ms; }
.ai-report-enter:nth-child(5) { animation-delay: 240ms; }
.ai-report-enter:nth-child(6) { animation-delay: 300ms; }

@keyframes ai-report-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

