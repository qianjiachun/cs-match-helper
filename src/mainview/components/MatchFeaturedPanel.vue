<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Clock, Table2, GitCompareArrows, Columns3 } from 'lucide-vue-next';
import AiSparklesIcon from './AiSparklesIcon.vue';
import PlatformLogo from './PlatformLogo.vue';
import type { MatchRecord, MatchPlayer } from '@core/match/models';
import { isAiAnalysisActive, type AiPlayerSignal } from '@core/ai/types';
import { isPerfectAiAnalysisReady } from '@core/ai/perfect-readiness';
import { formatAiWinnerCapsule } from '@core/ai/display';
import type { useAiAnalysis } from '../composables/useAiAnalysis';
import type { useComments } from '../composables/useComments';
import { useMatchCountdown } from '../composables/useMatchCountdown';
import { useMatchHeaderMetaCompaction } from '../composables/useMatchHeaderMetaCompaction';
import { useMatchRevealAnimation } from '../composables/useMatchRevealAnimation';
import { useTeamTableColumns } from '../composables/useTeamTableColumns';
import AiAnalysisPanel from './AiAnalysisPanel.vue';
import TeamDataBoard from './TeamDataBoard.vue';
import TeamCompareBoard from './TeamCompareBoard.vue';
import { currentLocale, localize as l } from '../i18n';
import { resolveCanonicalMapName } from '@core/match/history/map-assets';
import { shouldReplayMatchReveal } from '../utils/match-reveal-policy';
import { buildAiInputFingerprint } from '@core/ai/analysis-v2';
import { resolveSelfSide, sideRelationshipLabel, type AiSide } from '@core/ai/perspective';

const props = defineProps<{
  match: MatchRecord;
  ai: ReturnType<typeof useAiAnalysis>;
  comments: ReturnType<typeof useComments>;
  active?: boolean;
  /** 历史回看：不触发 AI、不显示准备倒计时 */
  historyMode?: boolean;
  viewerSteamId?: string;
}>();

const emit = defineEmits<{
  openSettings: [];
}>();

const isHistory = computed(() => Boolean(props.historyMode));
const isActiveLivePanel = computed(() => !isHistory.value && props.active !== false);
/** 设置页打开期间错过的自动分析，返回主页时再补跑；无数据变化则不重跑 */
let deferredLiveAnalyze = false;

function queueOrRunLiveAnalyze(run: () => void) {
  if (!isActiveLivePanel.value) {
    deferredLiveAnalyze = true;
    return;
  }
  run();
}

const panelRoot = ref<HTMLElement | null>(null);
const { playReveal } = useMatchRevealAnimation(panelRoot);

const detail = computed(() => props.match.detail);
const teams = computed(() => detail.value.teams || []);
const platformId = computed(() => props.match.platformId ?? detail.value.platformId ?? 'perfect');
const selfSide = computed(() => resolveSelfSide(props.match, props.viewerSteamId));

function sideLabel(side: AiSide): string {
  return sideRelationshipLabel(side, selfSide.value, currentLocale());
}

const {
  visibleColumns,
  visibleKeys,
  customizerItems,
  setVisible,
  setColumnOrder,
  resetColumns,
} = useTeamTableColumns(platformId);

const columnCustomizerOpen = ref(false);

const mapName = computed(() => {
  const raw = detail.value.mapName || props.match.summary.mapName;
  if (!raw) return l('未知地图', 'Unknown map');
  return resolveCanonicalMapName(raw) ?? raw;
});

const teamA = computed(() => teams.value.find((t) => t.side === 'A'));
const teamB = computed(() => teams.value.find((t) => t.side === 'B'));

function teamAvgElo(team: typeof teamA.value): number | null {
  if (!team) return null;
  if (team.avgScore != null) return Math.round(team.avgScore);
  const scores = team.players.map((p) => p.score).filter((s): s is number => s != null && s > 0);
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

const teamEloCompare = computed(() => {
  const a = teamAvgElo(teamA.value);
  const b = teamAvgElo(teamB.value);
  if (a == null || b == null) return null;
  const diff = Math.abs(a - b);
  const leader = a > b ? 'A' as const : b > a ? 'B' as const : null;
  return { a, b, diff, leader };
});

function avgFromPlayers(players: MatchPlayer[], pick: (p: MatchPlayer) => number | undefined): number | null {
  const vals = players.map(pick).filter((n): n is number => n != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

const teamRatingCompare = computed(() => {
  if (!teamA.value || !teamB.value) return null;
  const a = avgFromPlayers(teamA.value.players, (p) => p.seasonRating);
  const b = avgFromPlayers(teamB.value.players, (p) => p.seasonRating);
  if (a == null || b == null) return null;
  return { a, b, label: 'Rating' };
});

const teamMapWinCompare = computed(() => {
  const a = teamA.value?.mapWinRate;
  const b = teamB.value?.mapWinRate;
  if (a == null || b == null) return null;
  return { a, b };
});

const teamRecentWinCompare = computed(() => {
  const a = teamA.value?.recentWinRate;
  const b = teamB.value?.recentWinRate;
  if (a == null || b == null) return null;
  return { a, b };
});

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const activeTab = ref<'team-data' | 'compare' | 'ai'>('team-data');
const highlightedSide = ref<'A' | 'B' | null>(null);
const focusedAiSteamId = ref<string | null>(null);
const animatedSignalSteamIds = ref<string[]>([]);
const seenSignalSignatures = new Set<string>();
let signalAnimationTimer: ReturnType<typeof setTimeout> | null = null;

const playerSignals = computed(() => (
  props.ai.activeMatchId.value === props.match.id
    ? props.ai.result.value?.playerSignals ?? []
    : []
));

function signalSignature(signal: AiPlayerSignal): string {
  return `${props.match.id}:${signal.steamId}:${signal.kind}:${signal.title}:${signal.summary}`;
}

watch(
  () => playerSignals.value.map(signalSignature).join('|'),
  () => {
    const entering = playerSignals.value.filter((signal) => {
      const signature = signalSignature(signal);
      if (seenSignalSignatures.has(signature)) return false;
      seenSignalSignatures.add(signature);
      return true;
    });
    animatedSignalSteamIds.value = entering.map((signal) => signal.steamId);
    if (signalAnimationTimer) clearTimeout(signalAnimationTimer);
    if (entering.length) {
      signalAnimationTimer = setTimeout(() => {
        animatedSignalSteamIds.value = [];
      }, 1200);
    }
  },
  { immediate: true },
);

const { timeLeftSec: timeLeft, isActive: isCountdownActive, isUrgent: isCountdownUrgent } = useMatchCountdown(
  () => detail.value.readyDeadlineAt,
);

const showReadyCountdown = computed(() => (
  !isHistory.value
  && isCountdownActive.value
  && (platformId.value !== 'perfect'
    || detail.value.source !== 'ladder-events'
    || detail.value.perfectSessionPhase === 'accepting')
));

const isAiLoading = computed(() => {
  const s = props.ai.status.value;
  return s === 'loading' || s === 'streaming';
});

const aiStatusCapsule = computed(() => {
  if (isHistory.value) {
    const s = props.ai.status.value;
    const r = props.ai.result.value;
    const p = props.ai.preview.value;
    if (isAiLoading.value && p) return {
      text: `${formatAiWinnerCapsule(p.predictedWinner, p.winProbability, currentLocale(), selfSide.value)} · ${l('校准中', 'Calibrating')}`,
      tone: 'loading' as const,
    };
    if (isAiLoading.value) return { text: l('AI 分析中', 'AI analyzing'), tone: 'loading' as const };
    if (s === 'done' && r) {
      return {
        text: formatAiWinnerCapsule(r.predictedWinner, r.winProbability, currentLocale(), selfSide.value),
        tone: 'done' as const,
      };
    }
    if (s === 'error' && r) return { text: `${formatAiWinnerCapsule(r.predictedWinner, r.winProbability, currentLocale(), selfSide.value)} · ${l('更新失败', 'Update failed')}`, tone: 'warn' as const };
    if (s === 'error') return { text: l('AI 失败', 'AI failed'), tone: 'warn' as const };
    if (s === 'no-key') return { text: l('缺少 Key', 'API key required'), tone: 'warn' as const };
    return null;
  }
  if (!isAiAnalysisActive(props.ai.settings.value)) return null;
  const s = props.ai.status.value;
  const r = props.ai.result.value;
  const p = props.ai.preview.value;
  if (isAiLoading.value && p) return {
    text: `${formatAiWinnerCapsule(p.predictedWinner, p.winProbability, currentLocale(), selfSide.value)} · ${l('校准中', 'Calibrating')}`,
    tone: 'loading' as const,
  };
  if (isAiLoading.value) return { text: l('AI 分析中', 'AI analyzing'), tone: 'loading' as const };
  if (s === 'no-key') return { text: l('缺少 Key', 'API key required'), tone: 'warn' as const };
  if (s === 'error' && r) return { text: `${formatAiWinnerCapsule(r.predictedWinner, r.winProbability, currentLocale(), selfSide.value)} · ${l('更新失败', 'Update failed')}`, tone: 'warn' as const };
  if (s === 'error') return { text: l('AI 失败', 'AI failed'), tone: 'warn' as const };
  if (s === 'done' && r) {
    return {
      text: formatAiWinnerCapsule(r.predictedWinner, r.winProbability, currentLocale(), selfSide.value),
      tone: 'done' as const,
    };
  }
  return null;
});

function runAnalysis() {
  void props.ai.analyzeMatch(props.match, true, props.viewerSteamId);
}

function stopHistoryAnalysis() {
  void props.ai.stop();
}
watch(
  () => props.match.id,
  async (nextId, prevId) => {
    activeTab.value = 'team-data';
    highlightedSide.value = null;
    focusedAiSteamId.value = null;
    if (prevId && nextId !== prevId) {
      animatedSignalSteamIds.value = [];
      seenSignalSignatures.clear();
    }
    queueOrRunLiveAnalyze(() => {
      props.ai.prepareForMatch(props.match, props.viewerSteamId);
      void props.ai.maybeAutoAnalyze(props.match, props.viewerSteamId);
    });
    const players = teams.value.flatMap((t) => t.players);
    void props.comments.loadCounts(players, platformId.value);
    if (shouldReplayMatchReveal(props.match, nextId, prevId)) {
      await nextTick();
      void playReveal();
    }
  },
  { immediate: true },
);

watch(
  () => [...detail.value.unassigned, ...teams.value.flatMap((team) => team.players)]
    .map((player) => `${player.steamId}:${player.platformBoardId ?? ''}`)
    .join('|'),
  () => {
    const players = [...detail.value.unassigned, ...teams.value.flatMap((team) => team.players)];
    void props.comments.loadCounts(players, platformId.value);
  },
  { immediate: true },
);

watch(
  () => isPerfectAiAnalysisReady(props.match),
  (ready, wasReady) => {
    if (!ready || wasReady || platformId.value !== 'perfect') return;
    queueOrRunLiveAnalyze(() => {
      void props.ai.maybeAutoAnalyze(props.match, props.viewerSteamId);
    });
  },
);

watch(activeTab, (tab) => {
  if (tab !== 'team-data') animatedSignalSteamIds.value = [];
});

const resolvedMapName = computed(
  () => (detail.value.mapName || props.match.summary.mapName || '').trim(),
);

watch(
  () => ({
    id: props.match.id,
    fingerprint: buildAiInputFingerprint(props.match),
    map: resolvedMapName.value,
  }),
  (next, prev) => {
    if (!prev || next.id !== prev.id || next.fingerprint === prev.fingerprint) return;
    if (platformId.value === '5e' && !prev.map && next.map) return;
    if (!isPerfectAiAnalysisReady(props.match)) return;
    queueOrRunLiveAnalyze(() => {
      void props.ai.maybeAutoAnalyze(props.match, props.viewerSteamId);
    });
  },
);

watch(
  () => ({ id: props.match.id, map: resolvedMapName.value }),
  (next, prev) => {
    if (platformId.value !== '5e') return;
    if (!next.map) return;
    if (!prev || next.id !== prev.id || prev.map) return;
    queueOrRunLiveAnalyze(() => {
      void props.ai.supplementMapAnalysis(props.match, props.viewerSteamId);
    });
  },
);

watch(
  () => props.active,
  (active, wasActive) => {
    if (isHistory.value || active === false || wasActive !== false) return;
    if (!deferredLiveAnalyze) return;
    deferredLiveAnalyze = false;
    props.ai.prepareForMatch(props.match, props.viewerSteamId);
    void props.ai.maybeAutoAnalyze(props.match, props.viewerSteamId);
    void props.ai.supplementMapAnalysis(props.match, props.viewerSteamId);
  },
);

function onHighlightSide(side: 'A' | 'B' | null) {
  highlightedSide.value = side;
  if (side) activeTab.value = 'team-data';
}

async function openAiSignal(signal: AiPlayerSignal) {
  focusedAiSteamId.value = signal.steamId;
  activeTab.value = 'ai';
  await nextTick();
}

function openAiOverview() {
  focusedAiSteamId.value = null;
  activeTab.value = 'ai';
}

function formatTime(seconds: number) {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const metaRowRef = ref<HTMLElement | null>(null);
const { hideEloDiff, hideRecentWin } = useMatchHeaderMetaCompaction(metaRowRef, () => [
  props.match.id,
  mapName.value,
  teamEloCompare.value,
  teamRatingCompare.value,
  teamMapWinCompare.value,
  teamRecentWinCompare.value,
  timeLeft.value,
  isCountdownUrgent.value,
  aiStatusCapsule.value?.text,
  activeTab.value,
  visibleKeys.value.length,
]);

function eloCompareTitle(
  compare: NonNullable<typeof teamEloCompare.value>,
): string {
  const leader = compare.leader
    ? selfSide.value ? `${sideLabel(compare.leader)} · ${compare.leader}` : compare.leader
    : null;
  const diffPart = l(`差 ${compare.diff}${leader ? ` (${leader})` : ''}`, `difference ${compare.diff}${leader ? ` (${leader})` : ''}`);
  return hideEloDiff.value
    ? l(`两队平均匹配分，${diffPart}`, `Team average rating, ${diffPart}`)
    : l('两队平均匹配分', 'Team average rating');
}
</script>

<template>
  <div ref="panelRoot" class="match-panel match-panel--pending relative flex h-full min-h-0 flex-col bg-[#F8FAFC]">
    <div
      data-match-reveal="progress"
      class="match-reveal-progress pointer-events-none absolute left-0 right-0 top-0 z-20 bg-linear-to-r from-accent via-blue-400 to-team-b"
      aria-hidden="true"
    />

    <div data-match-reveal="shell" class="flex min-h-0 flex-1 flex-col">
    <header
      data-match-reveal="header"
      class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5"
    >
      <div
        ref="metaRowRef"
        class="flex min-w-0 flex-1 flex-nowrap items-center gap-x-2.5 overflow-hidden text-[12px]"
      >
        <div data-match-reveal="meta" class="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-slate-600">
          <PlatformLogo :platform-id="platformId" size="sm" />
          <span class="font-medium text-slate-800">{{ mapName }}</span>
        </div>

        <template v-if="showReadyCountdown">
          <span class="text-slate-200">|</span>

          <div
            data-match-reveal="meta"
            class="flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-[background-color,color,box-shadow] duration-300"
            :class="
              isCountdownUrgent
                ? 'countdown-urgent rounded-md bg-rose-50 px-2 py-1 ring-1 ring-rose-300/80'
                : 'text-slate-600'
            "
            :aria-live="isCountdownUrgent ? 'assertive' : 'off'"
          >
            <Clock
              class="shrink-0 transition-[color,scale,opacity] duration-300"
              :class="isCountdownUrgent ? 'h-4 w-4 text-rose-500' : 'h-3.5 w-3.5 text-blue-500'"
            />
            <span
              class="tabular-nums transition-[color,opacity] duration-300"
              :class="
                isCountdownUrgent
                  ? 'text-[15px] font-bold tracking-wide text-rose-600'
                  : 'font-semibold text-blue-600'
              "
            >
              {{ formatTime(timeLeft) }}
            </span>
            <span v-if="isCountdownUrgent" class="text-[11px] font-semibold text-rose-500">
              {{ l('即将截止', 'Closing soon') }}
            </span>
          </div>
        </template>

        <template v-if="teamEloCompare">
          <span class="text-slate-200">|</span>
          <span
            data-match-reveal="meta"
            class="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5"
            :title="eloCompareTitle(teamEloCompare)"
          >
            <span class="font-semibold text-blue-600">{{ sideLabel('A') }} {{ teamEloCompare.a }}</span>
            <span class="text-[9px] font-semibold uppercase text-slate-400">vs</span>
            <span class="font-semibold text-orange-500">{{ sideLabel('B') }} {{ teamEloCompare.b }}</span>
            <span v-if="!hideEloDiff" class="ml-1 text-slate-500">
              {{ l('差', 'Diff') }}
              <b :class="teamEloCompare.leader === 'A' ? 'text-blue-600' : teamEloCompare.leader === 'B' ? 'text-orange-500' : 'text-slate-700'">
                {{ teamEloCompare.diff }}
              </b>
              <span v-if="teamEloCompare.leader" class="font-medium" :class="teamEloCompare.leader === 'A' ? 'text-blue-600' : 'text-orange-500'">
                ({{ selfSide ? `${sideLabel(teamEloCompare.leader)} · ${teamEloCompare.leader}` : teamEloCompare.leader }})
              </span>
            </span>
          </span>
        </template>

        <template v-if="teamRatingCompare">
          <span class="text-slate-200">|</span>
          <span data-match-reveal="meta" class="shrink-0 text-slate-500" :title="l(`两队${teamRatingCompare.label}均值`, `Team average ${teamRatingCompare.label}`)">
            {{ teamRatingCompare.label }}
            <b class="text-blue-600">{{ teamRatingCompare.a.toFixed(2) }}</b>
            <span class="text-slate-300"> vs </span>
            <b class="text-orange-500">{{ teamRatingCompare.b.toFixed(2) }}</b>
          </span>
        </template>

        <template v-if="teamMapWinCompare">
          <span class="text-slate-200">|</span>
          <span data-match-reveal="meta" class="shrink-0 text-slate-500" :title="l(`${mapName} 赛季地图胜率`, `${mapName} season map win rate`)">
            {{ l('地图胜', 'Map WR') }}
            <b class="text-blue-600">{{ formatPct(teamMapWinCompare.a) }}</b>
            <span class="text-slate-300"> vs </span>
            <b class="text-orange-500">{{ formatPct(teamMapWinCompare.b) }}</b>
          </span>
        </template>

        <template v-if="teamRecentWinCompare && !hideRecentWin">
          <span class="text-slate-200">|</span>
          <span data-match-reveal="meta" class="shrink-0 text-slate-500" :title="l('两队近10场胜率', 'Win rate over the last 10 matches')">
            {{ l('近期胜', 'Recent WR') }}
            <b class="text-blue-600">{{ formatPct(teamRecentWinCompare.a) }}</b>
            <span class="text-slate-300"> vs </span>
            <b class="text-orange-500">{{ formatPct(teamRecentWinCompare.b) }}</b>
          </span>
        </template>

      </div>

      <button
        v-if="aiStatusCapsule"
        type="button"
        data-match-reveal="meta"
        class="mr-1 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:ring-offset-1"
        :class="
          aiStatusCapsule.tone === 'loading'
            ? 'ai-status-loading bg-indigo-50 text-indigo-600 ring-1 ring-indigo-300'
            : aiStatusCapsule.tone === 'done'
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100/80'
              : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100/80'
        "
        :title="aiStatusCapsule.tone === 'done' ? l('查看 AI 分析结果', 'View AI analysis') : l('前往 AI 分析', 'Open AI analysis')"
        @click="openAiOverview"
      >
        <AiSparklesIcon size="xs" :loading="aiStatusCapsule.tone === 'loading'" />
        {{ aiStatusCapsule.text }}
      </button>

      <div class="flex shrink-0 items-center gap-1.5">
        <button
          v-if="activeTab === 'team-data'"
          type="button"
          data-match-reveal="tabs"
          class="relative inline-flex h-[30px] cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-600 shadow-sm transition-colors duration-200 hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
          :title="l('自定义列', 'Customize columns')"
          :aria-label="l('自定义列', 'Customize columns')"
          @click.stop="columnCustomizerOpen = true"
        >
          <Columns3 class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span class="hidden sm:inline">{{ l('列', 'Columns') }}</span>
          <span
            class="inline-flex min-w-[16px] items-center justify-center rounded bg-slate-100 px-1 text-[10px] font-semibold leading-none text-slate-500"
          >
            {{ visibleKeys.length }}
          </span>
        </button>

        <div
          data-match-reveal="tabs"
          class="inline-flex shrink-0 rounded-md bg-slate-100 p-0.5 text-[12px]"
          role="tablist"
        >
        <button
          type="button"
          role="tab"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors duration-200"
          :class="
            activeTab === 'team-data'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          "
          :aria-selected="activeTab === 'team-data'"
          @click="activeTab = 'team-data'"
        >
          <Table2 class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {{ l('队伍数据', 'Team data') }}
        </button>
        <button
          type="button"
          role="tab"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors duration-200"
          :class="
            activeTab === 'compare'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          "
          :aria-selected="activeTab === 'compare'"
          @click="activeTab = 'compare'"
        >
          <GitCompareArrows class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {{ l('对比分析', 'Comparison') }}
        </button>
        <button
          type="button"
          role="tab"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors duration-200"
          :class="
            isAiLoading
              ? 'ai-tab-loading bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200'
              : activeTab === 'ai'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
          "
          :aria-selected="activeTab === 'ai'"
          :aria-busy="isAiLoading"
          @click="openAiOverview"
        >
          <AiSparklesIcon size="sm" :loading="isAiLoading" />
          {{ isAiLoading ? l('分析中', 'Analyzing') : l('AI 分析', 'AI analysis') }}
        </button>
        </div>
      </div>
    </header>

    <div class="relative min-h-0 flex-1 overflow-hidden">
      <Transition name="tab-fade" mode="out-in">
        <TeamDataBoard
          v-if="activeTab === 'team-data'"
          key="team-data"
          v-model:customizer-open="columnCustomizerOpen"
          :teams="teams"
          :unassigned="detail.unassigned"
          :map-name="detail.mapName"
          :ready-count="detail.readyCount"
          :expected-player-count="detail.expectedPlayerCount"
          :stats-loaded-count="detail.statsLoadedCount"
          :session-phase="detail.perfectSessionPhase"
          :columns="visibleColumns"
          :visible-keys="visibleKeys"
          :customizer-items="customizerItems"
          :highlighted-side="highlightedSide"
          :player-signals="playerSignals"
          :animated-signal-steam-ids="animatedSignalSteamIds"
          :self-side="selfSide"
          :get-comment-count="comments.getCount"
          :get-comment-count-has-more="comments.getCountHasMore"
          :platform-id="platformId"
          @toggle-column="setVisible"
          @set-column-order="setColumnOrder"
          @reset-columns="resetColumns"
          @open-comments="(player) => comments.openPlayer(player, platformId)"
          @open-ai-signal="openAiSignal"
        />
        <TeamCompareBoard
          v-else-if="activeTab === 'compare'"
          key="compare"
          :teams="teams"
          :platform-id="platformId"
          :self-side="selfSide"
          @open-comments="(player) => comments.openPlayer(player, platformId)"
        />
        <AiAnalysisPanel
          v-else
          key="ai"
          :match="match"
          :ai="ai"
          :history-mode="isHistory"
          :highlighted-side="highlightedSide"
          :focused-steam-id="focusedAiSteamId"
          :self-side="selfSide"
          @highlight-side="onHighlightSide"
          @open-settings="emit('openSettings')"
          @analyze="runAnalysis"
          @stop="stopHistoryAnalysis"
        />
      </Transition>
    </div>
    </div>
  </div>
</template>

<style scoped>
.match-panel--pending [data-match-reveal]:not([data-match-reveal='progress']) {
  opacity: 0;
}

.match-reveal-progress {
  height: 3px;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  box-shadow: 0 0 10px rgb(74 144 226 / 0.35);
}

.match-reveal-progress--hidden {
  display: none;
}

.match-panel--pending .match-reveal-progress:not(.match-reveal-progress--hidden) {
  width: 0;
}

@keyframes countdown-urgent-glow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgb(244 63 94 / 0.35);
  }
  50% {
    box-shadow: 0 0 0 4px rgb(244 63 94 / 0);
  }
}

.countdown-urgent {
  animation: countdown-urgent-glow 1.2s ease-in-out infinite;
}

.ai-tab-loading,
.ai-status-loading {
  animation: ai-loading-pulse 1.4s ease-in-out infinite;
}

@keyframes ai-loading-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgb(129 140 248 / 0.35);
  }
  50% {
    box-shadow: 0 0 0 3px rgb(129 140 248 / 0);
  }
}
</style>
