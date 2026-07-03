<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Grip } from 'lucide-vue-next';
import ShootingErrorBars from '../components/counter-strafing/ShootingErrorBars.vue';
import {
  getCounterStrafingSnapshot,
  onCounterStrafingShot,
  onCounterStrafingSnapshot,
  onCounterStrafingStatus,
} from '@core/counter-strafing/native';
import type { CounterStrafingSnapshot, ShootingErrorRecord } from '@core/counter-strafing/types';
import { formatErrorValue } from '@core/counter-strafing/types';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useHudWindow, onHudDragPointerDown } from './useHudWindow';
import {
  shootingHudStatsVisibility,
  useHudChartStatsVisibility,
} from './useHudChartStatsVisibility';

const DEFAULT_CHART_HEIGHT = 88;
const DEFAULT_CHART_WIDTH = 320;
const HUD_HISTORY_LIMIT = 64;

function createRafCoalescer<T>(apply: (value: T) => void) {
  let pending: T | null = null;
  let rafId: number | null = null;

  const schedule = (value: T) => {
    pending = value;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (pending !== null) {
        apply(pending);
        pending = null;
      }
    });
  };

  const flush = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (pending !== null) {
      apply(pending);
      pending = null;
    }
  };

  return { schedule, flush };
}

function trimHistory<T>(records: T[], limit: number): T[] {
  if (records.length <= limit) return records;
  return records.slice(records.length - limit);
}

const snapshot = ref<CounterStrafingSnapshot>({
  active: false,
  listening: false,
  hudVisible: true,
  hudLocked: false,
  hudShowStableBars: true,
  shotRecords: [],
  avgError: 0,
  stableRate: 0,
  lastShot: null,
  fireActive: false,
});
const liveSample = ref<ShootingErrorRecord | null>(null);
const initError = ref<string | null>(null);
const chartHeight = ref(DEFAULT_CHART_HEIGHT);
const chartWidth = ref(DEFAULT_CHART_WIDTH);
const chartWrapRef = ref<HTMLElement | null>(null);
const hudRootRef = ref<HTMLElement | null>(null);
const statsVisibility = useHudChartStatsVisibility(hudRootRef, shootingHudStatsVisibility);

let unlisteners: UnlistenFn[] = [];
let resizeObserver: ResizeObserver | null = null;
let flushSnapshotRaf: (() => void) | null = null;

useHudWindow();

function stableRateColor(rate: number): string {
  if (rate >= 70) return '#4ade80';
  if (rate >= 40) return '#fbbf24';
  return '#f87171';
}

function errorColor(error: number): string {
  if (error <= 0.15) return '#4ade80';
  if (error <= 0.35) return '#fbbf24';
  return '#f87171';
}

onMounted(async () => {
  if (chartWrapRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chartWidth.value = width;
          chartHeight.value = height;
        }
      }
    });
    resizeObserver.observe(chartWrapRef.value);
  }

  try {
    snapshot.value = await getCounterStrafingSnapshot();
    if (snapshot.value.lastShot) {
      liveSample.value = snapshot.value.lastShot;
    }
    const snapshotRaf = createRafCoalescer<CounterStrafingSnapshot>((next) => {
      snapshot.value = next;
    });
    flushSnapshotRaf = snapshotRaf.flush;

    unlisteners = await Promise.all([
      onCounterStrafingShot((record) => {
        liveSample.value = record;
        const records = trimHistory([...snapshot.value.shotRecords, record], HUD_HISTORY_LIMIT);
        snapshot.value = {
          ...snapshot.value,
          shotRecords: records,
          lastShot: record,
        };
      }),
      onCounterStrafingSnapshot((next) => {
        snapshotRaf.schedule(next);
      }),
      onCounterStrafingStatus((next) => {
        snapshotRaf.schedule(next);
      }),
    ]);
  } catch (e) {
    initError.value = e instanceof Error ? e.message : 'HUD 初始化失败';
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  flushSnapshotRaf?.();
  void Promise.all(unlisteners.map((fn) => fn()));
});
</script>

<template>
  <div
    ref="hudRootRef"
    class="hud-root group/hud relative h-full w-full select-none"
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
      class="hud-error pointer-events-none relative z-1 flex h-full items-center justify-center px-4 text-center"
    >
      <p class="hud-stat text-[11px] leading-relaxed text-rose-200/90">{{ initError }}</p>
    </div>

    <div
      v-else
      class="hud-layout pointer-events-none relative z-1 flex h-full flex-col gap-0.5 overflow-hidden px-2 py-1.5"
    >
      <div v-if="statsVisibility.showBar" class="hud-shooting-stats shrink-0">
        <div v-if="statsVisibility.showError" class="hud-shooting-stat">
          <span class="hud-shooting-stat-label">误差</span>
          <span
            class="hud-shooting-stat-value tabular-nums"
            :style="{ color: snapshot.shotRecords.length ? errorColor(snapshot.avgError) : undefined }"
          >
            {{ snapshot.shotRecords.length ? formatErrorValue(snapshot.avgError) : '—' }}
          </span>
        </div>
        <div v-if="statsVisibility.showStable" class="hud-shooting-stat">
          <span class="hud-shooting-stat-label">稳定</span>
          <span
            class="hud-shooting-stat-value tabular-nums"
            :style="{ color: snapshot.shotRecords.length ? stableRateColor(snapshot.stableRate) : undefined }"
          >
            {{ snapshot.shotRecords.length ? `${snapshot.stableRate.toFixed(1)}%` : '—' }}
          </span>
        </div>
      </div>
      <div ref="chartWrapRef" class="hud-chart-wrap min-h-0 w-full flex-1">
        <ShootingErrorBars
          :records="snapshot.shotRecords"
          :max-points="32"
          :width="chartWidth"
          :height="chartHeight"
          :show-stable-bars="snapshot.hudShowStableBars"
          ghost
          compact
          class="h-full w-full"
        />
      </div>
    </div>
  </div>
</template>
