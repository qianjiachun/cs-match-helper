<script setup lang="ts">
import { computed } from 'vue';
import { assessmentSegmentPaths } from '@core/counter-strafing/assessmentChartGeometry';
import type { AssessmentChartType, CounterStrafingRecord } from '@core/counter-strafing/types';
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
    chartType?: AssessmentChartType;
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
    chartType: 'line',
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

  const baseLineColor = props.minimal
    ? 'rgba(167,139,250,0.55)'
    : props.ghost
      ? '#A78BFA'
      : 'var(--color-accent)';
  const paths = props.chartType === 'line' ? assessmentSegmentPaths(dots) : [];
  const segments = paths.map((d, i) => ({
    d,
    color: props.colored ? dots[i + 1].color : baseLineColor,
  }));

  return { width, height, padX, padTop, padBottom, innerW, innerH, zeroY, dots, segments };
});

const segmentStroke = computed(
  () =>
    props.lineStrokeWidth ??
    (props.colored ? (isHudMode.value ? 1.25 : 1.5) : props.minimal ? 1 : 2),
);
const segmentOpacity = computed(() => (isHudMode.value ? 0.9 : 1) * props.chartOpacity);
const chartLayerOpacity = computed(() => props.chartOpacity);
const zeroStroke = computed(() =>
  isHudMode.value ? 'rgba(255,255,255,0.18)' : 'rgba(148, 163, 184, 0.42)',
);
const showZeroLine = computed(() => props.colored && (isHudMode.value ? chart.value.dots.length > 0 : true));
const chartAriaLabel = computed(() =>
  props.chartType === 'scatter' ? '急停历史散点图' : '急停历史折线图',
);

function dotRadius(dot: { isLatest: boolean }, total: number): number {
  if (props.chartType === 'scatter') {
    if (dot.isLatest) return isHudMode.value ? 2.75 : 3.25;
    if (total > 24) return isHudMode.value ? 1.75 : 2;
    if (total > 16) return isHudMode.value ? 2 : 2.25;
    return isHudMode.value ? 2.25 : 2.5;
  }
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

function segmentFilter(color: string): string | undefined {
  if (props.colored) return segmentGlow(color);
  return props.ghost && !props.minimal
    ? 'drop-shadow(0 0 6px rgba(124,58,237,0.65))'
    : undefined;
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
      :aria-label="chartAriaLabel"
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
        :style="{ filter: segmentFilter(segment.color) }"
      />
      <circle
        v-if="!minimal || chartType === 'scatter'"
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
