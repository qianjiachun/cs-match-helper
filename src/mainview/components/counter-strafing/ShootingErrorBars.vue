<script setup lang="ts">
import { computed } from 'vue';
import type { ShootingErrorRecord } from '@core/counter-strafing/types';
import {
  barHeightRatio,
  sampleState,
  sampleStateColor,
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
  },
);

const STROKE_INSET = 1;

const blocks = computed(() => props.records.slice(-props.maxPoints));
const latest = computed(() => blocks.value.at(-1) ?? null);
const latestFeedback = computed(() => (latest.value ? shotFeedback(latest.value) : null));
const hasData = computed(() => blocks.value.length > 0);

const legendItems = [
  { state: 'stable' as const, color: '#4ade80', label: '稳定' },
  { state: 'micro' as const, color: '#fbbf24', label: '微动' },
  { state: 'run' as const, color: '#f87171', label: '跑打' },
];

const chart = computed(() => {
  const data = blocks.value;
  const count = props.maxPoints;
  const gap = props.compact ? 2 : 4;
  const padX = props.compact ? 6 : 10;
  const padY = props.compact ? 6 : 8;
  const width = props.width;
  const height = props.height;
  const innerW = width - padX * 2;
  const blockW = Math.max(3, (innerW - gap * (count - 1)) / count);
  const blockH = height - padY * 2;

  const items = data.map((record, i) => {
    const slot = count - data.length + i;
    const isLatest = i === data.length - 1;
    const w = blockW;
    const h = blockH;
    const x = padX + slot * (blockW + gap);
    const y = padY;
    const state = sampleState(record);
    const isStableHidden = !props.showStableBars && state === 'stable';

    const heightRatio = barHeightRatio(record.speedRatio);
    const barH = h * heightRatio;
    const barY = y + h - barH;

    const isTapFirst =
      !isStableHidden &&
      record.sampleKind === 'fireDown' &&
      (record.shotSequenceIndex ?? 1) === 1 &&
      !record.fireHeld;

    // 稳定余量：柱顶小横线位置（越高余量越大）
    // const marginLineY =
    //   state === 'stable' || state === 'crouchGrace'
    //     ? y + h - (h * THRESHOLD_RATIO * feedback.stabilityPercent) / 100
    //     : null;
    const marginLineY = null;

    return {
      x,
      y,
      w,
      h,
      barY,
      barH,
      marginLineY,
      isLatest,
      isStableHidden,
      state,
      color: sampleStateColor(record),
      isTapFirst,
      opacity: isLatest ? 1 : 0.75,
    };
  });

  const ghostSlots = Array.from({ length: count }, (_, i) => {
    const x = padX + i * (blockW + gap);
    return { x, y: padY, w: blockW, h: blockH };
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
    frameX,
    frameY,
    frameW,
    frameH,
    items,
    ghostSlots,
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
      role="img"
      aria-label="射击稳定度仪表条"
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

      <g v-if="!hasData && !ghost" aria-hidden="true">
        <rect
          v-for="(slot, i) in chart.ghostSlots"
          :key="`ghost-${i}`"
          :x="slot.x"
          :y="slot.y"
          :width="slot.w"
          :height="slot.h"
          fill="rgba(255,255,255,0.02)"
          rx="1"
        />
      </g>

      <g v-for="(block, i) in chart.items" :key="i">
        <rect
          v-if="!block.isStableHidden"
          :x="block.x"
          :y="block.barY"
          :width="block.w"
          :height="block.barH"
          :fill="block.color"
          :opacity="block.opacity"
          rx="1"
          :filter="block.isLatest && ghost ? 'url(#instrument-glow)' : undefined"
        />

        <line
          v-if="block.marginLineY != null"
          :x1="block.x + 1"
          :y1="block.marginLineY"
          :x2="block.x + block.w - 1"
          :y2="block.marginLineY"
          stroke="rgba(255,255,255,0.85)"
          stroke-width="1.5"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />

        <polygon
          v-if="block.isTapFirst"
          :points="`${block.x + block.w / 2},${block.y + block.h + 2} ${block.x + block.w / 2 - 3},${block.y + block.h + 6} ${block.x + block.w / 2 + 3},${block.y + block.h + 6}`"
          fill="white"
          opacity="0.8"
        />
      </g>
    </svg>

    <div
      v-if="!ghost && showLegend"
      class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-1 text-fg-muted"
    >
      <span
        v-for="item in legendItems"
        :key="item.state"
        class="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider"
      >
        <span class="inline-block h-2 w-2 rounded-full" :style="{ background: item.color }" />
        {{ item.label }}
      </span>
      <span class="text-[9px] opacity-70">颜色=稳定状态</span>
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
