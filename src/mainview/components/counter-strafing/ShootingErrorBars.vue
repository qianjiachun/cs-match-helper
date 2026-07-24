<script setup lang="ts">
import { computed } from 'vue';
import type { ShootingErrorRecord } from '@core/counter-strafing/types';
import {
  SHOT_BAR_COLORS,
  shotBarSegments,
  shotFeedback,
} from '@core/counter-strafing/types';

const props = withDefaults(
  defineProps<{
    records: ShootingErrorRecord[];
    maxPoints?: number;
    width?: number;
    height?: number;
    ghost?: boolean;
    compact?: boolean;
    showLegend?: boolean;
    showHudFeedback?: boolean;
    showStableBars?: boolean;
    showTapMarkers?: boolean;
    chartOpacity?: number;
  }>(),
  {
    maxPoints: 12,
    width: 360,
    height: 116,
    ghost: false,
    compact: false,
    showLegend: false,
    showHudFeedback: false,
    showStableBars: true,
    showTapMarkers: true,
    chartOpacity: 1,
  },
);

const STROKE_INSET = 1;

function tapFirstMarkerLayout(barBottom: number, blockW: number, blockH: number) {
  const radius = Math.max(0.85, Math.min(1.8, Math.min(blockW * 0.14, blockH * 0.024)));
  const gap = 0.75;
  return { radius, cy: barBottom + gap + radius };
}

const blocks = computed(() => props.records.slice(-props.maxPoints));
const latest = computed(() => blocks.value.at(-1) ?? null);
const latestFeedback = computed(() => (latest.value ? shotFeedback(latest.value) : null));

const legendItems = [
  { color: SHOT_BAR_COLORS.stable, label: '阈值内' },
  { color: SHOT_BAR_COLORS.micro, label: '微动超阈' },
  { color: SHOT_BAR_COLORS.run, label: '跑打/冲突' },
  { color: SHOT_BAR_COLORS.crouchGrace, label: '蹲起宽限' },
];

const chart = computed(() => {
  const data = blocks.value;
  const count = props.maxPoints;
  const padX = props.compact ? 10 : 14;
  const padY = props.compact ? 6 : 8;
  const width = props.width;
  const height = props.height;
  const innerW = width - padX * 2;
  const blockW = Math.max(0, innerW / count);
  const blockH = height - padY * 2;
  const barBottom = padY + blockH;

  const items = data.map((record, i) => {
    const slot = count - data.length + i;
    const isLatest = i === data.length - 1;
    const x = padX + slot * blockW;
    const y = padY;
    const seg = shotBarSegments(record);
    const isStableHidden = !props.showStableBars && seg.state === 'stable';

    const greenH = seg.greenRatio * blockH;
    const yellowH = seg.yellowRatio * blockH;
    const redH = seg.redRatio * blockH;
    const thresholdY = barBottom - seg.thresholdLineRatio * blockH;

    const greenY = barBottom - greenH;
    const yellowY = barBottom - greenH - yellowH;
    const redY = barBottom - greenH - yellowH - redH;

    const markerCenterX = x + blockW / 2;
    const { radius: markerRadius, cy: markerCy } = tapFirstMarkerLayout(barBottom, blockW, blockH);

    return {
      x,
      y,
      w: blockW,
      h: blockH,
      barBottom,
      thresholdY,
      greenY,
      greenH,
      yellowY,
      yellowH,
      redY,
      redH,
      stableColor: seg.stableColor,
      isLatest,
      isStableHidden,
      isCrouchGrace: seg.isCrouchGrace,
      isTapFirst: props.showTapMarkers && !isStableHidden && seg.isTapFirst,
      markerCenterX,
      markerCy,
      markerRadius,
      showGreen: greenH > 0 && !isStableHidden,
      showYellow: yellowH > 0 && !isStableHidden,
      showRed: redH > 0 && !isStableHidden,
    };
  });

  const frameX = padX - STROKE_INSET;
  const frameY = padY - STROKE_INSET;
  const frameW = innerW + STROKE_INSET * 2;
  const frameH = blockH + STROKE_INSET * 2;

  return {
    width,
    height,
    padX,
    padY,
    blockH,
    innerW,
    barBottom,
    frameX,
    frameY,
    frameW,
    frameH,
    items,
  };
});
</script>

<template>
  <div class="relative w-full h-full" :class="ghost ? 'shooting-error-bars--ghost' : ''">
    <p
      v-if="!ghost && showHudFeedback && latestFeedback"
      class="pointer-events-none absolute top-0 right-1 z-10 font-mono text-[10px] font-semibold tabular-nums text-fg-muted"
      :style="{ color: latestFeedback.color }"
    >
      {{ latestFeedback.shortLabel }}
    </p>

    <svg
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      preserveAspectRatio="none"
      class="w-full h-full instrument-chart"
      :style="{ opacity: chartOpacity }"
      role="img"
      aria-label="射击稳定度直方图"
    >
      <defs>
        <filter id="instrument-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        v-if="!ghost"
        :x="chart.frameX"
        :y="chart.frameY"
        :width="chart.frameW"
        :height="chart.frameH"
        fill="transparent"
        stroke="rgba(255,255,255,0.08)"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        rx="4"
      />

      <g v-for="(block, i) in chart.items" :key="i">
        <line
          v-if="!block.isStableHidden"
          :x1="block.x"
          :y1="block.thresholdY"
          :x2="block.x + block.w"
          :y2="block.thresholdY"
          :stroke="SHOT_BAR_COLORS.threshold"
          stroke-width="1"
          stroke-dasharray="2 2"
          vector-effect="non-scaling-stroke"
        />

        <rect
          v-if="block.showGreen"
          :x="block.x"
          :y="block.greenY"
          :width="block.w"
          :height="block.greenH"
          :fill="block.stableColor"
        />

        <rect
          v-if="block.showYellow"
          :x="block.x"
          :y="block.yellowY"
          :width="block.w"
          :height="block.yellowH"
          :fill="SHOT_BAR_COLORS.micro"
        />

        <rect
          v-if="block.showRed"
          :x="block.x"
          :y="block.redY"
          :width="block.w"
          :height="block.redH"
          :fill="SHOT_BAR_COLORS.run"
          :filter="block.isLatest && ghost ? 'url(#instrument-glow)' : undefined"
        />

        <circle
          v-if="block.isTapFirst"
          :cx="block.markerCenterX"
          :cy="block.markerCy"
          :r="block.markerRadius"
          fill="white"
          opacity="0.92"
        />
      </g>
    </svg>

    <div
      v-if="!ghost && showLegend"
      class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-1 text-fg-muted"
    >
      <span
        v-for="item in legendItems"
        :key="item.label"
        class="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider"
      >
        <span class="inline-block h-2 w-2 rounded-full" :style="{ background: item.color }" />
        {{ item.label }}
      </span>
      <span class="text-[9px] opacity-70">柱高=移动误差，自下而上堆叠</span>
    </div>
  </div>
</template>

<style scoped>
.hud-stat {
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85);
}

.instrument-chart {
  display: block;
  overflow: visible;
}
</style>
