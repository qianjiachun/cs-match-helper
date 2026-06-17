<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue';
import { Crosshair, Swords, UserCheck } from 'lucide-vue-next';
import type { MatchTeam } from '@core/match/models';
import { animate } from 'animejs/animation';
import { createTimeline } from 'animejs/timeline';
import { stagger } from 'animejs/utils';
import { useCopyFeedback } from '../composables/useCopyFeedback';
import { avgPlayerStat, ratioWidth } from './team-table-shared';
import {
  buildP5eCoreMetrics,
  buildP5eFightMetrics,
  buildP5eTeamRadar,
  formatCompareValue,
} from './p5e-compare-utils';
import P5eRadarCompare from './P5eRadarCompare.vue';
import Team5ePlayerRow from './Team5ePlayerRow.vue';

const props = defineProps<{
  teamA: MatchTeam;
  teamB: MatchTeam;
}>();

const boardRef = ref<HTMLElement | null>(null);
const { copySteamId } = useCopyFeedback();

function onPlayerClick(steamId: string, nickname: string) {
  void copySteamId(steamId, nickname);
}

const coreMetrics = computed(() => buildP5eCoreMetrics(props.teamA, props.teamB));
const fightMetrics = computed(() => buildP5eFightMetrics(props.teamA, props.teamB));
const radarData = computed(() => buildP5eTeamRadar(props.teamA, props.teamB));
const radarAxesForA = computed(() =>
  radarData.value.axes.map((axis) => ({
    label: axis.label,
    primary: axis.a,
    secondary: axis.b,
  })),
);
const radarAxesForB = computed(() =>
  radarData.value.axes.map((axis) => ({
    label: axis.label,
    primary: axis.b,
    secondary: axis.a,
  })),
);

function compareBarWidth(a: number, b: number, side: 'a' | 'b'): string {
  return ratioWidth(side === 'a' ? a : b, side === 'a' ? b : a);
}

const teamAvgElo = computed(() => ({
  a: props.teamA.avgScore ?? avgPlayerStat(props.teamA.players, 'score'),
  b: props.teamB.avgScore ?? avgPlayerStat(props.teamB.players, 'score'),
}));

let activeTimeline: ReturnType<typeof createTimeline> | null = null;
let activeScoreAnimations: ReturnType<typeof animate>[] = [];

onMounted(() => {
  void nextTick(() => {
    const root = boardRef.value;
    if (!root) return;

    const panelEls = root.querySelectorAll<HTMLElement>('.compare-entrance-panel');
    const statEls = root.querySelectorAll<HTMLElement>('.compare-entrance-stat');
    const radarCharts = root.querySelectorAll<HTMLElement>('.radar-chart');
    const progressFills = root.querySelectorAll<HTMLElement>('.progress-fill');

    panelEls.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
    });
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
      tl.add(panelEls, { opacity: { from: 0, to: 1 }, translateY: { from: 16, to: 0 }, duration: 420, delay: stagger(55) }, 0);
    }
    if (statEls.length) {
      tl.add(statEls, { opacity: { from: 0, to: 1 }, translateY: { from: 8, to: 0 }, duration: 260, delay: stagger(25) }, 0);
    }
    if (radarCharts.length) {
      tl.add(radarCharts, { opacity: { from: 0, to: 1 }, duration: 400, delay: stagger(80) }, 0);
    }
    if (progressFills.length) {
      tl.add(
        progressFills,
        {
          width: { from: '0%', to: (el: Element) => (el as HTMLElement).dataset.width || '0%' },
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
    if (scoreAElements.length) {
      const counter = { value: 0 };
      activeScoreAnimations.push(animate(counter, {
        value: { from: 0, to: Math.round(teamAvgElo.value.a), duration: 900, ease: 'outExpo' },
        onUpdate: () => {
          const text = String(Math.round(counter.value));
          scoreAElements.forEach((el) => { el.textContent = text; });
        },
      }));
    }
    if (scoreBElements.length) {
      const counter = { value: 0 };
      activeScoreAnimations.push(animate(counter, {
        value: { from: 0, to: Math.round(teamAvgElo.value.b), duration: 900, ease: 'outExpo' },
        onUpdate: () => {
          const text = String(Math.round(counter.value));
          scoreBElements.forEach((el) => { el.textContent = text; });
        },
      }));
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
  <div ref="boardRef" class="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-6 py-6">
    <!-- 上排：队伍 A | 综合对比 | 队伍 B（对齐完美平台布局） -->
    <div class="grid min-h-[360px] shrink-0 grid-cols-12 gap-5">
      <!-- 队伍 A -->
      <div class="compare-entrance-panel main-section col-span-3 flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-sm transition-shadow duration-300 hover:shadow-md">
        <div class="flex items-center gap-2 border-b border-slate-100/80 bg-linear-to-r from-blue-50 to-transparent px-5 py-3">
          <UserCheck class="h-4 w-4 text-blue-500" />
          <h2 class="text-[14px] font-bold text-blue-600">队伍 A</h2>
        </div>

        <div class="flex flex-1 flex-col p-4">
          <Team5ePlayerRow :players="teamA.players" variant="a" @player-click="onPlayerClick" />

          <div class="mb-2 text-center">
            <div class="mb-0.5 text-[12px] font-medium text-slate-500">队伍平均 ELO</div>
            <div class="score-a text-4xl font-black tracking-tight text-blue-600">{{ Math.round(teamAvgElo.a) }}</div>
            <div class="mt-1.5 flex items-center justify-center gap-4 text-[11px] text-slate-500">
              <div class="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                最高 <span class="font-bold text-slate-700">{{ Math.max(...teamA.players.map((p) => Math.round(p.score || 0))) }}</span>
              </div>
              <div class="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                最低 <span class="font-bold text-slate-700">{{ Math.min(...teamA.players.map((p) => Math.round(p.score || 0))) }}</span>
              </div>
            </div>
          </div>

          <div class="flex justify-center">
            <P5eRadarCompare
              :axes="radarAxesForA"
              primary-color="#3b82f6"
              secondary-color="#f97316"
              size="md"
            />
          </div>
        </div>
      </div>

      <!-- 综合对比 -->
      <div class="compare-entrance-panel main-section col-span-6 flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 px-8 py-6 shadow-sm backdrop-blur-sm transition-shadow duration-300 hover:shadow-md">
        <div class="mb-4 text-center">
          <div class="mb-3 inline-flex items-center justify-center rounded-full bg-slate-100/80 px-4 py-1.5">
            <h2 class="text-[13px] font-bold uppercase tracking-wider text-slate-600">综合对比分析</h2>
          </div>

          <div class="flex items-center justify-center gap-8">
            <span class="score-a text-4xl font-black tracking-tight text-blue-600">{{ Math.round(teamAvgElo.a) }}</span>
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-400 shadow-inner">VS</span>
            <span class="score-b text-4xl font-black tracking-tight text-orange-500">{{ Math.round(teamAvgElo.b) }}</span>
          </div>

          <div class="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100/80 shadow-inner">
            <div class="progress-fill h-full bg-linear-to-r from-blue-400 to-blue-500" :data-width="ratioWidth(teamAvgElo.a, teamAvgElo.b)" />
            <div class="progress-fill h-full bg-linear-to-l from-orange-400 to-orange-500" :data-width="ratioWidth(teamAvgElo.b, teamAvgElo.a)" />
          </div>
        </div>

        <div class="mt-5 flex flex-col gap-2.5 border-t border-slate-100 pt-4">
          <div
            v-for="(item, index) in coreMetrics"
            :key="item.key"
            class="compare-row flex items-center justify-between rounded-lg px-1 py-2 text-[13px] transition-colors hover:bg-slate-50/60"
            :class="{ 'border-b border-slate-100': index < coreMetrics.length - 1 }"
          >
            <span class="w-24 shrink-0 font-medium text-slate-600">{{ item.label }}</span>
            <div class="mx-3 flex min-w-0 flex-1 items-center gap-3">
              <span class="w-12 text-right font-bold text-blue-600">
                {{ formatCompareValue(item.a, item.isPct, item.decimals) }}
              </span>
              <div class="relative flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                <div
                  v-if="item.a != null && item.b != null"
                  class="progress-fill absolute inset-y-0 left-0 bg-blue-500"
                  :data-width="compareBarWidth(item.a, item.b, 'a')"
                />
                <div
                  v-if="item.a != null && item.b != null"
                  class="progress-fill absolute inset-y-0 right-0 bg-orange-500"
                  :data-width="compareBarWidth(item.a, item.b, 'b')"
                />
              </div>
              <span class="w-12 font-bold text-orange-500">
                {{ formatCompareValue(item.b, item.isPct, item.decimals) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 队伍 B -->
      <div class="compare-entrance-panel main-section col-span-3 flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-sm transition-shadow duration-300 hover:shadow-md">
        <div class="flex items-center gap-2 border-b border-slate-100/80 bg-linear-to-r from-orange-50 to-transparent px-5 py-3">
          <UserCheck class="h-4 w-4 text-orange-500" />
          <h2 class="text-[14px] font-bold text-orange-500">队伍 B</h2>
        </div>

        <div class="flex flex-1 flex-col p-4">
          <Team5ePlayerRow :players="teamB.players" variant="b" @player-click="onPlayerClick" />

          <div class="mb-2 text-center">
            <div class="mb-0.5 text-[12px] font-medium text-slate-500">队伍平均 ELO</div>
            <div class="score-b text-4xl font-black tracking-tight text-orange-500">{{ Math.round(teamAvgElo.b) }}</div>
            <div class="mt-1.5 flex items-center justify-center gap-4 text-[11px] text-slate-500">
              <div class="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                最高 <span class="font-bold text-slate-700">{{ Math.max(...teamB.players.map((p) => Math.round(p.score || 0))) }}</span>
              </div>
              <div class="flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1">
                最低 <span class="font-bold text-slate-700">{{ Math.min(...teamB.players.map((p) => Math.round(p.score || 0))) }}</span>
              </div>
            </div>
          </div>

          <div class="flex justify-center">
            <P5eRadarCompare
              :axes="radarAxesForB"
              primary-color="#f97316"
              secondary-color="#3b82f6"
              size="md"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 下排：当局数据卡片（仅 match 详情有数据时） -->
    <div v-if="fightMetrics.length" class="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
      <div
        v-for="metric in fightMetrics"
        :key="metric.key"
        class="compare-entrance-stat flex flex-col justify-between rounded-2xl border border-slate-200/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      >
        <div>
          <div class="mb-3 flex items-center gap-2 text-[13px] font-bold text-slate-600">
            <div class="flex h-6 w-6 items-center justify-center rounded-md bg-slate-50">
              <Crosshair class="h-3.5 w-3.5 text-slate-500" />
            </div>
            {{ metric.shortLabel }}
          </div>
          <div class="mb-3 flex items-center justify-between font-black">
            <span class="text-xl text-blue-600">{{ formatCompareValue(metric.a, metric.isPct, metric.decimals) }}</span>
            <span class="text-[11px] font-bold text-slate-300">VS</span>
            <span class="text-xl text-orange-500">{{ formatCompareValue(metric.b, metric.isPct, metric.decimals) }}</span>
          </div>
        </div>
        <div>
          <div class="relative mb-2.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100 shadow-inner">
            <div
              class="progress-fill-static absolute inset-y-0 left-0 bg-blue-500"
              :style="{ width: compareBarWidth(metric.a!, metric.b!, 'a') }"
            />
            <div
              class="progress-fill-static absolute inset-y-0 right-0 bg-orange-500"
              :style="{ width: compareBarWidth(metric.a!, metric.b!, 'b') }"
            />
          </div>
          <div class="flex justify-between text-[11px] font-medium text-slate-400">
            <span>A 队</span>
            <span>B 队</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 无当局数据时的提示 -->
    <div
      v-else
      class="compare-entrance-panel flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-[12px] text-slate-500"
    >
      <Swords class="h-4 w-4 shrink-0 text-slate-400" />
      K/D、爆头率等指标对比需要双方均有数据才会显示
    </div>
  </div>
</template>
