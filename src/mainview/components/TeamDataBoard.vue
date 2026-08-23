<script setup lang="ts">
import { computed } from 'vue';
import type { MatchPlatformId, MatchTeam, MatchPlayer } from '@core/match/models';
import type { AiPlayerSignal } from '@core/ai/types';
import { AnimatePresence, LayoutGroup } from 'motion-v';
import type { TeamTableColumnDef, TeamTableColumnKey } from './team-table-columns';
import TeamPlayerTable from './TeamPlayerTable.vue';
import TeamTableColumnCustomizer from './TeamTableColumnCustomizer.vue';
import { currentLocale, localize as l } from '../i18n';
import { sideRelationshipLabel, type AiSide } from '@core/ai/perspective';

const props = defineProps<{
  teams: MatchTeam[];
  unassigned?: MatchPlayer[];
  mapName?: string;
  readyCount?: number;
  expectedPlayerCount?: number;
  statsLoadedCount?: number;
  sessionPhase?: 'accepting' | 'all-ready' | 'assigned';
  columns: TeamTableColumnDef[];
  visibleKeys: TeamTableColumnKey[];
  customizerItems: TeamTableColumnDef[];
  highlightedSide?: 'A' | 'B' | null;
  playerSignals?: AiPlayerSignal[];
  animatedSignalSteamIds?: string[];
  selfSide?: AiSide | null;
  getCommentCount?: (steamId: string) => number;
  getCommentCountHasMore?: (steamId: string) => boolean;
  platformId?: MatchPlatformId;
}>();

const customizerOpen = defineModel<boolean>('customizerOpen', { default: false });

const emit = defineEmits<{
  toggleColumn: [key: TeamTableColumnKey, visible: boolean];
  setColumnOrder: [order: TeamTableColumnKey[]];
  resetColumns: [];
  openComments: [player: MatchPlayer];
  openAiSignal: [signal: AiPlayerSignal];
}>();

const teamA = computed(() => props.teams.find((t) => t.side === 'A'));
const teamB = computed(() => props.teams.find((t) => t.side === 'B'));
const waitingTeam = computed<MatchTeam | null>(() => {
  const progressive = props.sessionPhase === 'accepting' || props.sessionPhase === 'all-ready';
  if (!progressive && !props.unassigned?.length) return null;
  return {
    side: 'A',
    id: 0,
    players: props.unassigned ?? [],
    singleCount: 0,
    partyGroups: [],
  };
});

const waitingProgress = computed(() => {
  const ready = props.readyCount ?? props.unassigned?.length ?? 0;
  const total = props.expectedPlayerCount ?? 10;
  return {
    ready,
    total,
    statsLoaded: props.statsLoadedCount ?? 0,
    phase: props.sessionPhase === 'all-ready' ? 'all-ready' as const : 'accepting' as const,
  };
});

const waitingTitle = computed(() => props.sessionPhase === 'all-ready'
  ? l('全员已接受', 'All players ready')
  : l('等待玩家接受', 'Waiting for players'));

const waitingStatus = computed(() => {
  const { ready, total } = waitingProgress.value;
  return l(`${ready}/${total} 已接受`, `${ready}/${total} accepted`);
});

function teamTitle(side: AiSide): string {
  return sideRelationshipLabel(side, props.selfSide, currentLocale());
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-4 py-3">
    <LayoutGroup>
    <AnimatePresence :initial="false">
    <TeamPlayerTable
      v-if="waitingTeam"
      key="unassigned"
      :team="waitingTeam"
      :columns="columns"
      :current-map="mapName"
      :platform-id="platformId"
      neutral
      :title="waitingTitle"
      :status-text="waitingStatus"
      :waiting-progress="waitingProgress"
      :get-comment-count="getCommentCount"
      :get-comment-count-has-more="getCommentCountHasMore"
      @open-comments="(player) => emit('openComments', player)"
    />
    <TeamPlayerTable
      v-if="teamA"
      key="team-a"
      :team="teamA"
      :title="teamTitle('A')"
      :side-token="selfSide ? 'A' : undefined"
      :self-side="selfSide"
      :columns="columns"
      :current-map="mapName"
      :platform-id="platformId"
      :highlighted="highlightedSide === 'A'"
      :player-signals="playerSignals"
      :animated-signal-steam-ids="animatedSignalSteamIds"
      :get-comment-count="getCommentCount"
      :get-comment-count-has-more="getCommentCountHasMore"
      @open-comments="(player) => emit('openComments', player)"
      @open-ai-signal="(signal) => emit('openAiSignal', signal)"
    />
    <TeamPlayerTable
      v-if="teamB"
      key="team-b"
      :team="teamB"
      :title="teamTitle('B')"
      :side-token="selfSide ? 'B' : undefined"
      :self-side="selfSide"
      :columns="columns"
      :current-map="mapName"
      :platform-id="platformId"
      :highlighted="highlightedSide === 'B'"
      :player-signals="playerSignals"
      :animated-signal-steam-ids="animatedSignalSteamIds"
      :get-comment-count="getCommentCount"
      :get-comment-count-has-more="getCommentCountHasMore"
      @open-comments="(player) => emit('openComments', player)"
      @open-ai-signal="(signal) => emit('openAiSignal', signal)"
    />
    </AnimatePresence>
    </LayoutGroup>

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
