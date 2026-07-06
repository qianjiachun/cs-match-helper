<script setup lang="ts">
import { computed } from 'vue';
import type { CounterStrafingRecord } from '@core/counter-strafing/types';
import { assessmentRecordColor, ASSESSMENT_COLORS } from '@core/counter-strafing/types';

/** 折线图纵轴上限（ms），超出部分按边界绘制 */
const CHART_DIFF_CLAMP_MS = 100;

const props = withDefaults(
  defineProps<{
    records: CounterStrafingRecord[];
    maxPoints?: number;
    height?: number;
    compact?: boolean;
    ghost?: boolean;
    minimal?: boolean;
    colored?: boolean;
    topInset?: number;
    lineStrokeWidth?: number;
    chartOpacity?: number;
  }>(),
  {
    maxPoints: 40,
    height: 72,
    compact: false,
    ghost: false,
    minimal: false,
    colored: true,
    topInset: 0,
    lineStrokeWidth: undefined,
    chartOpacity: 1,
  },
);

const points = computed(() => props.records.slice(-props.maxPoints));
const isHudMode = computed(() => props.ghost && props.colored);

const chart = computed(() => {
  const data = points.value;
  const width = props.ghost ? 360 : props.compact ? 280 : 560;
  const height = props.height;
  const padX = isHudMode.value ? 2 : props.colored ? 6 : 8;
  const basePadY = isHudMode.value ? 2 : props.colored ? 6 : 8;
  const padTop = basePadY + (props.ghost ? props.topInset : 0);
  const padBottom = basePadY;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  if (data.length === 0) {
    return {
      width,
      height,
      padX,
      padTop,
      padBottom,
      innerW,
      innerH,
      line: '',
      zeroY: padTop + innerH / 2,
      dots: [] as Array<{ x: number; y: number; color: string; isLatest: boolean }>,
      segments: [] as Array<{ d: string; color: string }>,
    };
  }

  const maxAbs = CHART_DIFF_CLAMP_MS;
  const zeroY = padTop + innerH / 2;

  const dots = data.map((r, i) => {
    const x = padX + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const clampedDiff = Math.max(-CHART_DIFF_CLAMP_MS, Math.min(CHART_DIFF_CLAMP_MS, r.diffMs));
    const y = zeroY - (clampedDiff / maxAbs) * (innerH / 2 - 4);
    return { x, y, color: assessmentRecordColor(r), isLatest: i === data.length - 1 };
  });

  const line = dots.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x.toFixed(1)} ${d.y.toFixed(1)}`).join(' ');

  const segments =
    props.colored && dots.length > 1
      ? dots.slice(1).map((dot, i) => ({
          d: `M ${dots[i].x.toFixed(1)} ${dots[i].y.toFixed(1)} L ${dot.x.toFixed(1)} ${dot.y.toFixed(1)}`,
          color: dot.color,
        }))
      : [];

  return { width, height, padX, padTop, padBottom, innerW, innerH, line, zeroY, dots, segments };
});

const segmentStroke = computed(
  () => props.lineStrokeWidth ?? (isHudMode.value ? 1.25 : 1.5),
);
const segmentOpacity = computed(() => (isHudMode.value ? 0.9 : 1) * props.chartOpacity);
const chartLayerOpacity = computed(() => props.chartOpacity);
const zeroStroke = computed(() =>
  isHudMode.value ? 'rgba(255,255,255,0.18)' : 'rgba(148, 163, 184, 0.42)',
);
const showZeroLine = computed(() => props.colored && (isHudMode.value ? chart.value.dots.length > 0 : true));

function dotRadius(dot: { isLatest: boolean }, total: number): number {
  if (props.minimal) return 0;
  if (props.colored) {
    if (dot.isLatest) return isHudMode.value ? 2 : 2.5;
    if (total > 24) return 1;
    if (total > 16) return isHudMode.value ? 1.25 : 1.5;
    return isHudMode.value ? 1.5 : 2;
  }
  if (props.ghost) return 2;
  return 2.75;
}

function dotGlow(dot: { color: string; isLatest: boolean }, total: number): string | undefined {
  if (!props.colored) return props.ghost ? `drop-shadow(0 0 2px ${dot.color}66)` : undefined;
  if (dot.isLatest) {
    return isHudMode.value
      ? `drop-shadow(0 0 3px ${dot.color}99)`
      : `drop-shadow(0 0 2px ${dot.color}88)`;
  }
  if (total <= 16) return `drop-shadow(0 0 1.5px ${dot.color}44)`;
  return undefined;
}

function segmentGlow(color: string): string {
  return isHudMode.value
    ? `drop-shadow(0 0 2px ${color}44)`
    : `drop-shadow(0 0 1.5px ${color}55)`;
}
</script>

<template>
  <div class="relative w-full" :class="ghost ? 'hud-chart h-full' : ''">
    <svg
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      class="block w-full"
      :class="ghost ? 'h-full' : ''"
      :style="[
        ghost ? undefined : { height: `${chart.height}px` },
        { opacity: chartLayerOpacity },
      ]"
      :preserve-aspect-ratio="ghost ? 'none' : undefined"
      role="img"
      aria-label="急停历史折线图"
    >
      <line
        v-if="showZeroLine"
        :x1="chart.padX"
        :y1="chart.zeroY"
        :x2="chart.width - chart.padX"
        :y2="chart.zeroY"
        :stroke="zeroStroke"
        stroke-width="1"
        stroke-dasharray="3 4"
        vector-effect="non-scaling-stroke"
      />
      <line
        v-else-if="!ghost && !minimal && !colored"
        :x1="chart.padX"
        :y1="chart.zeroY"
        :x2="chart.width - chart.padX"
        :y2="chart.zeroY"
        stroke="var(--color-border)"
        stroke-width="1"
        stroke-dasharray="4 3"
      />
      <path
        v-for="(segment, i) in chart.segments"
        :key="`seg-${i}`"
        :d="segment.d"
        fill="none"
        :stroke="segment.color"
        :stroke-width="segmentStroke"
        :stroke-opacity="segmentOpacity"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
        :style="{ filter: segmentGlow(segment.color) }"
      />
      <path
        v-if="chart.line && !colored"
        :d="chart.line"
        fill="none"
        :stroke="minimal ? 'rgba(167,139,250,0.55)' : ghost ? '#A78BFA' : 'var(--color-accent)'"
        :stroke-width="minimal ? 1 : 2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :style="ghost && !minimal ? { filter: 'drop-shadow(0 0 6px rgba(124,58,237,0.65))' } : undefined"
      />
      <circle
        v-if="!minimal"
        v-for="(dot, i) in chart.dots"
        :key="i"
        :cx="dot.x"
        :cy="dot.y"
        :r="dotRadius(dot, chart.dots.length)"
        :fill="dot.color"
        :fill-opacity="isHudMode && !dot.isLatest ? 0.85 : 1"
        vector-effect="non-scaling-stroke"
        :style="{ filter: dotGlow(dot, chart.dots.length) }"
      />
    </svg>
    <div
      v-if="colored && !compact && !ghost"
      class="mt-1 flex justify-between text-[10px] text-fg-muted"
    >
      <span class="inline-flex items-center gap-1">
        <span class="inline-block h-1.5 w-1.5 rounded-full" :style="{ background: ASSESSMENT_COLORS.early }" />
        偏早 ↑
      </span>
      <span>0ms</span>
      <span class="inline-flex items-center gap-1">
        偏晚 ↓
        <span class="inline-block h-1.5 w-1.5 rounded-full" :style="{ background: ASSESSMENT_COLORS.late }" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.hud-chart :deep(svg) {
  overflow: visible;
}
</style>
