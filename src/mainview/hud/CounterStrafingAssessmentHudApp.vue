<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Grip } from 'lucide-vue-next';
import CounterStrafingCombo from '../components/counter-strafing/CounterStrafingCombo.vue';
import CounterStrafingLineChart from '../components/counter-strafing/CounterStrafingLineChart.vue';
import {
  getCounterStrafingAssessmentSnapshot,
  onCounterStrafingAssessmentRecord,
  onCounterStrafingAssessmentSnapshot,
} from '@core/counter-strafing/native';
import type {
  CounterStrafingAssessmentRecord,
  CounterStrafingAssessmentSnapshot,
} from '@core/counter-strafing/types';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useAssessmentHudWindow } from './useAssessmentHudWindow';
import { onHudDragPointerDown } from './useHudWindow';

const snapshot = ref<CounterStrafingAssessmentSnapshot>({
  active: false,
  listening: false,
  hudVisible: true,
  hudLocked: false,
  records: [],
  avgDiffMs: 0,
  successRate: 0,
  stdDevMs: 0,
  tendency: 'normal',
  tendencyLabel: '正常',
  lastRecord: null,
});
const liveRecord = ref<CounterStrafingAssessmentRecord | null>(null);
const initError = ref<string | null>(null);
const chartHeight = ref(120);
const chartWrapRef = ref<HTMLElement | null>(null);

let unlisteners: UnlistenFn[] = [];
let resizeObserver: ResizeObserver | null = null;

useAssessmentHudWindow();

function successRateColor(rate: number): string {
  if (rate >= 70) return '#4ade80';
  if (rate >= 40) return '#fbbf24';
  return '#f87171';
}

function avgDiffColor(avgDiffMs: number): string {
  if (avgDiffMs < -5) return '#fbbf24';
  if (avgDiffMs > 5) return '#f87171';
  return '#4ade80';
}

function stdDevColor(stdDevMs: number): string {
  if (stdDevMs <= 3) return '#4ade80';
  if (stdDevMs <= 8) return '#fbbf24';
  return '#f87171';
}

function tendencyColor(tendency: string): string {
  if (tendency === 'early') return '#fbbf24';
  if (tendency === 'late') return '#f87171';
  return '#4ade80';
}

function formatHudDiffMs(diffMs: number): string {
  const rounded = Math.round(diffMs);
  return `${rounded > 0 ? '+' : ''}${rounded}ms`;
}

function formatHudStdDevMs(stdDevMs: number): string {
  return `${Math.round(stdDevMs)}ms`;
}

onMounted(async () => {
  if (chartWrapRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { height } = entry.contentRect;
        if (height > 0) {
          chartHeight.value = height;
        }
      }
    });
    resizeObserver.observe(chartWrapRef.value);
  }

  try {
    snapshot.value = await getCounterStrafingAssessmentSnapshot();
    if (snapshot.value.lastRecord) {
      liveRecord.value = snapshot.value.lastRecord;
    }
    unlisteners = await Promise.all([
      onCounterStrafingAssessmentRecord((record) => {
        liveRecord.value = record;
      }),
      onCounterStrafingAssessmentSnapshot((next) => {
        snapshot.value = next;
      }),
    ]);
  } catch (e) {
    initError.value = e instanceof Error ? e.message : '急停评估 HUD 初始化失败';
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  void Promise.all(unlisteners.map((fn) => fn()));
});
</script>

<template>
  <div
    class="hud-root group/hud relative h-full min-h-[80px] min-w-[260px] w-full select-none"
    :class="snapshot.hudLocked ? 'pointer-events-none' : ''"
  >
    <div class="hud-frame pointer-events-none absolute inset-0 z-10" aria-hidden="true" />

    <div
      v-if="!snapshot.hudLocked"
      class="hud-drag-handle absolute right-0 bottom-0 z-20 flex h-8 w-8 cursor-grab items-center justify-center rounded-tl-xl bg-black/40 backdrop-blur-sm active:cursor-grabbing opacity-0 transition-opacity duration-200 group-hover/hud:opacity-100"
      aria-label="拖动 HUD"
      @pointerdown="onHudDragPointerDown"
    >
      <Grip class="h-4 w-4 text-white/80" aria-hidden="true" />
    </div>

    <div
      v-if="initError"
      class="hud-error pointer-events-none relative z-1 flex h-full min-h-[80px] items-center justify-center px-4 text-center"
    >
      <p class="hud-stat text-[11px] leading-relaxed text-rose-200/90">{{ initError }}</p>
    </div>

    <div
      v-else
      class="hud-layout pointer-events-none absolute inset-0 z-1 flex flex-col gap-0.5 px-2 py-1.5"
    >
      <div class="hud-assessment-stats shrink-0">
        <div class="hud-assessment-stats-main">
          <div class="hud-shooting-stat">
            <span class="hud-shooting-stat-label">平均</span>
            <span
              class="hud-shooting-stat-value tabular-nums"
              :style="{ color: snapshot.records.length ? avgDiffColor(snapshot.avgDiffMs) : undefined }"
            >
              {{ snapshot.records.length ? formatHudDiffMs(snapshot.avgDiffMs) : '—' }}
            </span>
          </div>
          <div class="hud-shooting-stat">
            <span class="hud-shooting-stat-label">优秀率</span>
            <span
              class="hud-shooting-stat-value tabular-nums"
              :style="{ color: snapshot.records.length ? successRateColor(snapshot.successRate) : undefined }"
            >
              {{ snapshot.records.length ? `${snapshot.successRate.toFixed(1)}%` : '—' }}
            </span>
          </div>
          <div class="hud-shooting-stat">
            <span class="hud-shooting-stat-label">标准差</span>
            <span
              class="hud-shooting-stat-value tabular-nums"
              :style="{ color: snapshot.records.length ? stdDevColor(snapshot.stdDevMs) : undefined }"
            >
              {{ snapshot.records.length ? formatHudStdDevMs(snapshot.stdDevMs) : '—' }}
            </span>
          </div>
        </div>
        <span
          class="hud-assessment-tendency hud-shooting-stat-value shrink-0 tabular-nums"
          :style="{ color: snapshot.records.length ? tendencyColor(snapshot.tendency) : undefined }"
        >
          {{ snapshot.records.length ? snapshot.tendencyLabel : '—' }}
        </span>
      </div>
      <div ref="chartWrapRef" class="assessment-hud-chart relative min-h-0 w-full flex-1">
        <CounterStrafingLineChart
          :records="snapshot.records"
          :max-points="32"
          :height="chartHeight"
          ghost
          colored
          compact
          class="h-full w-full"
        />
        <div class="assessment-hud-combo pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <CounterStrafingCombo :record="liveRecord" variant="hud" />
        </div>
      </div>
    </div>
  </div>
</template>
