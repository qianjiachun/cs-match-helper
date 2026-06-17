<script setup lang="ts">
import { computed } from 'vue';
import type { MatchPlayer } from '@core/match/models';
import PlayerAvatar from './PlayerAvatar.vue';

const props = defineProps<{
  players: MatchPlayer[];
  variant: 'a' | 'b';
}>();

const emit = defineEmits<{
  playerClick: [steamId: string, nickname: string];
}>();

const hoverRingClass = computed(() =>
  props.variant === 'a' ? 'group-hover:ring-blue-200' : 'group-hover:ring-orange-200',
);
const hoverNameClass = computed(() =>
  props.variant === 'a' ? 'group-hover:text-blue-600' : 'group-hover:text-orange-500',
);

function formatElo(score?: number): string {
  return score != null ? String(Math.round(score)) : '—';
}
</script>

<template>
  <div class="team-player-row mb-3 grid w-full grid-cols-5 gap-1">
    <button
      v-for="p in players.slice(0, 5)"
      :key="p.steamId"
      type="button"
      class="group flex min-w-0 cursor-pointer flex-col items-center transition-transform duration-200 hover:-translate-y-1"
      :title="`点击复制 Steam ID: ${p.steamId}`"
      @click="emit('playerClick', p.steamId, p.nickname)"
    >
      <PlayerAvatar
        :src="p.avatar"
        :alt="p.nickname"
        size="md"
        shape="rounded"
        class="shrink-0 ring-2 ring-transparent transition-all"
        :class="hoverRingClass"
      />
      <span
        class="mt-1.5 w-full max-w-[48px] truncate text-center text-[10px] text-slate-600 transition-colors"
        :class="hoverNameClass"
      >
        {{ p.nickname }}
      </span>
      <span class="text-[11px] font-semibold text-slate-800">{{ formatElo(p.score) }}</span>
    </button>
  </div>
</template>
