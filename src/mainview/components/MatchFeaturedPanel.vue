<script setup lang="ts">
import { computed, nextTick, ref, watch, onUnmounted } from 'vue';
import { Clock, Table2, GitCompareArrows, Columns3 } from 'lucide-vue-next';
import AiSparklesIcon from './AiSparklesIcon.vue';
import PlatformLogo from './PlatformLogo.vue';
import type { MatchRecord, MatchPlayer } from '@core/match/models';
import { isAiAnalysisActive } from '@core/ai/types';
import { formatAiWinnerCapsule } from '@core/ai/display';
import type { useAiAnalysis } from '../composables/useAiAnalysis';
import type { useComments } from '../composables/useComments';
import { useMatchHeaderMetaCompaction } from '../composables/useMatchHeaderMetaCompaction';
import { useMatchRevealAnimation } from '../composables/useMatchRevealAnimation';
import { useTeamTableColumns } from '../composables/useTeamTableColumns';
import AiAnalysisPanel from './AiAnalysisPanel.vue';
import TeamDataBoard from './TeamDataBoard.vue';
import TeamCompareBoard from './TeamCompareBoard.vue';

const props = defineProps<{
  match: MatchRecord;
  ai: ReturnType<typeof useAiAnalysis>;
  comments: ReturnType<typeof useComments>;
}>();

const emit = defineEmits<{
  openSettings: [];
}>();

const panelRoot = ref<HTMLElement | null>(null);
const { playReveal } = useMatchRevealAnimation(panelRoot);

const detail = computed(() => props.match.detail);
const teams = computed(() => detail.value.teams || []);
const platformId = computed(() => props.match.platformId ?? detail.value.platformId ?? 'perfect');

const {
  visibleColumns,
  visibleKeys,
  customizerItems,
  setVisible,
  setColumnOrder,
  resetColumns,
} = useTeamTableColumns(platformId);

const columnCustomizerOpen = ref(false);

const mapName = computed(() => detail.value.mapName || props.match.summary.mapName || '未知地图');

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
  if (platformId.value === '5e') {
    const a = avgFromPlayers(teamA.value.players, (p) => p.seasonRating);
    const b = avgFromPlayers(teamB.value.players, (p) => p.seasonRating);
    if (a == null || b == null) return null;
    return { a, b, label: 'Rating' };
  }
  const a = teamA.value.avgRating;
  const b = teamB.value.avgRating;
  if (a == null || b == null) return null;
  return { a, b, label: '近期Rating' };
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
const highlightedSteamId = ref<string | null>(null);
const timeLeft = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const isAiLoading = computed(() => {
  const s = props.ai.status.value;
  return s === 'loading' || s === 'streaming';
});

const aiStatusCapsule = computed(() => {
  if (!isAiAnalysisActive(props.ai.settings.value)) return null;
  const s = props.ai.status.value;
  const r = props.ai.result.value;
  if (isAiLoading.value) return { text: 'AI 分析中', tone: 'loading' as const };
  if (s === 'no-key') return { text: '缺少 Key', tone: 'warn' as const };
  if (s === 'error') return { text: 'AI 失败', tone: 'warn' as const };
  if (s === 'done' && r) {
    return {
      text: formatAiWinnerCapsule(r.predictedWinner, r.winProbability),
      tone: 'done' as const,
    };
  }
  return null;
});

function resetCountdown() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  const readyMs = detail.value.readyLeftTimeMs;
  timeLeft.value = readyMs ? Math.floor(readyMs / 1000) : 0;

  if (timeLeft.value > 0) {
    timer = setInterval(() => {
      if (timeLeft.value > 0) {
        timeLeft.value--;
      }
    }, 1000);
  }
}

watch(
  () => props.match.id,
  async (nextId, prevId) => {
    activeTab.value = 'team-data';
    highlightedSide.value = null;
    highlightedSteamId.value = null;
    resetCountdown();
    void props.ai.analyzeMatch(props.match);
    const players = teams.value.flatMap((t) => t.players);
    void props.comments.loadCounts(players, platformId.value);
    if (prevId !== undefined && nextId !== prevId) {
      await nextTick();
      void playReveal();
    }
  },
  { immediate: true },
);

function onHighlightSide(side: 'A' | 'B' | null) {
  highlightedSide.value = side;
  if (side) activeTab.value = 'team-data';
}

function onHighlightPlayer(steamId: string | null) {
  highlightedSteamId.value = steamId;
  if (steamId) activeTab.value = 'team-data';
}

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function formatTime(seconds: number) {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const isCountdownUrgent = computed(() => timeLeft.value > 0 && timeLeft.value <= 10);

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
  const diffPart = `差 ${compare.diff}${compare.leader ? ` (${compare.leader})` : ''}`;
  return hideEloDiff.value
    ? `两队平均匹配分，${diffPart}`
    : '两队平均匹配分';
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
        <div data-match-reveal="meta" class="flex items-center gap-1.5 text-slate-600">
          <PlatformLogo :platform-id="platformId" size="sm" />
          <span class="font-medium text-slate-800">{{ mapName }}</span>
        </div>

        <span class="text-slate-200">|</span>

        <div
          data-match-reveal="meta"
          class="flex items-center gap-1.5 transition-all duration-300"
          :class="
            isCountdownUrgent
              ? 'countdown-urgent rounded-md bg-rose-50 px-2 py-1 ring-1 ring-rose-300/80'
              : 'text-slate-600'
          "
          :aria-live="isCountdownUrgent ? 'assertive' : 'off'"
        >
          <Clock
            class="shrink-0 transition-all duration-300"
            :class="isCountdownUrgent ? 'h-4 w-4 text-rose-500' : 'h-3.5 w-3.5 text-blue-500'"
          />
          <span
            class="tabular-nums transition-all duration-300"
            :class="
              isCountdownUrgent
                ? 'text-[15px] font-bold tracking-wide text-rose-600'
                : 'font-semibold text-blue-600'
            "
          >
            {{ formatTime(timeLeft) }}
          </span>
          <span v-if="isCountdownUrgent" class="text-[11px] font-semibold text-rose-500">
            即将截止
          </span>
        </div>

        <template v-if="teamEloCompare">
          <span class="text-slate-200">|</span>
          <span
            data-match-reveal="meta"
            class="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5"
            :title="eloCompareTitle(teamEloCompare)"
          >
            <span class="font-semibold text-blue-600">A {{ teamEloCompare.a }}</span>
            <span class="text-[9px] font-semibold uppercase text-slate-400">vs</span>
            <span class="font-semibold text-orange-500">B {{ teamEloCompare.b }}</span>
            <span v-if="!hideEloDiff" class="ml-1 text-slate-500">
              差
              <b :class="teamEloCompare.leader === 'A' ? 'text-blue-600' : teamEloCompare.leader === 'B' ? 'text-orange-500' : 'text-slate-700'">
                {{ teamEloCompare.diff }}
              </b>
              <span v-if="teamEloCompare.leader" class="font-medium" :class="teamEloCompare.leader === 'A' ? 'text-blue-600' : 'text-orange-500'">
                ({{ teamEloCompare.leader }})
              </span>
            </span>
          </span>
        </template>

        <template v-if="teamRatingCompare">
          <span class="text-slate-200">|</span>
          <span data-match-reveal="meta" class="shrink-0 text-slate-500" :title="`两队${teamRatingCompare.label}均值`">
            {{ teamRatingCompare.label }}
            <b class="text-blue-600">{{ teamRatingCompare.a.toFixed(2) }}</b>
            <span class="text-slate-300"> vs </span>
            <b class="text-orange-500">{{ teamRatingCompare.b.toFixed(2) }}</b>
          </span>
        </template>

        <template v-if="teamMapWinCompare">
          <span class="text-slate-200">|</span>
          <span data-match-reveal="meta" class="shrink-0 text-slate-500" :title="`${mapName} 赛季地图胜率`">
            地图胜
            <b class="text-blue-600">{{ formatPct(teamMapWinCompare.a) }}</b>
            <span class="text-slate-300"> vs </span>
            <b class="text-orange-500">{{ formatPct(teamMapWinCompare.b) }}</b>
          </span>
        </template>

        <template v-if="teamRecentWinCompare && !hideRecentWin">
          <span class="text-slate-200">|</span>
          <span data-match-reveal="meta" class="shrink-0 text-slate-500" title="两队近10场胜率">
            近期胜
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
        :title="aiStatusCapsule.tone === 'done' ? '查看 AI 分析结果' : '前往 AI 分析'"
        @click="activeTab = 'ai'"
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
          title="自定义列"
          aria-label="自定义列"
          @click="columnCustomizerOpen = true"
        >
          <Columns3 class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span class="hidden sm:inline">列</span>
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
          队伍数据
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
          对比分析
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
          @click="activeTab = 'ai'"
        >
          <AiSparklesIcon size="sm" :loading="isAiLoading" />
          {{ isAiLoading ? '分析中' : 'AI 分析' }}
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
          :columns="visibleColumns"
          :visible-keys="visibleKeys"
          :customizer-items="customizerItems"
          :highlighted-side="highlightedSide"
          :highlighted-steam-id="highlightedSteamId"
          :get-comment-count="comments.getCount"
          :get-comment-count-has-more="comments.getCountHasMore"
          @toggle-column="setVisible"
          @set-column-order="setColumnOrder"
          @reset-columns="resetColumns"
          @open-comments="(player) => comments.openPlayer(player, platformId)"
        />
        <TeamCompareBoard
          v-else-if="activeTab === 'compare'"
          key="compare"
          :teams="teams"
          :platform-id="platformId"
          @open-comments="(player) => comments.openPlayer(player, platformId)"
        />
        <AiAnalysisPanel
          v-else
          key="ai"
          :match="match"
          :ai="ai"
          :highlighted-side="highlightedSide"
          :highlighted-steam-id="highlightedSteamId"
          @highlight-side="onHighlightSide"
          @highlight-player="onHighlightPlayer"
          @open-settings="emit('openSettings')"
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
