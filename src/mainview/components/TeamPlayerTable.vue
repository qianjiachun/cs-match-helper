<script setup lang="ts">
import { computed, ref } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import type { MatchPlatformId, MatchPlayer, MatchTeam } from '@core/match/models';
import type { AiEvidenceSnapshot, AiPlayerSignal, AiPlayerSignalKind } from '@core/ai/types';
import { Crown, Crosshair, Eye, Shield, TriangleAlert, Zap } from 'lucide-vue-next';
import type { TeamTableColumnDef } from './team-table-columns';
import PlayerAvatar from './PlayerAvatar.vue';
import PlayerGreenBadge from './PlayerGreenBadge.vue';
import PartyBarIndicator from './PartyBarIndicator.vue';
import PlayerCommentBadge from './comments/PlayerCommentBadge.vue';
import PerfectMapPoolCell from './PerfectMapPoolCell.vue';
import PerfectWeaponCell from './PerfectWeaponCell.vue';
import PerfectRankCell from './PerfectRankCell.vue';
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
import { currentLocale, localize as l } from '../i18n';
import { displayPerspectiveText, sideRelationshipLabel, type AiSide } from '@core/ai/perspective';
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
  playerSignals?: AiPlayerSignal[];
  animatedSignalSteamIds?: string[];
  getCommentCount?: (steamId: string) => number;
  getCommentCountHasMore?: (steamId: string) => boolean;
  currentMap?: string;
  neutral?: boolean;
  title?: string;
  sideToken?: 'A' | 'B';
  selfSide?: AiSide | null;
  statusText?: string;
  waitingProgress?: WaitingProgress;
  platformId?: MatchPlatformId;
}>();

const emit = defineEmits<{
  openComments: [player: MatchPlayer];
  openAiSignal: [signal: AiPlayerSignal];
}>();

const sortKey = ref<TeamTableColumnKey>('seasonRating');
const sortDir = ref<SortDir>('desc');

const sortedPlayers = computed(() =>
  props.neutral
    ? props.team.players
    : sortTeamPlayers(props.team.players, sortKey.value, sortDir.value),
);

const signalBySteamId = computed(() => new Map(
  (props.playerSignals ?? []).map((signal) => [signal.steamId, signal]),
));

const signalAnimationOrder = computed(() => new Map(
  (props.animatedSignalSteamIds ?? []).map((steamId, index) => [steamId, index]),
));

const signalTooltip = ref<{ signal: AiPlayerSignal; left: number; top: number } | null>(null);

function signalLabel(kind: AiPlayerSignalKind): string {
  if (kind === 'carry') return l('强点', 'Carry');
  if (kind === 'anchor') return l('支点', 'Anchor');
  if (kind === 'specialist') return l('专长', 'Specialist');
  if (kind === 'weakLink') return l('短板', 'Weak link');
  if (kind === 'volatile') return l('变量', 'Volatile');
  return l('关注', 'Watch');
}

function signalClass(kind: AiPlayerSignalKind): string {
  if (kind === 'carry') return 'bg-emerald-600 text-white';
  if (kind === 'anchor') return 'bg-blue-600 text-white';
  if (kind === 'specialist') return 'bg-violet-600 text-white';
  if (kind === 'weakLink') return 'bg-rose-600 text-white';
  if (kind === 'volatile') return 'bg-amber-500 text-white';
  return 'bg-slate-600 text-white';
}

function signalRowClass(kind: AiPlayerSignalKind): string {
  return `ai-signal-row ai-signal-row--${kind}`;
}

function signalIcon(kind: AiPlayerSignalKind) {
  if (kind === 'carry') return Crown;
  if (kind === 'anchor') return Shield;
  if (kind === 'specialist') return Crosshair;
  if (kind === 'weakLink') return TriangleAlert;
  if (kind === 'volatile') return Zap;
  return Eye;
}

function signalSweepColor(kind: AiPlayerSignalKind): string {
  if (kind === 'carry') return '16 185 129';
  if (kind === 'anchor') return '59 130 246';
  if (kind === 'specialist') return '139 92 246';
  if (kind === 'weakLink') return '244 63 94';
  if (kind === 'volatile') return '245 158 11';
  return '100 116 139';
}

function formatEvidence(evidence: AiEvidenceSnapshot): string {
  const value = evidence.value ?? (evidence.valueA && evidence.valueB
    ? `${sideRelationshipLabel('A', props.selfSide, currentLocale())} ${evidence.valueA} / ${sideRelationshipLabel('B', props.selfSide, currentLocale())} ${evidence.valueB}`
    : '');
  const sample = evidence.sampleSize != null ? l(` · ${evidence.sampleSize} 场`, ` · ${evidence.sampleSize} matches`) : '';
  return `${evidence.label}${value ? ` ${value}` : ''}${sample}`;
}

function showSignalTooltip(signal: AiPlayerSignal, event: MouseEvent | FocusEvent) {
  const element = event.currentTarget as HTMLElement | null;
  if (!element) return;
  const anchor = element.matches('[data-ai-signal-anchor]')
    ? element
    : element.querySelector<HTMLElement>('[data-ai-signal-anchor]') ?? element;
  const rect = anchor.getBoundingClientRect();
  const width = 320;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const preferredTop = rect.bottom + 8;
  const top = preferredTop + 150 < window.innerHeight ? preferredTop : Math.max(12, rect.top - 158);
  signalTooltip.value = { signal, left, top };
}

function signalForPlayer(player: MatchPlayer): AiPlayerSignal | undefined {
  return signalBySteamId.value.get(player.steamId);
}

function openSignalFromRow(player: MatchPlayer, event?: MouseEvent | KeyboardEvent) {
  const signal = signalForPlayer(player);
  if (!signal) return;
  const target = event?.target as HTMLElement | null;
  if (target?.closest('[data-player-comment-action],button,a,input,select,textarea')) return;
  if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
  event?.preventDefault();
  emit('openAiSignal', signal);
}

function onSignalRowFocus(player: MatchPlayer, event: FocusEvent) {
  if (event.target !== event.currentTarget) return;
  const signal = signalForPlayer(player);
  if (signal) showSignalTooltip(signal, event);
}

function onSignalRowBlur(player: MatchPlayer, event: FocusEvent) {
  if (event.target !== event.currentTarget) return;
  const signal = signalForPlayer(player);
  if (signal) hideSignalTooltip(signal);
}

function hideSignalTooltip(signal: AiPlayerSignal) {
  if (signalTooltip.value?.signal.steamId === signal.steamId) signalTooltip.value = null;
}

const usesPerfectRank = computed(() => props.platformId !== '5e');

const assignmentMotionReady = computed(() => (
  !props.neutral || props.waitingProgress?.phase === 'all-ready'
));

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
    if (col.key === 'peakRank') return sum + 92;
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
  return player.clutch1v1Attempts ?? player.clutch1v1Total;
}

function clutchRateClass(rate?: number): string {
  if (rate == null) return 'text-slate-500';
  if (rate >= 0.6) return 'text-emerald-600';
  if (rate < 0.45) return 'text-rose-500';
  return 'text-slate-700';
}

function clutchTooltip(player: MatchPlayer): string {
  const rate = player.clutchWinRate == null ? '—' : `${Math.round(player.clutchWinRate * 100)}%`;
  return l(
    `全部残局胜率（1vx）：${rate}\n残局获胜：${player.clutchWins ?? '—'}（1v1 ${player.clutch1v1 ?? '—'} / ${player.clutch1v1Total ?? '—'}）`,
    `Overall clutch win rate (1vx): ${rate}\nClutch wins: ${player.clutchWins ?? '—'} (1v1 ${player.clutch1v1 ?? '—'} / ${player.clutch1v1Total ?? '—'})`,
  );
}

function clutch1v1Tooltip(player: MatchPlayer): string {
  const rate = player.clutch1v1Rate == null ? '—' : `${Math.round(player.clutch1v1Rate * 100)}%`;
  const sample = player.clutch1v1Attempts != null
    ? `${player.clutch1v1 ?? 0} ${l('胜', 'wins')} / ${player.clutch1v1Attempts} ${l('局', 'attempts')}`
    : `${player.clutch1v1 ?? '—'} ${l('胜', 'wins')}`;
  return l(`1v1 胜率：${rate}，${sample}`, `1v1 win rate: ${rate}, ${sample}`);
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
    class="shrink-0 rounded-lg transition-shadow duration-300"
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
        <span v-if="sideToken" class="text-[10px] font-semibold text-slate-400">{{ sideToken }}</span>
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
            class="h-1.5 origin-center rounded-xs transition-[background-color,opacity,transform] duration-200 ease-out"
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
            :layout="!neutral"
            :layout-id="assignmentMotionReady ? `perfect-player-${player.steamId}` : undefined"
            :initial="neutral ? false : { opacity: 0, y: 8 }"
            :animate="neutral ? undefined : { opacity: 1, y: 0 }"
            :exit="neutral ? undefined : { opacity: 0, y: -4 }"
            :transition="assignmentMotionReady ? motionTransition() : undefined"
            :data-match-reveal="neutral ? undefined : 'row'"
            class="h-13 border-b border-slate-100/80 transition-colors duration-200 last:border-b-0 group"
            :class="[
              idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white',
              'hover:bg-slate-100/70',
              signalForPlayer(player) ? signalRowClass(signalForPlayer(player)!.kind) : '',
              signalForPlayer(player) ? 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70' : '',
              signalAnimationOrder.has(player.steamId) ? 'ai-signal-row-enter' : '',
            ]"
            :tabindex="signalForPlayer(player) ? 0 : undefined"
            :aria-label="signalForPlayer(player) ? l(`查看 ${displayPlayerNickname(player.nickname)} 的 AI 分析`, `View AI analysis for ${displayPlayerNickname(player.nickname)}`) : undefined"
            :aria-describedby="signalForPlayer(player) ? `ai-signal-tooltip-${player.steamId}` : undefined"
            :style="signalAnimationOrder.has(player.steamId) ? {
              '--ai-signal-delay': `${(signalAnimationOrder.get(player.steamId) ?? 0) * 110}ms`,
              '--ai-signal-rgb': signalSweepColor(signalBySteamId.get(player.steamId)?.kind ?? 'watch'),
            } : undefined"
            @click="openSignalFromRow(player, $event)"
            @keydown="openSignalFromRow(player, $event)"
            @focus="onSignalRowFocus(player, $event)"
            @blur="onSignalRowBlur(player, $event)"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-2 py-1.5"
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
                  <div
                    class="relative shrink-0"
                    data-ai-signal-anchor
                    @mouseenter="signalForPlayer(player) && showSignalTooltip(signalForPlayer(player)!, $event)"
                    @mouseleave="signalForPlayer(player) && hideSignalTooltip(signalForPlayer(player)!)"
                  >
                    <PlayerAvatar
                      :src="player.avatar"
                      :alt="displayPlayerNickname(player.nickname)"
                      size="sm"
                      shape="rounded"
                      class="outline-1 -outline-offset-1 outline-black/10"
                    />
                    <span
                      v-if="signalForPlayer(player)"
                      class="ai-player-signal pointer-events-none absolute -left-0.5 -top-0.5 flex h-3.75 w-3.75 items-center justify-center rounded-sm shadow-[0_1px_3px_rgb(15_23_42/0.2)]"
                      :class="[
                        signalClass(signalForPlayer(player)!.kind),
                        signalAnimationOrder.has(player.steamId) ? 'ai-player-signal-enter' : '',
                      ]"
                      :style="signalAnimationOrder.has(player.steamId) ? { animationDelay: `${(signalAnimationOrder.get(player.steamId) ?? 0) * 110 + 80}ms` } : undefined"
                      aria-hidden="true"
                    >
                      <component :is="signalIcon(signalForPlayer(player)!.kind)" class="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                  </div>
                  <button
                    type="button"
                    data-player-comment-action
                    class="group/name flex min-h-10 min-w-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                    :class="isValidSteamId64(player.steamId) ? '' : 'cursor-default'"
                    :title="isValidSteamId64(player.steamId) ? l(`查看 ${displayPlayerNickname(player.nickname)} 的评论`, `View comments for ${displayPlayerNickname(player.nickname)}`) : player.steamId"
                    @click.stop="onPlayerClick(player)"
                  >
                    <span class="truncate font-medium text-slate-800 transition-colors group-hover/name:text-blue-600">
                      {{ displayPlayerNickname(player.nickname) }}
                    </span>
                    <PlayerGreenBadge :show="player.isGreen" />
                  </button>
                  <span data-player-comment-action @click.stop>
                    <PlayerCommentBadge
                      :steam-id="player.steamId"
                      :count="getCommentCount?.(player.steamId) ?? 0"
                      :count-has-more="getCommentCountHasMore?.(player.steamId) ?? false"
                      @open="emit('openComments', player)"
                    />
                  </span>
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

              <template v-else-if="col.key === 'peakRank'">
                <PerfectRankCell
                  variant="peak"
                  :score="player.peakScore"
                  :stars="player.peakSStars"
                  :season="player.peakSeason"
                />
              </template>

              <template v-else-if="col.key === 'clutchWinRate'">
                <div class="leading-none tabular-nums" :title="clutchTooltip(player)">
                  <div class="text-[13px] font-semibold" :class="clutchRateClass(player.clutchWinRate)">
                    {{ player.clutchWinRate == null ? '—' : `${Math.round(player.clutchWinRate * 100)}%` }}
                  </div>
                </div>
              </template>

              <template v-else-if="col.key === 'clutch1v1Rate'">
                <div class="leading-none tabular-nums" :title="clutch1v1Tooltip(player)">
                  <div class="text-[13px] font-semibold" :class="clutchRateClass(player.clutch1v1Rate)">
                    {{ player.clutch1v1Rate == null ? '—' : `${Math.round(player.clutch1v1Rate * 100)}%` }}
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
                    1v1 {{ player.clutch1v1 ?? 0 }}<template v-if="player.clutch1v1Total != null">/{{ player.clutch1v1Total }}</template><span class="mx-1 text-slate-200">|</span>1v2+ {{ hardClutchWins(player) }}
                  </div>
                </div>
              </template>

              <template v-else-if="col.key === 'recentWins'">
                <div class="flex shrink-0 flex-nowrap items-center justify-center gap-1">
                  <span
                    v-for="(res, i) in getRecentFiveResults(player.recentResults)"
                    :key="i"
                    :class="[
                      'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold',
                      getResultColor(res),
                    ]"
                  >
                    {{ getResultText(res) }}
                  </span>
                </div>
              </template>

              <template v-else-if="col.key === 'score'">
                <PerfectRankCell
                  v-if="usesPerfectRank"
                  :score="player.score"
                  :stars="player.currentSStars"
                  :score-class="accent.score"
                />
                <span v-else class="text-[13px] font-medium" :class="accent.score">
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
            class="h-13 bg-slate-50/45"
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

    <Teleport to="body">
      <Transition name="ai-signal-tooltip">
        <div
          v-if="signalTooltip"
          :id="`ai-signal-tooltip-${signalTooltip.signal.steamId}`"
          role="tooltip"
          class="pointer-events-none fixed z-120 w-80 rounded-lg bg-slate-950 px-3 py-2.5 text-left shadow-[0_12px_30px_rgb(15_23_42/0.24)]"
          :style="{ left: `${signalTooltip.left}px`, top: `${signalTooltip.top}px` }"
        >
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-white">
            <component :is="signalIcon(signalTooltip.signal.kind)" class="h-3.5 w-3.5" aria-hidden="true" />
            {{ signalLabel(signalTooltip.signal.kind) }} · {{ displayPerspectiveText(signalTooltip.signal.title, selfSide, currentLocale()) }}
          </div>
          <p class="mt-1 text-pretty text-[11px] leading-relaxed text-slate-200">{{ displayPerspectiveText(signalTooltip.signal.summary, selfSide, currentLocale()) }}</p>
          <div v-if="signalTooltip.signal.evidence.length" class="mt-2 space-y-1 border-t border-white/10 pt-2">
            <p
              v-for="item in signalTooltip.signal.evidence.slice(0, 2)"
              :key="item.id"
              class="text-[10px] tabular-nums text-slate-400"
            >
              {{ formatEvidence(item) }}
            </p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.ai-player-signal-enter {
  opacity: 0;
  scale: 0.25;
  filter: blur(4px);
  animation: ai-signal-icon-in 300ms cubic-bezier(0.2, 0, 0, 1) forwards;
  will-change: opacity, scale, filter;
}

.ai-signal-row-enter {
  animation: ai-signal-row-sweep 720ms cubic-bezier(0.2, 0, 0, 1) var(--ai-signal-delay, 0ms) both;
}

.ai-signal-row {
  background-color: rgb(var(--ai-signal-rgb) / 0.045);
  transition-property: background-color;
  transition-duration: 180ms;
  transition-timing-function: ease-out;
}

.ai-signal-row:hover,
.ai-signal-row:focus-visible {
  background-color: rgb(var(--ai-signal-rgb) / 0.085);
}

.ai-signal-row--carry { --ai-signal-rgb: 16 185 129; }
.ai-signal-row--anchor { --ai-signal-rgb: 59 130 246; }
.ai-signal-row--specialist { --ai-signal-rgb: 139 92 246; }
.ai-signal-row--weakLink { --ai-signal-rgb: 244 63 94; }
.ai-signal-row--volatile { --ai-signal-rgb: 245 158 11; }
.ai-signal-row--watch { --ai-signal-rgb: 100 116 139; }

.ai-signal-tooltip-enter-active,
.ai-signal-tooltip-leave-active {
  transition: opacity 160ms ease-out, transform 160ms ease-out, filter 160ms ease-out;
}

.ai-signal-tooltip-enter-from,
.ai-signal-tooltip-leave-to {
  opacity: 0;
  transform: translateY(4px);
  filter: blur(4px);
}

@keyframes ai-signal-icon-in {
  to {
    opacity: 1;
    scale: 1;
    filter: blur(0);
  }
}

@keyframes ai-signal-row-sweep {
  0% { box-shadow: inset 0 0 0 999px rgb(var(--ai-signal-rgb, 100 116 139) / 0); }
  38% { box-shadow: inset 0 0 0 999px rgb(var(--ai-signal-rgb, 100 116 139) / 0.1); }
  100% { box-shadow: inset 0 0 0 999px rgb(var(--ai-signal-rgb, 100 116 139) / 0); }
}
</style>
