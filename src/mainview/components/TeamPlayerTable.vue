<script setup lang="ts">
import { computed, ref } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import type { MatchPlayer, MatchTeam } from '@core/match/models';
import type { TeamTableColumnDef } from './team-table-columns';
import PlayerAvatar from './PlayerAvatar.vue';
import PlayerGreenBadge from './PlayerGreenBadge.vue';
import PartyBarIndicator from './PartyBarIndicator.vue';
import PlayerCommentBadge from './comments/PlayerCommentBadge.vue';
import PerfectMapPoolCell from './PerfectMapPoolCell.vue';
import PerfectWeaponCell from './PerfectWeaponCell.vue';
import { isValidSteamId64 } from '@core/comments/steam-id';
import {
  buildTroopColorMap,
  buildTroopTeamSizes,
  cellValueClass,
  formatCellValue,
  getPartyBarInfo,
  getRecentFiveResults,
  getResultColor,
  getResultText,
  sortHeaderClass,
  sortTeamPlayers,
  defaultSortDir,
  type SortDir,
  type TeamTableColumnKey,
} from './team-table-shared';
import { localize as l } from '../i18n';
import { displayPlayerNickname } from '../utils/playerDisplay';

interface WaitingProgress {
  ready: number;
  total: number;
  statsLoaded: number;
  phase: 'accepting' | 'all-ready';
}

const props = defineProps<{
  team: MatchTeam;
  columns: TeamTableColumnDef[];
  highlighted?: boolean;
  highlightedSteamId?: string | null;
  getCommentCount?: (steamId: string) => number;
  getCommentCountHasMore?: (steamId: string) => boolean;
  currentMap?: string;
  neutral?: boolean;
  title?: string;
  statusText?: string;
  waitingProgress?: WaitingProgress;
}>();

const emit = defineEmits<{
  openComments: [player: MatchPlayer];
}>();

const sortKey = ref<TeamTableColumnKey>('seasonRating');
const sortDir = ref<SortDir>('desc');

const sortedPlayers = computed(() =>
  props.neutral
    ? props.team.players
    : sortTeamPlayers(props.team.players, sortKey.value, sortDir.value),
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

const tableMinWidth = computed(() => {
  const base = 208;
  const extra = props.columns.reduce((sum, col) => {
    if (col.key === 'nickname') return sum;
    if (col.key === 'mapPool') return sum + 116;
    if (col.key === 'primaryWeapon') return sum + 142;
    const width = Number.parseInt(col.width, 10);
    return sum + (Number.isNaN(width) ? 82 : Math.max(76, width * 10));
  }, 0);
  return `${base + extra}px`;
});

function toggleSort(key: TeamTableColumnKey) {
  const col = props.columns.find((c) => c.key === key);
  if (!col?.sortable) return;
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = defaultSortDir(key);
  }
}

function onPlayerClick(player: MatchPlayer) {
  if (!isValidSteamId64(player.steamId)) return;
  emit('openComments', player);
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

function shouldShowSkeleton(player: MatchPlayer, key: string): boolean {
  if (player.perfectLoadState?.stats !== 'loading' || key === 'nickname') return false;
  return formatCellValue(key as TeamTableColumnKey, player) === '—' || key === 'mapPool';
}

function motionTransition() {
  return {
    layout: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
    opacity: { duration: 0.18 },
    y: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
  };
}

function clutchAttemptCount(player: MatchPlayer): number | undefined {
  if (player.clutch1v1 == null || player.clutchWinRate == null || player.clutchWinRate <= 0) return undefined;
  return Math.max(player.clutch1v1, Math.round(player.clutch1v1 / player.clutchWinRate));
}

function clutchRateClass(rate?: number): string {
  if (rate == null) return 'text-slate-500';
  if (rate >= 0.6) return 'text-emerald-600';
  if (rate < 0.45) return 'text-rose-500';
  return 'text-slate-700';
}

function clutchTooltip(player: MatchPlayer): string {
  const attempts = clutchAttemptCount(player);
  const rate = player.clutchWinRate == null ? '—' : `${Math.round(player.clutchWinRate * 100)}%`;
  const sample = attempts == null ? `${player.clutch1v1 ?? '—'} ${l('胜', 'wins')}` : `${player.clutch1v1 ?? 0} ${l('胜', 'wins')} / ${attempts} ${l('局', 'attempts')}`;
  return l(
    `1v1 残局：${sample}，胜率 ${rate}\n全部残局胜场：${player.clutchWins ?? '—'}（包含 1v1 至 1v5）`,
    `1v1 clutches: ${sample}, ${rate} win rate\nAll clutch wins: ${player.clutchWins ?? '—'} (1v1 through 1v5)`,
  );
}

function hardClutchWins(player: MatchPlayer): number {
  return (player.clutch1v2 ?? 0) + (player.clutch1v3 ?? 0) + (player.clutch1v4 ?? 0) + (player.clutch1v5 ?? 0);
}

function waitingSegmentClass(index: number): string {
  const progress = props.waitingProgress;
  if (!progress) return 'bg-slate-200/80 opacity-70 scale-y-75';
  if (index < progress.ready) {
    return progress.phase === 'all-ready'
      ? 'bg-emerald-500 opacity-100 scale-y-100'
      : 'bg-sky-500 opacity-100 scale-y-100';
  }
  if (index === progress.ready && progress.phase === 'accepting') {
    return 'bg-sky-300 opacity-100 scale-y-100';
  }
  return 'bg-slate-200/80 opacity-70 scale-y-75';
}

function waitingMetaText(): string {
  const progress = props.waitingProgress;
  if (!progress) return '';
  const data = progress.ready > 0
    ? l(`数据 ${progress.statsLoaded}/${progress.ready}`, `Data ${progress.statsLoaded}/${progress.ready}`)
    : l('等待数据', 'Awaiting data');
  return progress.phase === 'all-ready'
    ? l(`等待分队 · ${data}`, `Assigning teams · ${data}`)
    : data;
}

function waitingRemainingText(): string {
  const progress = props.waitingProgress;
  if (!progress) return '';
  const remaining = Math.max(0, progress.total - progress.ready);
  return l(`还差 ${remaining} 人`, `${remaining} remaining`);
}
</script>

<template>
  <section
    data-match-reveal="team"
    class="shrink-0 rounded-lg transition-[box-shadow] duration-300"
    :class="highlighted ? (team.side === 'A' ? 'ring-2 ring-blue-300/80' : 'ring-2 ring-orange-300/80') : ''"
  >
    <header class="mb-2 px-0.5">
      <div class="flex items-center gap-1.5">
        <span class="relative flex h-2 w-2 shrink-0 items-center justify-center">
          <span
            v-if="waitingProgress?.phase === 'accepting'"
            class="absolute h-3.5 w-3.5 rounded-full ring-1 ring-sky-300/50"
          />
          <span
            class="relative h-2 w-2 rounded-full"
            :class="neutral ? (waitingProgress?.phase === 'all-ready' ? 'bg-emerald-500' : 'bg-sky-500') : accent.dot"
          />
        </span>
        <h3
          class="text-[14px] font-bold leading-none"
          :class="neutral ? (waitingProgress?.phase === 'all-ready' ? 'text-emerald-700' : 'text-slate-700') : accent.title"
        >
          {{ title ?? l(`队伍 ${team.side}`, `Team ${team.side}`) }}
        </h3>
        <span v-if="statusText" class="ml-auto text-[12px] font-medium tabular-nums text-slate-500">{{ statusText }}</span>
      </div>

      <div v-if="waitingProgress" class="mt-2 flex items-center gap-3">
        <div
          class="grid min-w-0 flex-1 gap-1"
          :style="{ gridTemplateColumns: `repeat(${waitingProgress.total}, minmax(0, 1fr))` }"
          role="progressbar"
          :aria-label="l('玩家接受进度', 'Player acceptance progress')"
          aria-valuemin="0"
          :aria-valuemax="waitingProgress.total"
          :aria-valuenow="waitingProgress.ready"
        >
          <span
            v-for="index in waitingProgress.total"
            :key="index"
            class="h-1.5 origin-center rounded-[2px] transition-[background-color,opacity,transform] duration-200 ease-out"
            :class="waitingSegmentClass(index - 1)"
          />
        </div>
        <span class="shrink-0 whitespace-nowrap text-[10px] font-medium tabular-nums text-slate-400">
          {{ waitingMetaText() }}
        </span>
      </div>
    </header>

    <div class="overflow-x-auto rounded-lg border border-slate-200/90 bg-white">
      <table
        class="w-full table-fixed text-[13px] text-slate-700"
        :style="{ minWidth: tableMinWidth }"
      >
        <colgroup>
          <col
            v-for="col in columns"
            :key="col.key"
            :style="col.key === 'nickname' ? { width: '180px' } : { width: col.width }"
          />
        </colgroup>

        <thead class="border-b border-slate-100 bg-[#FAFBFC] text-[12px]">
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              class="select-none whitespace-nowrap px-2 py-2.5 transition-colors duration-150"
              :class="[
                col.sortable ? 'cursor-pointer' : 'cursor-default',
                col.align === 'left' ? 'px-3 text-left' : 'text-center',
                sortHeaderClass(sortKey === col.key),
              ]"
              :title="col.description"
              @click="toggleSort(col.key)"
            >
              <span
                class="inline-flex items-center gap-0.5"
                :class="col.align === 'center' ? 'justify-center' : ''"
              >
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
          <AnimatePresence :initial="false">
          <motion.tr
            v-for="(player, idx) in sortedPlayers"
            :key="player.steamId"
            layout
            :layout-id="`perfect-player-${player.steamId}`"
            :initial="neutral ? false : { opacity: 0, y: 8 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="neutral
              ? { opacity: 1, y: 0 }
              : { opacity: 0, y: -4 }"
            :transition="motionTransition()"
            :data-match-reveal="neutral ? undefined : 'row'"
            class="border-b border-slate-100/80 transition-colors duration-200 last:border-b-0 group"
            :class="[
              idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white',
              'hover:bg-slate-100/70',
              highlightedSteamId === player.steamId ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-300' : '',
            ]"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-2 py-2.5"
              :class="[
                col.align === 'left' && col.key !== 'mapPool' && col.key !== 'primaryWeapon' ? 'px-3' : col.align === 'left' ? 'px-2' : 'text-center',
                col.key === 'nickname' ? 'relative' : '',
              ]"
            >
              <template v-if="col.key === 'nickname'">
                <PartyBarIndicator
                  v-if="partyBarByPlayer.get(player.steamId)?.show"
                  :color="partyBarByPlayer.get(player.steamId)!.color!"
                  :position="partyBarByPlayer.get(player.steamId)!.position"
                  :title="l('组排', 'Party')"
                />
                <div class="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    class="group/name flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent p-0 text-left outline-none focus-visible:outline-none"
                    :class="isValidSteamId64(player.steamId) ? '' : 'cursor-default'"
                    :title="isValidSteamId64(player.steamId) ? l(`查看 ${displayPlayerNickname(player.nickname)} 的评论`, `View comments for ${displayPlayerNickname(player.nickname)}`) : player.steamId"
                    @click="onPlayerClick(player)"
                  >
                    <PlayerAvatar :src="player.avatar" :alt="displayPlayerNickname(player.nickname)" size="sm" shape="rounded" />
                    <span class="truncate font-medium text-slate-800 transition-colors group-hover/name:text-blue-600">
                      {{ displayPlayerNickname(player.nickname) }}
                    </span>
                    <PlayerGreenBadge :show="player.isGreen" />
                  </button>
                  <PlayerCommentBadge
                    :steam-id="player.steamId"
                    :count="getCommentCount?.(player.steamId) ?? 0"
                    :count-has-more="getCommentCountHasMore?.(player.steamId) ?? false"
                    @open="emit('openComments', player)"
                  />
                </div>
              </template>

              <template v-else-if="shouldShowSkeleton(player, col.key)">
                <span class="mx-auto block h-3 w-10 rounded-sm bg-slate-200/80" aria-label="Loading" />
              </template>

              <template v-else-if="col.key === 'mapPool'">
                <PerfectMapPoolCell :player="player" :current-map="currentMap" />
              </template>

              <template v-else-if="col.key === 'abilityProfile'">
                <span
                  class="block truncate text-left text-[12px] font-medium text-slate-600"
                  :title="player.abilityProfile ? `枪法 ${player.abilityProfile.shot?.toFixed(1) ?? '—'} · 胜利 ${player.abilityProfile.victory?.toFixed(1) ?? '—'} · 突破 ${player.abilityProfile.breach?.toFixed(1) ?? '—'} · 狙击 ${player.abilityProfile.snipe?.toFixed(1) ?? '—'} · 道具 ${player.abilityProfile.prop?.toFixed(1) ?? '—'}` : undefined"
                >{{ player.abilityProfile?.summary || '—' }}</span>
              </template>

              <template v-else-if="col.key === 'primaryWeapon'">
                <PerfectWeaponCell :weapons="player.primaryWeapons" />
              </template>

              <template v-else-if="col.key === 'clutchWinRate'">
                <div class="leading-none tabular-nums" :title="clutchTooltip(player)">
                  <div class="text-[13px] font-semibold" :class="clutchRateClass(player.clutchWinRate)">
                    {{ player.clutchWinRate == null ? '—' : `${Math.round(player.clutchWinRate * 100)}%` }}
                  </div>
                  <div v-if="player.clutch1v1 != null" class="mt-1.5 whitespace-nowrap text-[9px] text-slate-400">
                    {{ player.clutch1v1 }}{{ l('胜', 'W') }}<template v-if="clutchAttemptCount(player) != null"> / {{ clutchAttemptCount(player) }}{{ l('局', '') }}</template>
                  </div>
                </div>
              </template>

              <template v-else-if="col.key === 'kad'">
                <span class="whitespace-nowrap tabular-nums text-slate-700">
                  {{ player.kills ?? '—' }}<span class="text-slate-300">/</span>{{ player.assists ?? '—' }}<span class="text-slate-300">/</span>{{ player.deaths ?? '—' }}
                </span>
              </template>

              <template v-else-if="col.key === 'multiKills'">
                <span
                  class="whitespace-nowrap text-[11px] tabular-nums text-slate-600"
                  :title="l(`二杀 ${player.multiKill2 ?? '—'} · 三杀 ${player.multiKill3 ?? '—'} · 四杀 ${player.multiKill4 ?? '—'} · 五杀 ${player.multiKill5 ?? '—'}`, `2K ${player.multiKill2 ?? '—'} · 3K ${player.multiKill3 ?? '—'} · 4K ${player.multiKill4 ?? '—'} · 5K ${player.multiKill5 ?? '—'}`)"
                >
                  3K {{ player.multiKill3 ?? '—' }} · 4K {{ player.multiKill4 ?? '—' }} · 5K {{ player.multiKill5 ?? '—' }}
                </span>
              </template>

              <template v-else-if="col.key === 'clutchWins'">
                <div
                  class="max-h-8 whitespace-nowrap leading-none tabular-nums"
                  :title="l(`1v1 ${player.clutch1v1 ?? '—'} · 1v2 ${player.clutch1v2 ?? '—'} · 1v3 ${player.clutch1v3 ?? '—'} · 1v4 ${player.clutch1v4 ?? '—'} · 1v5 ${player.clutch1v5 ?? '—'}`, `1v1 ${player.clutch1v1 ?? '—'} · 1v2 ${player.clutch1v2 ?? '—'} · 1v3 ${player.clutch1v3 ?? '—'} · 1v4 ${player.clutch1v4 ?? '—'} · 1v5 ${player.clutch1v5 ?? '—'}`)"
                >
                  <div class="text-[12px] font-semibold text-slate-700">
                    {{ player.clutchWins ?? '—' }}<span v-if="player.clutchWins != null" class="ml-0.5 text-[9px] font-medium text-slate-400">{{ l('次获胜', ' wins') }}</span>
                  </div>
                  <div v-if="player.clutchWins != null" class="mt-1 text-[9px] text-slate-400">
                    1v1 {{ player.clutch1v1 ?? 0 }}<span class="mx-1 text-slate-200">|</span>1v2+ {{ hardClutchWins(player) }}
                  </div>
                </div>
              </template>

              <template v-else-if="col.key === 'recentWins'">
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
              </template>

              <template v-else-if="col.key === 'score'">
                <span class="text-[13px] font-medium" :class="accent.score">
                  {{ formatCellValue(col.key, player) }}
                </span>
              </template>

              <template v-else>
                <span :class="cellValueClass(col.key, player)">
                  {{ formatCellValue(col.key, player) }}
                </span>
              </template>
            </td>
          </motion.tr>
          </AnimatePresence>
          <tr
            v-if="waitingProgress?.phase === 'accepting' && waitingProgress.ready < waitingProgress.total"
            class="h-[52px] bg-slate-50/45"
          >
            <td :colspan="columns.length" class="px-3">
              <div class="flex items-center gap-2 text-[11px] text-slate-400">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                <span>{{ l('等待下一位玩家接受', 'Waiting for the next player') }}</span>
                <span class="ml-auto tabular-nums">{{ waitingRemainingText() }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
