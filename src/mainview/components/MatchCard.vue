<script setup lang="ts">
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Hash,
  MapPin,
  Swords,
  Users,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import type { MatchRecord } from '@core/match/models';
import { useMatchCountdown } from '../composables/useMatchCountdown';
import MatchInsightsPanel from './MatchInsightsPanel.vue';
import TeamColumn from './TeamColumn.vue';

const props = defineProps<{
  match: MatchRecord;
  featured?: boolean;
}>();

const expanded = ref(false);
const showRaw = ref(false);

watch(
  () => props.featured,
  (v) => {
    if (v) expanded.value = true;
  },
  { immediate: true },
);

function formatTime(time?: string): string {
  if (!time) return '刚刚';
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const detail = computed(() => props.match.detail);
const teamA = computed(() => detail.value.teams.find((t) => t.side === 'A'));
const teamB = computed(() => detail.value.teams.find((t) => t.side === 'B'));
const hasTeams = computed(() => detail.value.teams.length >= 2);
const hasWarnings = computed(() => detail.value.parseWarnings.length > 0);
const mapName = computed(() => props.match.summary.mapName ?? detail.value.mapName);

const { timeLeftSec: countdownSec, isActive: hasCountdown } = useMatchCountdown(
  () => detail.value.readyDeadlineAt,
);

const extraFields = computed(() => {
  const skip = new Set([
    'players_list', 'players', 'player_list', 'playerlist_extrainfo',
    'map_name', 'mapName', 'map', 'map_id',
    'server_name', 'serverName', 'server', 'svr_name',
    'game_mode', 'gameMode', 'mode', 'match_type',
    'platform_game_id', 'ready_left_time_ms',
  ]);
  return Object.entries(props.match.data)
    .filter(([key, val]) => !skip.has(key) && val !== null && val !== undefined && typeof val !== 'object')
    .slice(0, 12)
    .map(([key, val]) => ({ key, value: String(val) }));
});

const fallbackPlayers = computed(() => {
  if (hasTeams.value) return [];
  const list = props.match.data.players_list ?? props.match.data.players ?? props.match.data.player_list;
  if (!Array.isArray(list)) return [];
  return list.map((p, i) => {
    if (typeof p === 'string') return { name: p };
    if (p && typeof p === 'object') {
      const obj = p as Record<string, unknown>;
      return {
        name: String(obj.name ?? obj.nick_name ?? obj.nickname ?? obj.player_name ?? `玩家 ${i + 1}`),
      };
    }
    return { name: `玩家 ${i + 1}` };
  });
});
</script>

<template>
  <article
    class="overflow-hidden rounded-xl border bg-surface shadow-sm transition-shadow duration-200"
    :class="featured ? 'border-accent/30 shadow-md' : 'border-border hover:shadow-md'"
  >
    <!-- 对阵信息条 -->
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3"
      :class="featured ? 'bg-elevated' : 'bg-base'"
    >
      <div class="flex items-center gap-1.5">
        <Swords class="h-4 w-4 text-accent" />
        <span class="text-[13px] font-semibold text-fg">
          {{ match.summary.mode ?? '匹配成功' }}
        </span>
        <span
          v-if="featured"
          class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
        >
          最新
        </span>
      </div>

      <div v-if="mapName" class="flex items-center gap-1.5 text-[12px] text-fg-secondary">
        <MapPin class="h-3.5 w-3.5 text-fg-muted" />
        <span class="font-medium text-fg">{{ mapName }}</span>
      </div>

      <div
        v-if="hasCountdown"
        class="flex items-center gap-1.5 text-[12px] text-warning"
      >
        <Clock class="h-3.5 w-3.5" />
        {{ countdownSec }}s 确认
      </div>

      <div class="flex items-center gap-1.5 text-[12px] text-fg-muted">
        <Users class="h-3.5 w-3.5" />
        {{ match.summary.playerCount }} 人
      </div>

      <div
        v-if="detail.platformGameId"
        class="flex items-center gap-1.5 text-[11px] text-fg-muted"
      >
        <Hash class="h-3 w-3" />
        {{ detail.platformGameId }}
      </div>

      <time class="ml-auto text-[11px] text-fg-muted">{{ formatTime(match.time) }}</time>
    </div>

    <div
      v-if="hasWarnings"
      class="flex items-start gap-2 border-b border-border bg-warning/5 px-4 py-2.5 text-[11px] text-fg-secondary"
    >
      <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <span>{{ detail.parseWarnings.join('；') }}</span>
    </div>

    <!-- Featured：直接展示 VS 对阵 -->
    <template v-if="featured && hasTeams">
      <div class="relative grid lg:grid-cols-2 lg:divide-x lg:divide-border">
        <div
          class="absolute left-1/2 top-8 z-10 hidden -translate-x-1/2 lg:flex"
          aria-hidden="true"
        >
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-[11px] font-bold text-fg-muted shadow-sm"
          >
            VS
          </span>
        </div>

        <div class="p-4 lg:pr-6">
          <TeamColumn
            v-if="teamA"
            :team="teamA"
            :highlight="detail.insights?.strongerSide === 'A'"
            featured
          />
        </div>
        <div class="border-t border-border p-4 lg:border-t-0 lg:pl-6">
          <TeamColumn
            v-if="teamB"
            :team="teamB"
            :highlight="detail.insights?.strongerSide === 'B'"
            featured
          />
        </div>
      </div>

      <div class="border-t border-border bg-base px-4 py-4">
        <MatchInsightsPanel :insights="detail.insights" />
      </div>
    </template>

    <!-- 非 featured 或无可分队数据：折叠详情 -->
    <template v-else>
      <button
        v-if="hasTeams || fallbackPlayers.length > 0 || extraFields.length > 0"
        type="button"
        class="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-border py-2.5 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span>{{ expanded ? '收起详情' : '查看详情' }}</span>
        <ChevronDown
          class="h-3.5 w-3.5 transition-transform duration-200"
          :class="expanded ? 'rotate-180' : ''"
        />
      </button>

      <div v-if="expanded" class="space-y-4 border-t border-border bg-base px-4 py-4">
        <template v-if="hasTeams">
          <div class="grid gap-4 lg:grid-cols-2">
            <TeamColumn
              v-if="teamA"
              :team="teamA"
              :highlight="detail.insights?.strongerSide === 'A'"
            />
            <TeamColumn
              v-if="teamB"
              :team="teamB"
              :highlight="detail.insights?.strongerSide === 'B'"
            />
          </div>
          <MatchInsightsPanel :insights="detail.insights" />
        </template>

        <div v-else-if="fallbackPlayers.length > 0">
          <p class="mb-2 text-[11px] font-medium text-fg-muted">玩家列表（基础数据）</p>
          <ul class="grid grid-cols-2 gap-1.5">
            <li
              v-for="(player, index) in fallbackPlayers"
              :key="index"
              class="rounded-md bg-surface px-2.5 py-1.5 text-[12px] text-fg-secondary"
            >
              {{ player.name }}
            </li>
          </ul>
        </div>

        <div v-if="detail.unassigned.length > 0">
          <p class="mb-2 text-[11px] font-medium text-fg-muted">未分队玩家</p>
          <ul class="space-y-1.5">
            <li
              v-for="p in detail.unassigned"
              :key="p.steamId"
              class="text-[12px] text-fg-secondary"
            >
              {{ p.nickname }}
            </li>
          </ul>
        </div>

        <button
          type="button"
          class="cursor-pointer text-[11px] text-fg-muted underline-offset-2 transition-colors hover:text-fg-secondary hover:underline"
          @click="showRaw = !showRaw"
        >
          {{ showRaw ? '隐藏原始字段' : '查看原始字段' }}
        </button>

        <dl v-if="showRaw && extraFields.length > 0" class="grid grid-cols-2 gap-2">
          <div
            v-for="field in extraFields"
            :key="field.key"
            class="rounded-md bg-surface px-2.5 py-1.5"
          >
            <dt class="truncate text-[10px] text-fg-muted">{{ field.key }}</dt>
            <dd class="truncate text-[12px] font-medium text-fg">{{ field.value }}</dd>
          </div>
        </dl>
      </div>
    </template>
  </article>
</template>
