<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue';
import { Crosshair, Star, Target, Skull, UserCheck, Flag } from 'lucide-vue-next';
import type { MatchPlatformId, MatchTeam, MatchPlayer } from '@core/match/models';
import { animate } from 'animejs/animation';
import { createTimeline } from 'animejs/timeline';
import { stagger } from 'animejs/utils';
import { useCopyFeedback } from '../composables/useCopyFeedback';
import { avgPlayerStat, ratioWidth } from './team-table-shared';
import PlayerAvatar from './PlayerAvatar.vue';
import TeamRadarCompare from './TeamRadarCompare.vue';
import Team5eComparePanel from './Team5eComparePanel.vue';
import type { Component } from 'vue';

const props = defineProps<{
  teams: MatchTeam[];
  platformId?: MatchPlatformId;
}>();

const boardRef = ref<HTMLElement | null>(null);
const { copySteamId } = useCopyFeedback();

const is5e = computed(() => props.platformId === '5e');

function onPlayerClick(steamId: string, nickname: string) {
  void copySteamId(steamId, nickname);
}

const teamA = computed(() => props.teams.find((t) => t.side === 'A'));
const teamB = computed(() => props.teams.find((t) => t.side === 'B'));

function formatNum(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

interface CompareItem {
  key: string;
  label: string;
  a: number;
  b: number;
  isPct: boolean;
  decimals: number;
  icon: Component;
  iconBg: string;
  iconColor: string;
}

function buildPerfectCompare(aPlayers: MatchPlayer[], bPlayers: MatchPlayer[]): CompareItem[] {
  return [
    { key: 'adpr', label: '平均ADR', a: avgPlayerStat(aPlayers, 'adpr'), b: avgPlayerStat(bPlayers, 'adpr'), isPct: false, decimals: 1, icon: Target, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-500' },
    { key: 'rating', label: '平均近期Rating', a: avgPlayerStat(aPlayers, 'rating'), b: avgPlayerStat(bPlayers, 'rating'), isPct: false, decimals: 2, icon: Star, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
    { key: 'kd', label: '平均K/D', a: avgPlayerStat(aPlayers, 'kd'), b: avgPlayerStat(bPlayers, 'kd'), isPct: false, decimals: 2, icon: Crosshair, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
    { key: 'hsRate', label: '平均爆头率', a: avgPlayerStat(aPlayers, 'hsRate'), b: avgPlayerStat(bPlayers, 'hsRate'), isPct: true, decimals: 0, icon: Skull, iconBg: 'bg-rose-50', iconColor: 'text-rose-500' },
    { key: 'firstKill', label: '平均首杀成功率', a: avgPlayerStat(aPlayers, 'firstKillSuccessRate'), b: avgPlayerStat(bPlayers, 'firstKillSuccessRate'), isPct: true, decimals: 0, icon: UserCheck, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-500' },
    { key: 'clutch', label: '平均残局胜率', a: avgPlayerStat(aPlayers, 'clutchWinRate'), b: avgPlayerStat(bPlayers, 'clutchWinRate'), isPct: true, decimals: 0, icon: Flag, iconBg: 'bg-purple-50', iconColor: 'text-purple-500' },
  ];
}

const compareItems = computed<CompareItem[] | null>(() => {
  if (!teamA.value || !teamB.value || is5e.value) return null;
  return buildPerfectCompare(teamA.value.players, teamB.value.players);
});

const statCardGridClass = computed(() => {
  const count = compareItems.value?.length ?? 0;
  if (count <= 3) return 'grid-cols-3';
  if (count <= 4) return 'grid-cols-2 lg:grid-cols-4';
  if (count <= 6) return 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';
  return 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
});

const scoreLabel = computed(() => '队伍平均分');

function getTeamRadarScore(players: MatchPlayer[], radarKey: string) {
  const valid = players.filter((p) => p.radar?.[radarKey] && typeof p.radar[radarKey].score === 'number');
  if (!valid.length) return 50;
  return Math.round(valid.reduce((acc, p) => acc + Number(p.radar[radarKey].score), 0) / valid.length);
}

function getTeamRadar(players: MatchPlayer[]) {
  return {
    firepower: getTeamRadarScore(players, 'fire_power'),
    entry: getTeamRadarScore(players, 'first'),
    defense: getTeamRadarScore(players, 'follow_up_shot'),
    clutch: getTeamRadarScore(players, '1vn'),
    utility: getTeamRadarScore(players, 'item'),
  };
}

const showRadar = computed(() => !is5e.value);

const teamARadar = computed(() => (showRadar.value && teamA.value ? getTeamRadar(teamA.value.players) : null));
const teamBRadar = computed(() => (showRadar.value && teamB.value ? getTeamRadar(teamB.value.players) : null));

const teamAvgScores = computed(() => {
  if (!teamA.value || !teamB.value) return null;
  const a = teamA.value.avgScore ?? avgPlayerStat(teamA.value.players, 'score');
  const b = teamB.value.avgScore ?? avgPlayerStat(teamB.value.players, 'score');
  return { a, b };
});

let activeTimeline: ReturnType<typeof createTimeline> | null = null;
let activeScoreAnimations: ReturnType<typeof animate>[] = [];

function primeHidden(elements: NodeListOf<HTMLElement> | HTMLElement[]) {
  elements.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
  });
}

function animateScoreElements(elements: HTMLElement[], targetVal: number) {
  const counter = { value: 0 };
  const anim = animate(counter, {
    value: { from: 0, to: targetVal, duration: 900, ease: 'outExpo' },
    onUpdate: () => {
      const text = String(Math.round(counter.value));
      elements.forEach((el) => {
        el.textContent = text;
      });
    },
  });
  activeScoreAnimations.push(anim);
}

onMounted(() => {
  void nextTick(() => {
    const root = boardRef.value;
    if (!root) return;

    const panelEls = root.querySelectorAll<HTMLElement>('.compare-entrance-panel');
    const statEls = root.querySelectorAll<HTMLElement>('.compare-entrance-stat');
    const radarCharts = root.querySelectorAll<HTMLElement>('.radar-chart');
    const progressFills = root.querySelectorAll<HTMLElement>('.progress-fill');

    primeHidden(panelEls);
    statEls.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
    });
    radarCharts.forEach((el) => {
      el.style.opacity = '0';
    });
    progressFills.forEach((el) => {
      el.style.width = '0%';
    });

    const tl = createTimeline({ defaults: { ease: 'outExpo' } });

    if (panelEls.length) {
      tl.add(
        panelEls,
        {
          opacity: { from: 0, to: 1 },
          translateY: { from: 16, to: 0 },
          duration: 420,
          delay: stagger(55),
        },
        0,
      );
    }

    if (statEls.length) {
      tl.add(
        statEls,
        {
          opacity: { from: 0, to: 1 },
          translateY: { from: 8, to: 0 },
          duration: 260,
          delay: stagger(25),
        },
        0,
      );
    }

    if (radarCharts.length) {
      tl.add(
        radarCharts,
        {
          opacity: { from: 0, to: 1 },
          duration: 400,
          delay: stagger(80),
        },
        0,
      );
    }

    if (progressFills.length) {
      tl.add(
        progressFills,
        {
          width: {
            from: '0%',
            to: (el: Element) => (el as HTMLElement).dataset.width || '0%',
          },
          duration: 700,
          ease: 'outQuart',
          delay: stagger(30),
        },
        0,
      );
    }

    activeTimeline = tl;

    const scoreAElements = Array.from(root.querySelectorAll<HTMLElement>('.score-a'));
    const scoreBElements = Array.from(root.querySelectorAll<HTMLElement>('.score-b'));

    if (scoreAElements.length && teamA.value) {
      const targetVal = Math.round(teamA.value.avgScore ?? avgPlayerStat(teamA.value.players, 'score'));
      animateScoreElements(scoreAElements, targetVal);
    }

    if (scoreBElements.length && teamB.value) {
      const targetVal = Math.round(teamB.value.avgScore ?? avgPlayerStat(teamB.value.players, 'score'));
      animateScoreElements(scoreBElements, targetVal);
    }
  });
});

onUnmounted(() => {
  activeTimeline?.pause();
  activeScoreAnimations.forEach((anim) => anim.pause());
  activeTimeline = null;
  activeScoreAnimations = [];
});
</script>

<template>
  <Team5eComparePanel
    v-if="is5e && teamA && teamB"
    :team-a="teamA"
    :team-b="teamB"
  />
  <div v-else ref="boardRef" class="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-6 py-6">
    <!-- 上排：队伍 A | 综合对比 | 队伍 B -->
    <div class="grid min-h-[360px] shrink-0 grid-cols-12 gap-5">
      <!-- 队伍 A -->
      <div
        v-if="teamA"
        data-match-reveal="compare"
        class="compare-entrance-panel main-section col-span-3 flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-sm transition-shadow duration-300 hover:shadow-md"
      >
        <div class="flex items-center gap-2 border-b border-slate-100/80 bg-linear-to-r from-blue-50 to-transparent px-5 py-3">
          <UserCheck class="h-4 w-4 text-blue-500" />
          <h2 class="text-[14px] font-bold text-blue-600">队伍 A</h2>
        </div>

        <div class="flex flex-1 flex-col p-4">
          <div class="team-player-row mb-3 flex items-center justify-center gap-3.5">
            <button
              v-for="p in teamA.players.slice(0, 5)"
              :key="p.steamId"
              type="button"
              class="group flex cursor-pointer flex-col items-center transition-transform duration-200 hover:-translate-y-1"
              :title="`点击复制 Steam ID: ${p.steamId}`"
              @click="onPlayerClick(p.steamId, p.nickname)"
            >
              <PlayerAvatar :src="p.avatar" :alt="p.nickname" size="md" shape="rounded" class="ring-2 ring-transparent transition-all group-hover:ring-blue-200" />
              <span class="mt-1.5 max-w-[48px] truncate text-[10px] text-slate-600 transition-colors group-hover:text-blue-600">{{ p.nickname }}</span>
              <span class="text-[11px] font-semibold text-slate-800">{{ p.score || '-' }}</span>
            </button>
          </div>

          <div class="mb-2 text-center">
            <div class="mb-0.5 text-[12px] font-medium text-slate-500">{{ scoreLabel }}</div>
            <div class="score-a text-4xl font-black tracking-tight text-blue-600">
              {{ (teamA.avgScore ?? avgPlayerStat(teamA.players, 'score')).toFixed(0) }}
            </div>
            <div class="mt-1.5 flex items-center justify-center gap-4 text-[11px] text-slate-500">
              <div class="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                最高 <span class="font-bold text-slate-700">{{ Math.max(...teamA.players.map((p) => p.score || 0)) }}</span>
              </div>
              <div class="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                最低 <span class="font-bold text-slate-700">{{ Math.min(...teamA.players.map((p) => p.score || 0)) }}</span>
              </div>
            </div>
          </div>

          <div v-if="teamARadar" class="flex justify-center">
            <TeamRadarCompare
              :primary="teamARadar"
              :secondary="teamBRadar ?? undefined"
              primary-color="#3b82f6"
              secondary-color="#f97316"
            />
          </div>
        </div>
      </div>

      <!-- 综合对比 -->
      <div
        v-if="compareItems && teamA && teamB"
        data-match-reveal="compare"
        class="compare-entrance-panel main-section col-span-6 flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 px-8 py-6 shadow-sm backdrop-blur-sm transition-shadow duration-300 hover:shadow-md"
      >
        <div class="mb-4 text-center">
          <div class="mb-3 inline-flex items-center justify-center rounded-full bg-slate-100/80 px-4 py-1.5">
            <h2 class="text-[13px] font-bold uppercase tracking-wider text-slate-600">综合对比分析</h2>
          </div>

          <div class="flex items-center justify-center gap-8">
            <span class="score-a text-4xl font-black tracking-tight text-blue-600">
              {{ (teamA.avgScore ?? avgPlayerStat(teamA.players, 'score')).toFixed(0) }}
            </span>
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-400 shadow-inner">
              VS
            </span>
            <span class="score-b text-4xl font-black tracking-tight text-orange-500">
              {{ (teamB.avgScore ?? avgPlayerStat(teamB.players, 'score')).toFixed(0) }}
            </span>
          </div>
          
          <div v-if="teamAvgScores" class="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100/80 shadow-inner">
            <div
              class="progress-fill h-full bg-linear-to-r from-blue-400 to-blue-500"
              :data-width="ratioWidth(teamAvgScores.a, teamAvgScores.b)"
            />
            <div
              class="progress-fill h-full bg-linear-to-l from-orange-400 to-orange-500"
              :data-width="ratioWidth(teamAvgScores.b, teamAvgScores.a)"
            />
          </div>
        </div>

        <div class="mt-5 flex flex-col gap-2.5 border-t border-slate-100 pt-4">
          <div
            v-for="(item, index) in compareItems"
            :key="item.key"
            class="compare-row flex items-center justify-between rounded-lg px-1 py-2 text-[13px] transition-colors hover:bg-slate-50/60"
            :class="{ 'border-b border-slate-100': index < compareItems.length - 1 }"
          >
            <span class="w-28 shrink-0 font-medium text-slate-600">{{ item.label }}</span>
            <div class="mx-3 flex min-w-0 flex-1 items-center gap-3">
              <span class="w-12 text-right font-bold text-blue-600">
                {{ item.isPct ? formatPct(item.a) : formatNum(item.a, item.decimals) }}
              </span>
              <div class="relative flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                <div
                  class="progress-fill absolute inset-y-0 left-0 bg-blue-500"
                  :data-width="ratioWidth(item.a, item.b)"
                />
                <div
                  class="progress-fill absolute inset-y-0 right-0 bg-orange-500"
                  :data-width="ratioWidth(item.b, item.a)"
                />
              </div>
              <span class="w-12 font-bold text-orange-500">
                {{ item.isPct ? formatPct(item.b) : formatNum(item.b, item.decimals) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 队伍 B -->
      <div
        v-if="teamB"
        data-match-reveal="compare"
        class="compare-entrance-panel main-section col-span-3 flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-sm transition-shadow duration-300 hover:shadow-md"
      >
        <div class="flex items-center gap-2 border-b border-slate-100/80 bg-linear-to-r from-orange-50 to-transparent px-5 py-3">
          <UserCheck class="h-4 w-4 text-orange-500" />
          <h2 class="text-[14px] font-bold text-orange-500">队伍 B</h2>
        </div>

        <div class="flex flex-1 flex-col p-4">
          <div class="team-player-row mb-3 flex items-center justify-center gap-3.5">
            <button
              v-for="p in teamB.players.slice(0, 5)"
              :key="p.steamId"
              type="button"
              class="group flex cursor-pointer flex-col items-center transition-transform duration-200 hover:-translate-y-1"
              :title="`点击复制 Steam ID: ${p.steamId}`"
              @click="onPlayerClick(p.steamId, p.nickname)"
            >
              <PlayerAvatar :src="p.avatar" :alt="p.nickname" size="md" shape="rounded" class="ring-2 ring-transparent transition-all group-hover:ring-orange-200" />
              <span class="mt-1.5 max-w-[48px] truncate text-[10px] text-slate-600 transition-colors group-hover:text-orange-500">{{ p.nickname }}</span>
              <span class="text-[11px] font-semibold text-slate-800">{{ p.score || '-' }}</span>
            </button>
          </div>

          <div class="mb-2 text-center">
            <div class="mb-0.5 text-[12px] font-medium text-slate-500">{{ scoreLabel }}</div>
            <div class="score-b text-4xl font-black tracking-tight text-orange-500">
              {{ (teamB.avgScore ?? avgPlayerStat(teamB.players, 'score')).toFixed(0) }}
            </div>
            <div class="mt-1.5 flex items-center justify-center gap-4 text-[11px] text-slate-500">
              <div class="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                最高 <span class="font-bold text-slate-700">{{ Math.max(...teamB.players.map((p) => p.score || 0)) }}</span>
              </div>
              <div class="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                最低 <span class="font-bold text-slate-700">{{ Math.min(...teamB.players.map((p) => p.score || 0)) }}</span>
              </div>
            </div>
          </div>

          <div v-if="teamBRadar" class="flex justify-center">
            <TeamRadarCompare
              :primary="teamBRadar"
              :secondary="teamARadar ?? undefined"
              primary-color="#f97316"
              secondary-color="#3b82f6"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 下排：指标卡片 -->
    <div v-if="compareItems" class="grid shrink-0 gap-5" :class="statCardGridClass">
      <div
        v-for="item in compareItems"
        :key="`card-${item.key}`"
        class="compare-entrance-stat stat-card flex flex-col justify-between rounded-2xl border border-slate-200/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
      >
        <div>
          <div class="mb-4 flex items-center gap-2 text-[13px] font-bold text-slate-600">
            <div class="flex h-6 w-6 items-center justify-center rounded-md" :class="item.iconBg">
              <component :is="item.icon" class="h-3.5 w-3.5" :class="item.iconColor" />
            </div>
            {{ item.label.replace(/^平均/, '') }}
          </div>
          <div class="mb-3 flex items-center justify-between font-black">
            <span class="text-xl text-blue-600">{{ item.isPct ? formatPct(item.a) : formatNum(item.a, item.decimals) }}</span>
            <span class="text-[11px] font-bold text-slate-300">VS</span>
            <span class="text-xl text-orange-500">{{ item.isPct ? formatPct(item.b) : formatNum(item.b, item.decimals) }}</span>
          </div>
        </div>
        <div>
          <div class="relative mb-2.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100 shadow-inner">
            <div
              class="progress-fill absolute inset-y-0 left-0 bg-blue-500"
              :data-width="ratioWidth(item.a, item.b)"
            />
            <div
              class="progress-fill absolute inset-y-0 right-0 bg-orange-500"
              :data-width="ratioWidth(item.b, item.a)"
            />
          </div>
          <div class="flex justify-between text-[11px] font-medium text-slate-400">
            <span>A 队</span>
            <span>B 队</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
