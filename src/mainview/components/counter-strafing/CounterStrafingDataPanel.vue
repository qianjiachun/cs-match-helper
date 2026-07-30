<script setup lang="ts">
import { computed } from 'vue';
import {
  ChartColumn,
  CircleDot,
  CirclePause,
  Crosshair,
  Filter,
  Gauge,
  LineChart,
  Minus,
  Plus,
  ShieldCheck,
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
import { currentLocale, localize as l } from '../../i18n';
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
  sampleState,
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
  props.lastShot ? shotFeedback(props.lastShot, currentLocale()) : null,
);

function assessmentTimingLabel(record: CounterStrafingAssessmentRecord): string {
  if (record.isPerfect || record.timing === 'perfect') return l('完美', 'Perfect');
  if (record.isSuccess) return l('优秀', 'Good');
  return record.timing === 'early' ? l('偏早', 'Early') : l('偏晚', 'Late');
}

function shootingStateLabel(record: ShootingErrorRecord): string {
  const state = sampleState(record);
  if (state === 'stable') return l('稳定', 'Stable');
  if (state === 'micro') return l('微动', 'Slight movement');
  return l('跑打', 'Running accuracy');
}

const isRecording = computed(
  () => props.assessmentSnapshot.listening || props.snapshot.listening,
);

const assessmentCount = computed(() => props.assessmentSnapshot.records.length);
const shotCount = computed(() => props.snapshot.shotRecords.length);
const hasAssessmentData = computed(() => assessmentCount.value > 0);
const hasShotData = computed(() => shotCount.value > 0);

const gsiCoverage = computed(() => {
  const records = [
    ...props.snapshot.shotRecords,
    ...props.assessmentSnapshot.records,
  ];
  if (!records.length) return 0;
  const enhanced = records.filter((record) => record.contextMode === 'enhanced').length;
  return (enhanced / records.length) * 100;
});

const gsiIgnoredTotal = computed(() => {
  const ignored = props.snapshot.gsiStatus.ignored;
  return Object.values(ignored).reduce((sum, value) => sum + value, 0);
});

const gsiIgnoredReasons = computed(() => {
  const ignored = props.snapshot.gsiStatus.ignored;
  return [
    { value: ignored.nonFirearm, label: l('刀 / 投掷物 / C4', 'Knife / grenade / C4') },
    { value: ignored.invalidContext, label: l('无效阶段', 'Invalid phase') },
    { value: ignored.deadOrSpectating, label: l('死亡 / 观战', 'Dead / spectating') },
    { value: ignored.notForeground, label: l('非游戏窗口', 'Game not focused') },
    { value: ignored.emptyMagazine, label: l('空仓点击', 'Empty magazine') },
  ].filter((item) => item.value > 0);
});

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
      label: l('平均快慢', 'Avg. timing'),
      value: formatDiffMs(snap.avgDiffMs),
      hint: l('相对理想时机的偏差', 'Offset from ideal timing'),
      icon: Gauge,
      color: hasData ? diffMsColor(snap.avgDiffMs) : undefined,
    },
    {
      id: 'success',
      label: l('表现不错', 'Good rate'),
      value: `${snap.successRate.toFixed(1)}%`,
      hint: l('判定为成功的占比', 'Share graded Perfect or Good'),
      icon: Target,
      color: hasData ? assessmentSuccessRateColor(snap.successRate) : undefined,
    },
    {
      id: 'std',
      label: l('波动', 'Variation'),
      value: `${snap.stdDevMs.toFixed(1)} ms`,
      hint: l('样本离散程度', 'Timing consistency'),
      icon: Waves,
      color: hasData ? assessmentStdDevColor(snap.stdDevMs) : undefined,
    },
    {
      id: 'min',
      label: l('最快', 'Earliest'),
      value: extremes.min !== null ? formatDiffMs(extremes.min) : '—',
      hint: l('本次最佳一次', 'Best timing this session'),
      icon: Minus,
      color: extremes.min !== null ? diffMsColor(extremes.min) : undefined,
    },
    {
      id: 'max',
      label: l('最慢', 'Latest'),
      value: extremes.max !== null ? formatDiffMs(extremes.max) : '—',
      hint: l('本次最慢一次', 'Latest timing this session'),
      icon: Plus,
      color: extremes.max !== null ? diffMsColor(extremes.max) : undefined,
    },
    {
      id: 'tendency',
      label: l('整体习惯', 'Tendency'),
      value: snap.tendency === 'early' ? l('偏早', 'Early') : snap.tendency === 'late' ? l('偏晚', 'Late') : l('正常', 'Neutral'),
      hint: l('长期偏向早按或晚按', 'Long-term timing bias'),
      icon: TrendingUp,
      color: hasData ? assessmentTendencyColor(snap.tendency) : undefined,
    },
  ];
});

const shootingKpis = computed(() => [
  {
    id: 'avg-error',
    label: l('平均误差', 'Avg. error'),
    value: formatErrorValue(props.snapshot.avgError),
    hint: l('停稳后再开枪的偏移', 'Movement error at shot time'),
    icon: Crosshair,
  },
  {
    id: 'stable',
    label: l('稳定占比', 'Stable rate'),
    value: `${props.snapshot.stableRate.toFixed(1)}%`,
    hint: l('判定为稳定的开枪', 'Shots fired within the accuracy threshold'),
    icon: Target,
    tone: rateTone(props.snapshot.stableRate),
  },
  {
    id: 'count',
    label: l('本局开枪', 'Shots'),
    value: String(shotCount.value),
    hint: l('本次记录的开火次数', 'Shots recorded this session'),
    icon: ChartColumn,
  },
]);
</script>

<template>
  <div class="cs-data-panel space-y-5">
    <!-- 会话概览 -->
    <section
      class="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
      :aria-label="l('本次记录概览', 'Session overview')"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div class="flex min-w-0 items-center gap-3">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-elevated"
            aria-hidden="true"
          >
            <CircleDot
              v-if="isRecording"
              class="h-5 w-5 animate-pulse text-emerald-600"
            />
            <CirclePause
              v-else
              class="h-5 w-5 text-fg-muted"
            />
          </span>
          <div class="min-w-0">
            <p class="text-[14px] font-semibold text-fg">
              {{ isRecording ? l('正在记录', 'Recording') : l('未在记录', 'Not recording') }}
            </p>
            <p class="mt-0.5 text-[12px] text-fg-muted">
              {{
                isRecording
                  ? l('数据实时更新', 'Stats update in real time')
                  : l('在控制台开启记录后，此处将展示统计与趋势', 'Start recording in Console to see stats and trends.')
              }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 items-stretch gap-2 sm:gap-3">
          <div
            class="min-w-22 rounded-xl border border-border-subtle bg-elevated/70 px-3.5 py-2.5 text-center"
          >
            <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
              {{ l('急停样本', 'Counter-strafes') }}
            </p>
            <p class="mt-0.5 text-[20px] font-bold tabular-nums leading-none text-fg">
              {{ assessmentCount }}
            </p>
          </div>
          <div
            class="min-w-22 rounded-xl border border-border-subtle bg-elevated/70 px-3.5 py-2.5 text-center"
          >
            <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
              {{ l('开枪样本', 'Shots') }}
            </p>
            <p class="mt-0.5 text-[20px] font-bold tabular-nums leading-none text-fg">
              {{ shotCount }}
            </p>
          </div>
        </div>
      </div>
      <div
        v-if="snapshot.gsiStatus.enabled"
        class="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle bg-elevated/30 px-5 py-3 text-[11px] text-fg-muted"
      >
        <span class="inline-flex items-center gap-1.5">
          <ShieldCheck class="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          {{ l('数据校验率', 'Validated samples') }}
          <strong class="font-semibold tabular-nums text-fg-secondary">{{ gsiCoverage.toFixed(1) }}%</strong>
        </span>
        <span class="inline-flex items-center gap-1.5">
          <Filter class="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
          {{ l('已过滤', 'Filtered') }}
          <strong class="font-semibold tabular-nums text-fg-secondary">{{ gsiIgnoredTotal }}</strong>
        </span>
        <span v-if="gsiIgnoredReasons.length" class="min-w-0 text-fg-muted">
          {{ gsiIgnoredReasons.map((item) => `${item.label} ${item.value}`).join(' · ') }}
        </span>
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
            <h3 class="text-[15px] font-semibold text-fg">{{ l('急停评估', 'Counter-strafe assessment') }}</h3>
            <span
              v-if="hasAssessmentData"
              class="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-600"
            >
              {{ l(`${assessmentCount} 次`, `${assessmentCount} samples`) }}
            </span>
          </div>
          <p class="mt-0.5 text-[12px] text-fg-muted">
            {{ l('左右、前后切换时，按键时机与理想停稳点的偏差', 'Timing offset from the ideal stop when switching movement direction.') }}
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
            {{ l('最近一次', 'Latest') }}
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
                  {{ assessmentTimingLabel(lastAssessmentRecord) }}
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
              <p class="text-[12px] font-medium text-fg-secondary">{{ l('暂无急停数据', 'No counter-strafe data') }}</p>
              <p class="mt-0.5 text-[11px] text-fg-muted">
                {{ l('开始记录后，每次方向切换的评估会显示在这里', 'Start recording to assess each direction switch.') }}
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
            <p class="text-[11px] font-medium text-fg-muted">{{ l('近 32 次趋势', 'Last 32 counter-strafes') }}</p>
            <p v-if="!hasAssessmentData" class="text-[11px] text-fg-muted">{{ l('等待样本…', 'Waiting for samples…') }}</p>
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
            <h3 class="text-[15px] font-semibold text-fg">{{ l('开枪稳定', 'Shooting stability') }}</h3>
            <span
              v-if="hasShotData"
              class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
            >
              {{ l(`${shotCount} 次`, `${shotCount} shots`) }}
            </span>
          </div>
          <p class="mt-0.5 text-[12px] text-fg-muted">
            {{ l('停稳后再开枪时，移动速度与理想停稳状态的偏差', 'Movement error relative to a fully accurate stop when firing.') }}
          </p>
        </div>
      </header>

      <div class="space-y-3 p-5">
        <div
          class="rounded-xl border border-border-subtle bg-elevated/50 px-4 py-3.5"
          :class="lastShot && lastShotFeedback ? 'min-h-18' : 'min-h-22'"
        >
          <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
            {{ l('最近一次', 'Latest') }}
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
                  {{ shootingStateLabel(lastShot) }}
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
              <p class="text-[12px] font-medium text-fg-secondary">{{ l('暂无开枪数据', 'No shooting data') }}</p>
              <p class="mt-0.5 text-[11px] text-fg-muted">
                {{ l('记录期间每次开火都会计入稳定度分析', 'Every shot fired while recording is included.') }}
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
          <p class="text-[11px] font-medium text-fg-muted">{{ l('近 32 发分布', 'Last 32 shots') }}</p>
          <p v-if="!hasShotData" class="text-[11px] text-fg-muted">{{ l('等待样本…', 'Waiting for samples…') }}</p>
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

</style>
