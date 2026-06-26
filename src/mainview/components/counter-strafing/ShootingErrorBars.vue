<script setup lang="ts">
import { computed } from 'vue';
import type { ShootingErrorRecord } from '@core/counter-strafing/types';
import {
  formatErrorValue,
  formatSampleKind,
  formatSpeedRatio,
  formatStopTiming,
  sampleState,
  sampleStateColor,
  speedMarkerY,
} from '@core/counter-strafing/types';

const props = withDefaults(
  defineProps<{
    records: ShootingErrorRecord[];
    maxPoints?: number;
    height?: number;
    ghost?: boolean;
    compact?: boolean;
    showLegend?: boolean;
  }>(),
  {
    maxPoints: 12,
    height: 88,
    ghost: false,
    compact: false,
    showLegend: false,
  },
);

const blocks = computed(() => props.records.slice(-props.maxPoints));
const latest = computed(() => blocks.value.at(-1) ?? null);
const hasData = computed(() => blocks.value.length > 0);

const legendItems = [
  { state: 'stable' as const, color: '#4ade80', label: '稳定' },
  { state: 'crouchGrace' as const, color: '#22d3ee', label: '蹲起窗口' },
  { state: 'micro' as const, color: '#fbbf24', label: '微动' },
  { state: 'run' as const, color: '#f87171', label: '跑打' },
];

const chart = computed(() => {
  const data = blocks.value;
  const count = props.maxPoints;
  const gap = props.compact ? 3 : 4;
  const padX = props.compact ? 4 : 8;
  const padY = props.compact ? 6 : 8;
  const width = 320;
  const height = props.height;
  const innerW = width - padX * 2;
  const blockW = Math.max(8, (innerW - gap * (count - 1)) / count);
  const blockH = height - padY * 2;

    const items = data.map((record, i) => {
      const slot = count - data.length + i;
      const isLatest = i === data.length - 1;
      const w = blockW;
      const h = blockH;
      const x = padX + slot * (blockW + gap);
      const y = padY;
      const state = sampleState(record);
      
      // Calculate bar height based on speedRatio
      // We want 1.0 to be somewhere in the middle, say 60% up from bottom
      const thresholdRatio = 0.6;
      const thresholdY = y + h * (1 - thresholdRatio);
      
      let barH = 0;
      if (record.speedRatio <= 1.0) {
        // Map 0 -> 1.0 to 0 -> thresholdRatio * h
        // If speedRatio is 0 (perfectly still), it should still be thresholdRatio * h (full green bar up to threshold)
        // If speedRatio is > 0, it drops down slightly from threshold
        const normalizedSpeed = Math.max(0, record.speedRatio);
        // 0 -> thresholdRatio * h
        // 1.0 -> 0 (or close to 0)
        // Wait, the user wants: "在完全停稳的情况下，开枪没有柱子，这样显得不好。我认为应该柱子是顶格的"
        // This means a perfect shot (speedRatio = 0) should have a full bar up to the threshold line.
        // A worse stable shot (speedRatio = 1) should have a smaller bar.
        // Or maybe they just want the bar to be full height up to the threshold when speedRatio <= 1.0?
        // Let's make it so speedRatio=0 is full height up to threshold, speedRatio=1 is also full height up to threshold, or maybe speedRatio=0 is full height, speedRatio=1 is full height?
        // Actually, if it's a stable shot, maybe it should just be a full bar up to the threshold.
        // Let's map it: speedRatio 0 -> thresholdRatio * h. speedRatio 1.0 -> thresholdRatio * h.
        // So any stable shot is a full bar up to the threshold.
        barH = h * thresholdRatio;
      } else {
        // Map 1.0 -> 2.5+ to thresholdRatio * h -> h
        const overRatio = Math.min((record.speedRatio - 1.0) / 1.5, 1.0);
        barH = (h * thresholdRatio) + overRatio * (h * (1 - thresholdRatio));
      }
      
      const barY = y + h - barH;

      const isTapFirst =
        record.sampleKind === 'fireDown' &&
        (record.shotSequenceIndex ?? 1) === 1 &&
        !record.fireHeld;

      return {
        x,
        y,
        w,
        h,
        barY,
        barH,
        thresholdY,
        isLatest,
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

  return { width, height, padX, padY, blockH, innerW, items, ghostSlots };
});
</script>

<template>
  <div class="w-full" :class="ghost ? 'shooting-error-bars--ghost' : ''">
    <svg
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      class="w-full instrument-chart"
      :style="{ height: `${chart.height}px`, minHeight: `${chart.height}px` }"
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
        <linearGradient id="instrument-track" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(248,113,113,0.35)" />
          <stop offset="50%" stop-color="rgba(251,191,36,0.18)" />
          <stop offset="100%" stop-color="rgba(74,222,128,0.12)" />
        </linearGradient>
      </defs>

      <rect
        :x="chart.padX - 1"
        :y="chart.padY - 1"
        :width="chart.innerW + 2"
        :height="chart.blockH + 2"
        fill="transparent"
        :stroke="ghost ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'"
        stroke-width="1"
        rx="4"
      />

      <!-- Threshold Line -->
      <line
        v-if="hasData"
        :x1="chart.padX"
        :y1="chart.items[0]?.thresholdY ?? 0"
        :x2="chart.width - chart.padX"
        :y2="chart.items[0]?.thresholdY ?? 0"
        stroke="rgba(255,255,255,0.2)"
        stroke-width="1"
        stroke-dasharray="4 4"
      />

      <g v-if="!hasData" aria-hidden="true">
        <rect
          v-for="(slot, i) in chart.ghostSlots"
          :key="`ghost-${i}`"
          :x="slot.x"
          :y="slot.y"
          :width="slot.w"
          :height="slot.h"
          fill="rgba(255,255,255,0.02)"
          rx="2"
        />
      </g>

      <g v-for="(block, i) in chart.items" :key="i">
        <!-- Background track -->
        <rect
          :x="block.x"
          :y="block.y"
          :width="block.w"
          :height="block.h"
          fill="rgba(255,255,255,0.03)"
          rx="2"
        />

        <!-- Solid Data Bar -->
        <rect
          :x="block.x"
          :y="block.barY"
          :width="block.w"
          :height="block.barH"
          :fill="block.color"
          :opacity="block.opacity"
          rx="2"
          :filter="block.isLatest && ghost ? 'url(#instrument-glow)' : undefined"
        />

        <!-- Tap indicator -->
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
    </div>
  </div>
</template>

<style scoped>
.hud-stat {
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85);
}

.instrument-chart {
  display: block;
}
</style>
