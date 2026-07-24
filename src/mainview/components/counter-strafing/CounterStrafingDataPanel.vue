<script setup lang="ts">
import { computed } from 'vue';
import {
  ChartColumn,
  CircleDot,
  CirclePause,
  Crosshair,
  Gauge,
  LineChart,
  Minus,
  Plus,
  Target,
  TrendingUp,
  Waves,
} from 'lucide-vue-next';
import CounterStrafingLineChart from './CounterStrafingLineChart.vue';
import AssessmentChartStyleControls from './AssessmentChartStyleControls.vue';
import ShootingErrorBars from './ShootingErrorBars.vue';
import type {
  CounterStrafingAssessmentRecord,
  CounterStrafingAssessmentSnapshot,
  CounterStrafingSnapshot,
  ShootingErrorRecord,
  AssessmentChartType,
} from '@core/counter-strafing/types';
import {
  assessmentRecordColor,
  assessmentStdDevColor,
  assessmentSuccessRateColor,
  assessmentTendencyColor,
  diffMsColor,
  formatDiffMs,
  formatErrorValue,
  formatSpeedRatio,
  sampleStateColor,
  shotFeedback,
  timingColor,
} from '@core/counter-strafing/types';

const props = defineProps<{
  snapshot: CounterStrafingSnapshot;
  assessmentSnapshot: CounterStrafingAssessmentSnapshot;
  lastShot: ShootingErrorRecord | null;
  lastAssessmentRecord: CounterStrafingAssessmentRecord | null;
  assessmentChartType: AssessmentChartType;
}>();

const emit = defineEmits<{
  'update:assessmentChartType': [value: AssessmentChartType];
}>();

const lastShotFeedback = computed(() =>
  props.lastShot ? shotFeedback(props.lastShot) : null,
);

const isRecording = computed(
  () => props.assessmentSnapshot.listening || props.snapshot.listening,
);

const assessmentCount = computed(() => props.assessmentSnapshot.records.length);
const shotCount = computed(() => props.snapshot.shotRecords.length);
const hasAssessmentData = computed(() => assessmentCount.value > 0);
const hasShotData = computed(() => shotCount.value > 0);

const assessmentDiffExtremes = computed(() => {
  const records = props.assessmentSnapshot.records;
  if (!records.length) return { min: null as number | null, max: null as number | null };
  let min = records[0].diffMs;
  let max = records[0].diffMs;
  for (const record of records) {
    if (record.diffMs < min) min = record.diffMs;
    if (record.diffMs > max) max = record.diffMs;
  }
  return { min, max };
});

type RateTone = 'good' | 'mid' | 'low';

function rateTone(value: number, goodAt = 70, midAt = 50): RateTone {
  if (value >= goodAt) return 'good';
  if (value >= midAt) return 'mid';
  return 'low';
}

const rateToneClass: Record<RateTone, string> = {
  good: 'text-emerald-600',
  mid: 'text-amber-600',
  low: 'text-rose-600',
};

const assessmentKpis = computed(() => {
  const snap = props.assessmentSnapshot;
  const extremes = assessmentDiffExtremes.value;
  const hasData = hasAssessmentData.value;

  return [
    {
      id: 'avg',
      label: '平均快慢',
      value: formatDiffMs(snap.avgDiffMs),
      hint: '相对理想时机的偏差',
      icon: Gauge,
      color: hasData ? diffMsColor(snap.avgDiffMs) : undefined,
    },
    {
      id: 'success',
      label: '表现不错',
      value: `${snap.successRate.toFixed(1)}%`,
      hint: '判定为成功的占比',
      icon: Target,
      color: hasData ? assessmentSuccessRateColor(snap.successRate) : undefined,
    },
    {
      id: 'std',
      label: '波动',
      value: `${snap.stdDevMs.toFixed(1)} ms`,
      hint: '样本离散程度',
      icon: Waves,
      color: hasData ? assessmentStdDevColor(snap.stdDevMs) : undefined,
    },
    {
      id: 'min',
      label: '最快',
      value: extremes.min !== null ? formatDiffMs(extremes.min) : '—',
      hint: '本次最佳一次',
      icon: Minus,
      color: extremes.min !== null ? diffMsColor(extremes.min) : undefined,
    },
    {
      id: 'max',
      label: '最慢',
      value: extremes.max !== null ? formatDiffMs(extremes.max) : '—',
      hint: '本次最慢一次',
      icon: Plus,
      color: extremes.max !== null ? diffMsColor(extremes.max) : undefined,
    },
    {
      id: 'tendency',
      label: '整体习惯',
      value: snap.tendencyLabel,
      hint: '长期偏向早按或晚按',
      icon: TrendingUp,
      color: hasData ? assessmentTendencyColor(snap.tendency) : undefined,
    },
  ];
});

const shootingKpis = computed(() => [
  {
    id: 'avg-error',
    label: '平均误差',
    value: formatErrorValue(props.snapshot.avgError),
    hint: '停稳后再开枪的偏移',
    icon: Crosshair,
  },
  {
    id: 'stable',
    label: '稳定占比',
    value: `${props.snapshot.stableRate.toFixed(1)}%`,
    hint: '判定为稳定的开枪',
    icon: Target,
    tone: rateTone(props.snapshot.stableRate),
  },
  {
    id: 'count',
    label: '本局开枪',
    value: String(shotCount.value),
    hint: '本次记录的开火次数',
    icon: ChartColumn,
  },
]);
</script>

<template>
  <div class="cs-data-panel space-y-5">
    <!-- 会话概览 -->
    <section
      class="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
      aria-label="本次记录概览"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div class="flex min-w-0 items-center gap-3">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-elevated"
            aria-hidden="true"
          >
            <CircleDot
              v-if="isRecording"
              class="h-5 w-5 text-emerald-600 motion-safe:animate-pulse"
            />
            <CirclePause
              v-else
              class="h-5 w-5 text-fg-muted"
            />
          </span>
          <div class="min-w-0">
            <p class="text-[14px] font-semibold text-fg">
              {{ isRecording ? '正在记录' : '未在记录' }}
            </p>
            <p class="mt-0.5 text-[12px] text-fg-muted">
              {{
                isRecording
                  ? '数据实时更新'
                  : '在控制台开启记录后，此处将展示统计与趋势'
              }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 items-stretch gap-2 sm:gap-3">
          <div
            class="min-w-22 rounded-xl border border-border-subtle bg-elevated/70 px-3.5 py-2.5 text-center"
          >
            <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
              急停样本
            </p>
            <p class="mt-0.5 text-[20px] font-bold tabular-nums leading-none text-fg">
              {{ assessmentCount }}
            </p>
          </div>
          <div
            class="min-w-22 rounded-xl border border-border-subtle bg-elevated/70 px-3.5 py-2.5 text-center"
          >
            <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
              开枪样本
            </p>
            <p class="mt-0.5 text-[20px] font-bold tabular-nums leading-none text-fg">
              {{ shotCount }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 急停评估 -->
    <section class="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header
        class="flex items-start gap-3 border-b border-border-subtle bg-linear-to-r from-indigo-500/6 via-surface to-surface px-5 py-4"
      >
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600"
        >
          <LineChart class="h-4 w-4" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-[15px] font-semibold text-fg">急停评估</h3>
            <span
              v-if="hasAssessmentData"
              class="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-600"
            >
              {{ assessmentCount }} 次
            </span>
          </div>
          <p class="mt-0.5 text-[12px] text-fg-muted">
            左右、前后切换时，按键时机与理想停稳点的偏差
          </p>
        </div>
      </header>

      <div class="space-y-3 p-5">
        <!-- 最近一次：全宽横条 -->
        <div
          class="rounded-xl border border-border-subtle bg-elevated/50 px-4 py-3.5"
          :class="lastAssessmentRecord ? 'min-h-18' : 'min-h-22'"
        >
          <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
            最近一次
          </p>

          <template v-if="lastAssessmentRecord">
            <div class="cs-data-metric-strip">
              <p
                class="cs-data-metric-strip__value"
                :style="{ color: assessmentRecordColor(lastAssessmentRecord) }"
              >
                {{ formatDiffMs(lastAssessmentRecord.diffMs) }}
              </p>
              <div
                class="h-9 w-px shrink-0 self-center bg-border-subtle"
                aria-hidden="true"
              />
              <div class="cs-data-metric-strip__meta">
                <p class="font-mono text-[12px] leading-none text-fg-secondary">
                  <span class="font-semibold text-fg">{{ lastAssessmentRecord.fromKey }}</span>
                  <span class="px-1 text-fg-muted">→</span>
                  <span class="font-semibold text-fg">{{ lastAssessmentRecord.toKey }}</span>
                </p>
                <p
                  class="text-[11px] font-semibold leading-none"
                  :style="{
                    color: timingColor(
                      lastAssessmentRecord.timing,
                      lastAssessmentRecord.isPerfect,
                      lastAssessmentRecord.isSuccess,
                    ),
                  }"
                >
                  {{ lastAssessmentRecord.timingLabel }}
                </p>
              </div>
            </div>
          </template>

          <div v-else class="mt-2 flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/8 text-indigo-500/70"
              aria-hidden="true"
            >
              <LineChart class="h-4 w-4" />
            </div>
            <div>
              <p class="text-[12px] font-medium text-fg-secondary">暂无急停数据</p>
              <p class="mt-0.5 text-[11px] text-fg-muted">
                开始记录后，每次方向切换的评估会显示在这里
              </p>
            </div>
          </div>
        </div>

        <!-- KPI：3×2 等宽网格 -->
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div
            v-for="kpi in assessmentKpis"
            :key="kpi.id"
            class="flex min-h-17 flex-col justify-between rounded-xl border border-border-subtle bg-surface px-3 py-2.5"
            :title="kpi.hint"
          >
            <div class="flex items-center gap-1.5">
              <component :is="kpi.icon" class="h-3 w-3 shrink-0 text-fg-muted" aria-hidden="true" />
              <p class="truncate text-[10px] font-medium text-fg-muted">{{ kpi.label }}</p>
            </div>
            <p
              class="mt-1.5 truncate text-[16px] font-bold tabular-nums leading-tight"
              :class="[
                kpi.id === 'tendency' ? 'text-[13px] font-semibold' : '',
                !kpi.color ? 'text-fg' : '',
              ]"
              :style="kpi.color ? { color: kpi.color } : undefined"
            >
              {{ kpi.value }}
            </p>
          </div>
        </div>
      </div>

      <div class="mx-5 mb-5 rounded-xl border border-border-subtle bg-[#0f172a]/3 px-4 py-3.5">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <p class="text-[11px] font-medium text-fg-muted">近 32 次趋势</p>
            <p v-if="!hasAssessmentData" class="text-[11px] text-fg-muted">等待样本…</p>
          </div>
          <AssessmentChartStyleControls
            :chart-type="assessmentChartType"
            compact
            @update:chart-type="emit('update:assessmentChartType', $event)"
          />
        </div>
        <CounterStrafingLineChart
          :records="assessmentSnapshot.records"
          :max-points="32"
          :height="104"
          :chart-type="assessmentChartType"
          colored
        />
      </div>
    </section>

    <!-- 开枪稳定 -->
    <section class="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header
        class="flex items-start gap-3 border-b border-border-subtle bg-linear-to-r from-amber-500/6 via-surface to-surface px-5 py-4"
      >
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"
        >
          <ChartColumn class="h-4 w-4" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-[15px] font-semibold text-fg">开枪稳定</h3>
            <span
              v-if="hasShotData"
              class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
            >
              {{ shotCount }} 次
            </span>
          </div>
          <p class="mt-0.5 text-[12px] text-fg-muted">
            停稳后再开枪时，移动速度与理想停稳状态的偏差
          </p>
        </div>
      </header>

      <div class="space-y-3 p-5">
        <div
          class="rounded-xl border border-border-subtle bg-elevated/50 px-4 py-3.5"
          :class="lastShot && lastShotFeedback ? 'min-h-18' : 'min-h-22'"
        >
          <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
            最近一次
          </p>

          <template v-if="lastShot && lastShotFeedback">
            <div class="cs-data-metric-strip">
              <p
                class="cs-data-metric-strip__value"
                :style="{ color: sampleStateColor(lastShot) }"
              >
                {{ formatSpeedRatio(lastShot) }}
              </p>
              <div
                class="h-9 w-px shrink-0 self-center bg-border-subtle"
                aria-hidden="true"
              />
              <div class="cs-data-metric-strip__meta">
                <p
                  class="font-mono text-[12px] font-semibold leading-none tabular-nums"
                  :style="{ color: lastShotFeedback.color }"
                >
                  {{ lastShotFeedback.shortLabel }}
                </p>
                <p class="text-[11px] leading-none text-fg-muted">
                  {{ lastShot.scoreLabel }}
                </p>
              </div>
            </div>
          </template>

          <div v-else class="mt-2 flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/8 text-amber-600/70"
              aria-hidden="true"
            >
              <ChartColumn class="h-4 w-4" />
            </div>
            <div>
              <p class="text-[12px] font-medium text-fg-secondary">暂无开枪数据</p>
              <p class="mt-0.5 text-[11px] text-fg-muted">
                记录期间每次开火都会计入稳定度分析
              </p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div
            v-for="kpi in shootingKpis"
            :key="kpi.id"
            class="flex min-h-17 flex-col justify-between rounded-xl border border-border-subtle bg-surface px-3 py-2.5"
            :title="kpi.hint"
          >
            <div class="flex items-center gap-1.5">
              <component :is="kpi.icon" class="h-3 w-3 shrink-0 text-fg-muted" aria-hidden="true" />
              <p class="truncate text-[10px] font-medium text-fg-muted">{{ kpi.label }}</p>
            </div>
            <p
              class="mt-1.5 truncate text-[16px] font-bold tabular-nums leading-tight"
              :class="kpi.tone ? rateToneClass[kpi.tone] : 'text-fg'"
            >
              {{ kpi.value }}
            </p>
          </div>
        </div>
      </div>

      <div class="mx-5 mb-5 rounded-xl border border-border-subtle bg-[#0f172a]/3 px-4 py-3.5">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="text-[11px] font-medium text-fg-muted">近 32 发分布</p>
          <p v-if="!hasShotData" class="text-[11px] text-fg-muted">等待样本…</p>
        </div>
        <ShootingErrorBars
          :records="snapshot.shotRecords"
          :max-points="32"
          :height="104"
          :show-stable-bars="snapshot.hudShowStableBars"
          :show-tap-markers="snapshot.hudShowTapMarkers"
          show-legend
          show-hud-feedback
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.cs-data-panel {
  font-variant-numeric: tabular-nums;
}

.cs-data-metric-strip {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.5rem;
}

.cs-data-metric-strip__value {
  flex-shrink: 0;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}

.cs-data-metric-strip__meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 0.375rem;
}

@media (prefers-reduced-motion: reduce) {
  .cs-data-panel :deep(.motion-safe\:animate-pulse) {
    animation: none;
  }
}
</style>
