<script setup lang="ts">
import { computed } from 'vue';
import type { MatchTeam } from '@core/match/models';
import TeamPlayerTable from './TeamPlayerTable.vue';

const props = defineProps<{
  teams: MatchTeam[];
  highlightedSide?: 'A' | 'B' | null;
  highlightedSteamId?: string | null;
}>();

const teamA = computed(() => props.teams.find((t) => t.side === 'A'));
const teamB = computed(() => props.teams.find((t) => t.side === 'B'));
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-4 py-3">
    <TeamPlayerTable
      v-if="teamA"
      :team="teamA"
      :highlighted="highlightedSide === 'A'"
      :highlighted-steam-id="highlightedSteamId"
    />
    <TeamPlayerTable
      v-if="teamB"
      :team="teamB"
      :highlighted="highlightedSide === 'B'"
      :highlighted-steam-id="highlightedSteamId"
    />
  </div>
</template>
