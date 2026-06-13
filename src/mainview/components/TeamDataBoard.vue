<script setup lang="ts">
import { computed } from 'vue';
import type { MatchTeam } from '@core/match/models';
import type { TeamTableColumnDef, TeamTableColumnKey } from './team-table-columns';
import TeamPlayerTable from './TeamPlayerTable.vue';
import TeamTableColumnCustomizer from './TeamTableColumnCustomizer.vue';

const props = defineProps<{
  teams: MatchTeam[];
  columns: TeamTableColumnDef[];
  visibleKeys: TeamTableColumnKey[];
  customizerItems: TeamTableColumnDef[];
  highlightedSide?: 'A' | 'B' | null;
  highlightedSteamId?: string | null;
}>();

const customizerOpen = defineModel<boolean>('customizerOpen', { default: false });

const emit = defineEmits<{
  toggleColumn: [key: TeamTableColumnKey, visible: boolean];
  setColumnOrder: [order: TeamTableColumnKey[]];
  resetColumns: [];
}>();

const teamA = computed(() => props.teams.find((t) => t.side === 'A'));
const teamB = computed(() => props.teams.find((t) => t.side === 'B'));
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-4 py-3">
    <TeamPlayerTable
      v-if="teamA"
      :team="teamA"
      :columns="columns"
      :highlighted="highlightedSide === 'A'"
      :highlighted-steam-id="highlightedSteamId"
    />
    <TeamPlayerTable
      v-if="teamB"
      :team="teamB"
      :columns="columns"
      :highlighted="highlightedSide === 'B'"
      :highlighted-steam-id="highlightedSteamId"
    />

    <TeamTableColumnCustomizer
      :open="customizerOpen"
      :items="customizerItems"
      :visible-keys="visibleKeys"
      @close="customizerOpen = false"
      @toggle="(key, visible) => emit('toggleColumn', key, visible)"
      @set-order="(order) => emit('setColumnOrder', order)"
      @reset="emit('resetColumns')"
    />
  </div>
</template>
