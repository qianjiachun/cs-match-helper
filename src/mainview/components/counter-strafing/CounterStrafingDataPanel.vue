<script setup lang="ts">
import { computed } from 'vue';
import CounterStrafingLineChart from './CounterStrafingLineChart.vue';
import ShootingErrorBars from './ShootingErrorBars.vue';
import SettingsCard from '../settings/SettingsCard.vue';
import type {
  CounterStrafingAssessmentRecord,
  CounterStrafingAssessmentSnapshot,
  CounterStrafingSnapshot,
  ShootingErrorRecord,
} from '@core/counter-strafing/types';
import {
  assessmentRecordColor,
  formatDiffMs,
  formatErrorValue,
  formatSpeedRatio,
  sampleStateColor,
  shotFeedback,
} from '@core/counter-strafing/types';
import { ChartColumn, LineChart } from 'lucide-vue-next';

const props = defineProps<{
  snapshot: CounterStrafingSnapshot;
  assessmentSnapshot: CounterStrafingAssessmentSnapshot;
  lastShot: ShootingErrorRecord | null;
  lastAssessmentRecord: CounterStrafingAssessmentRecord | null;
}>();

const lastShotFeedback = computed(() =>
  props.lastShot ? shotFeedback(props.lastShot) : null,
);

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
</script>

<template>
  <div class="space-y-5">
    <SettingsCard title="急停评估" description="左右、前后切换时，你的按键时机好不好" :icon="LineChart">
      <div
        class="flex min-h-[72px] flex-col items-center justify-center rounded-xl border border-border-subtle bg-elevated/60 px-4 py-5"
      >
        <template v-if="lastAssessmentRecord">
          <p
            class="text-[28px] font-bold tabular-nums"
            :style="{ color: assessmentRecordColor(lastAssessmentRecord) }"
          >
            {{ formatDiffMs(lastAssessmentRecord.diffMs) }}
          </p>
          <p class="mt-1 text-[13px] text-fg-secondary">
            {{ lastAssessmentRecord.fromKey }} → {{ lastAssessmentRecord.toKey }} ·
            {{ lastAssessmentRecord.timingLabel }}
          </p>
        </template>
        <p v-else class="text-center text-[13px] leading-relaxed text-fg-muted">
          在控制台点「开始记录」后，这里会显示你最近一次急停表现
        </p>
      </div>
      <CounterStrafingLineChart
        :records="assessmentSnapshot.records"
        :max-points="32"
        :height="104"
        colored
        class="mt-4"
      />
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">平均快慢</p>
          <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
            {{ formatDiffMs(assessmentSnapshot.avgDiffMs) }}
          </p>
        </div>
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">表现不错占比</p>
          <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
            {{ assessmentSnapshot.successRate.toFixed(1) }}<span class="text-[12px] font-medium text-fg-muted">%</span>
          </p>
        </div>
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">波动大小</p>
          <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
            {{ assessmentSnapshot.stdDevMs.toFixed(1) }}<span class="text-[12px] font-medium text-fg-muted">ms</span>
          </p>
        </div>
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">最快一次</p>
          <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
            {{ assessmentDiffExtremes.min !== null ? formatDiffMs(assessmentDiffExtremes.min) : '—' }}
          </p>
        </div>
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">最慢一次</p>
          <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
            {{ assessmentDiffExtremes.max !== null ? formatDiffMs(assessmentDiffExtremes.max) : '—' }}
          </p>
        </div>
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">整体习惯</p>
          <p class="mt-1 text-[15px] font-semibold text-fg">{{ assessmentSnapshot.tendencyLabel }}</p>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard title="开枪稳定" description="停稳再开枪时，你的准星稳不稳" :icon="ChartColumn">
      <div
        v-if="lastShot && lastShotFeedback"
        class="mb-4 flex min-h-[56px] flex-col items-center justify-center rounded-xl border border-border-subtle bg-elevated/60 px-4 py-4"
      >
        <p
          class="text-[24px] font-bold tabular-nums text-fg"
          :style="{ color: sampleStateColor(lastShot) }"
        >
          {{ formatSpeedRatio(lastShot) }}
        </p>
        <p
          class="mt-1 font-mono text-[15px] font-semibold tabular-nums"
          :style="{ color: lastShotFeedback.color }"
        >
          {{ lastShotFeedback.shortLabel }}
        </p>
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
      <div class="mt-4 grid grid-cols-3 gap-3">
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">平均误差</p>
          <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
            {{ formatErrorValue(snapshot.avgError) }}
          </p>
        </div>
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">稳定占比</p>
          <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
            {{ snapshot.stableRate.toFixed(1) }}<span class="text-[12px] font-medium text-fg-muted">%</span>
          </p>
        </div>
        <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
          <p class="text-[11px] text-fg-muted">最近一枪</p>
          <p class="mt-1 text-[15px] font-semibold text-fg">{{ lastShot?.scoreLabel ?? '—' }}</p>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>
