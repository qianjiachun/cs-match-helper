<script setup lang="ts">
import { computed } from 'vue';
import { RADAR_LABELS } from '@core/match/insights';
import type { MatchPlayer } from '@core/match/models';

const props = defineProps<{
  player: MatchPlayer;
}>();

const dimensions = computed(() =>
  Object.entries(RADAR_LABELS)
    .map(([key, label]) => {
      const dim = props.player.radar[key];
      if (!dim) return null;
      return { key, label, score: dim.score, level: dim.level };
    })
    .filter((d): d is NonNullable<typeof d> => d != null),
);

function barColor(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-accent';
  if (score >= 40) return 'bg-warning';
  return 'bg-fg-muted';
}
</script>

<template>
  <div v-if="dimensions.length > 0" class="grid grid-cols-2 gap-x-3 gap-y-1">
    <div v-for="dim in dimensions" :key="dim.key" class="flex items-center gap-1.5">
      <span class="w-7 shrink-0 text-[9px] text-fg-muted">{{ dim.label }}</span>
      <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-base">
        <div
          class="h-full rounded-full transition-all"
          :class="barColor(dim.score)"
          :style="{ width: `${Math.min(100, dim.score)}%` }"
        />
      </div>
      <span class="w-5 shrink-0 text-right text-[9px] font-medium text-fg-secondary">
        {{ dim.level ?? dim.score }}
      </span>
    </div>
  </div>
</template>
