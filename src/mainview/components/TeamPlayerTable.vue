<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MatchTeam } from '@core/match/models';
import PlayerAvatar from './PlayerAvatar.vue';
import PlayerGreenBadge from './PlayerGreenBadge.vue';
import PartyBarIndicator from './PartyBarIndicator.vue';
import { useCopyFeedback } from '../composables/useCopyFeedback';
import {
  TEAM_TABLE_COL_WIDTHS,
  TEAM_TABLE_COLUMNS,
  buildTroopColorMap,
  buildTroopTeamSizes,
  formatNum,
  formatPct,
  formatMs,
  formatWeAvg,
  getPartyBarInfo,
  getRecentFiveResults,
  getResultColor,
  getResultText,
  kdClass,
  ratingClass,
  sortHeaderClass,
  sortTeamPlayers,
  defaultSortDir,
  weClass,
  type SortDir,
  type TeamTableSortKey,
} from './team-table-shared';

const props = defineProps<{
  team: MatchTeam;
  highlighted?: boolean;
  highlightedSteamId?: string | null;
}>();

const sortKey = ref<TeamTableSortKey>('rating');
const sortDir = ref<SortDir>('desc');

const sortedPlayers = computed(() =>
  sortTeamPlayers(props.team.players, sortKey.value, sortDir.value),
);

const troopTeamSizes = computed(() => buildTroopTeamSizes(props.team.players));
const troopColorMap = computed(() => buildTroopColorMap(props.team.players));

const partyBarByPlayer = computed(() => {
  const players = sortedPlayers.value;
  const colorMap = troopColorMap.value;
  const sizes = troopTeamSizes.value;
  return new Map(
    players.map((p, idx) => [p.steamId, getPartyBarInfo(players, idx, colorMap, sizes)]),
  );
});

function toggleSort(key: TeamTableSortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = defaultSortDir(key);
  }
}

const { copySteamId } = useCopyFeedback();

function onPlayerClick(steamId: string, nickname: string) {
  void copySteamId(steamId, nickname);
}

const accent = props.team.side === 'A'
  ? {
      dot: 'bg-team-a',
      title: 'text-team-a',
      score: 'text-team-a-strong',
    }
  : {
      dot: 'bg-team-b',
      title: 'text-team-b',
      score: 'text-team-b-strong',
    };
</script>

<template>
  <section
    data-match-reveal="team"
    class="shrink-0 rounded-xl transition-all duration-300"
    :class="highlighted ? (team.side === 'A' ? 'ring-2 ring-blue-300/80' : 'ring-2 ring-orange-300/80') : ''"
  >
    <!-- 参考图：标题在表格外，轻量左对齐 -->
    <header class="mb-2 flex items-center gap-1.5 px-0.5">
      <span class="h-2 w-2 shrink-0 rounded-full" :class="accent.dot" />
      <h3 class="text-[14px] font-bold leading-none" :class="accent.title">
        队伍 {{ team.side }}
      </h3>
    </header>

    <div class="overflow-x-auto rounded-lg border border-slate-200/90 bg-white">
      <table class="w-full min-w-[680px] table-fixed text-[13px] text-slate-700">
        <colgroup>
          <col style="width: 1px" />
          <col v-for="(width, i) in TEAM_TABLE_COL_WIDTHS" :key="i" :style="{ width }" />
        </colgroup>

        <thead class="border-b border-slate-100 bg-[#FAFBFC] text-[12px]">
          <tr>
            <th
              v-for="col in TEAM_TABLE_COLUMNS"
              :key="col.key"
              class="cursor-pointer select-none whitespace-nowrap px-2 py-2.5 transition-colors duration-150"
              :class="[
                col.align === 'left' ? 'px-3 text-left' : 'text-center',
                sortHeaderClass(sortKey === col.key),
              ]"
              @click="toggleSort(col.key)"
            >
              <span class="inline-flex items-center gap-0.5" :class="col.align === 'center' ? 'justify-center' : ''">
                {{ col.label }}
                <span
                  v-if="sortKey === col.key"
                  class="text-[10px] text-slate-900"
                  aria-hidden="true"
                >
                  {{ sortDir === 'asc' ? '▲' : '▼' }}
                </span>
              </span>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="(player, idx) in sortedPlayers"
            :key="player.steamId"
            data-match-reveal="row"
            class="border-b border-slate-100/80 transition-colors duration-200 last:border-b-0"
            :class="[
              idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white',
              'hover:bg-slate-100/70',
              highlightedSteamId === player.steamId ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-300' : '',
            ]"
          >
            <td class="relative overflow-visible whitespace-nowrap px-3 py-2.5">
              <PartyBarIndicator
                v-if="partyBarByPlayer.get(player.steamId)?.show"
                :color="partyBarByPlayer.get(player.steamId)!.color!"
                :position="partyBarByPlayer.get(player.steamId)!.position"
                title="组排"
              />
              <button
                type="button"
                class="group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md text-left"
                :title="`点击复制 Steam ID: ${player.steamId}`"
                @click="onPlayerClick(player.steamId, player.nickname)"
              >
                <PlayerAvatar :src="player.avatar" :alt="player.nickname" size="sm" shape="rounded" />
                <span class="truncate font-medium text-slate-800 transition-colors group-hover:text-blue-600">{{ player.nickname }}</span>
                <PlayerGreenBadge :show="player.isGreen" />
              </button>
            </td>
            <td class="px-2 py-2.5 text-center text-[13px] font-medium" :class="accent.score">
              {{ player.score ?? '—' }}
            </td>
            <td class="px-2 py-2.5">
              <div class="flex shrink-0 flex-nowrap items-center justify-center gap-1">
                <span
                  v-for="(res, i) in getRecentFiveResults(player.recentResults)"
                  :key="i"
                  :class="[
                    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm text-[10px] font-bold',
                    getResultColor(res),
                  ]"
                >
                  {{ getResultText(res) }}
                </span>
              </div>
            </td>
            <td class="px-2 py-2.5 text-center text-slate-700">{{ player.adpr ?? '—' }}</td>
            <td class="px-2 py-2.5 text-center" :class="ratingClass(player.rating)">
              {{ formatNum(player.rating, 2) }}
            </td>
            <td class="px-2 py-2.5 text-center" :class="kdClass(player.kd)">
              {{ formatNum(player.kd, 2) }}
            </td>
            <td class="px-2 py-2.5 text-center text-slate-700">{{ formatPct(player.hsRate) }}</td>
            <td class="px-2 py-2.5 text-center text-slate-700">{{ formatPct(player.firstKillSuccessRate) }}</td>
            <td class="px-2 py-2.5 text-center text-slate-700">{{ formatPct(player.rapidStopSuccessRate) }}</td>
            <td class="px-2 py-2.5 text-center text-slate-700">{{ formatMs(player.reactionTime) }}</td>
            <td class="px-3 py-2.5 text-center text-[13px]" :class="weClass(player.weRaw)">
              {{ formatWeAvg(player.weRaw) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
