<script setup lang="ts">
import { Activity } from 'lucide-vue-next';
import type { MatchPlayer } from '@core/match/models';

defineProps<{
  player: MatchPlayer;
}>();

function resultClass(r: 'win' | 'lose' | 'draw'): string {
  if (r === 'win') return 'bg-success/80';
  if (r === 'draw') return 'bg-warning/70';
  return 'bg-danger/60';
}
</script>

<template>
  <div v-if="player.recentResults.length > 0" class="space-y-1">
    <p class="flex items-center gap-1 text-[9px] font-medium text-fg-muted">
      <Activity class="h-2.5 w-2.5" />
      近期战绩
    </p>
    <div class="flex flex-wrap gap-0.5">
      <span
        v-for="(r, i) in player.recentResults"
        :key="i"
        class="h-2 w-2 rounded-sm"
        :class="resultClass(r)"
        :title="r === 'win' ? '胜' : r === 'draw' ? '平' : '负'"
      />
    </div>
    <p v-if="player.rating != null" class="text-[10px] text-fg-muted">
      Rating {{ player.rating.toFixed(2) }}
      <span v-if="player.weAvg != null"> · WE {{ player.weAvg.toFixed(1) }}</span>
    </p>
  </div>
</template>
