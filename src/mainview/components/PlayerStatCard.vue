<script setup lang="ts">
import { Crosshair, MapPin, Target, TrendingUp, Trophy } from 'lucide-vue-next';
import type { MatchPlayer } from '@core/match/models';
import PlayerAvatar from './PlayerAvatar.vue';
import RadarMiniBars from './RadarMiniBars.vue';
import RecentTrend from './RecentTrend.vue';

defineProps<{
  player: MatchPlayer;
  compact?: boolean;
  teamSide?: 'A' | 'B';
}>();

function pct(n?: number): string {
  if (n == null) return '—';
  return `${Math.round(n * 100)}%`;
}
</script>

<template>
  <article
    class="rounded-lg border bg-surface p-2.5 transition-shadow duration-200 hover:shadow-sm"
    :class="
      teamSide === 'A'
        ? 'border-blue-100'
        : teamSide === 'B'
          ? 'border-orange-100'
          : 'border-border'
    "
  >
    <div class="flex gap-3">
      <div
        class="relative shrink-0 ring-2 ring-white"
        :class="teamSide === 'A' ? 'ring-blue-100' : teamSide === 'B' ? 'ring-orange-100' : 'ring-border'"
      >
        <PlayerAvatar :src="player.avatar" :alt="player.nickname" size="lg" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h4 class="truncate text-[13px] font-semibold text-fg">{{ player.nickname }}</h4>
            <p class="truncate text-[10px] text-fg-muted">{{ player.steamId }}</p>
          </div>
          <div class="shrink-0 text-right">
            <p v-if="player.score != null" class="flex items-center justify-end gap-0.5 text-[15px] font-bold text-fg">
              <Trophy class="h-3 w-3 text-accent" />
              {{ player.score }}
            </p>
            <p v-if="player.rating != null" class="flex items-center justify-end gap-0.5 text-[10px] text-fg-secondary">
              <TrendingUp class="h-2.5 w-2.5" />
              {{ player.rating.toFixed(2) }}
            </p>
          </div>
        </div>

        <div class="mt-1.5 flex flex-wrap gap-1">
          <span
            v-if="player.isSingle"
            class="rounded bg-base px-1.5 py-0.5 text-[9px] text-fg-secondary"
          >
            单排
          </span>
          <span
            v-if="player.isGreen"
            class="rounded bg-success/10 px-1.5 py-0.5 text-[9px] text-success"
          >
            绿色
          </span>
          <span
            v-if="player.isVip"
            class="rounded bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning"
          >
            VIP
          </span>
          <span
            v-for="tag in player.tags.filter((t) => !['单排', '绿色', 'VIP'].includes(t))"
            :key="tag"
            class="rounded bg-base px-1.5 py-0.5 text-[9px] text-fg-secondary"
          >
            {{ tag }}
          </span>
          <span
            v-if="player.mapSampleLow"
            class="flex items-center gap-0.5 rounded bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning"
          >
            <MapPin class="h-2.5 w-2.5" />
            样本少
          </span>
        </div>

        <dl v-if="!compact" class="mt-2 grid grid-cols-3 gap-1">
          <div class="rounded-md bg-base px-1.5 py-1 text-center">
            <dt class="text-[9px] text-fg-muted">近期</dt>
            <dd class="text-[11px] font-medium text-fg">{{ pct(player.recentWinRate) }}</dd>
          </div>
          <div class="rounded-md bg-base px-1.5 py-1 text-center">
            <dt class="text-[9px] text-fg-muted">赛季</dt>
            <dd class="text-[11px] font-medium text-fg">{{ pct(player.seasonWinRate) }}</dd>
          </div>
          <div class="rounded-md bg-base px-1.5 py-1 text-center">
            <dt class="text-[9px] text-fg-muted">地图</dt>
            <dd class="text-[11px] font-medium text-fg">{{ pct(player.mapWinRate) }}</dd>
          </div>
        </dl>

        <p
          v-if="!compact && player.adpr != null"
          class="mt-1.5 flex items-center gap-1 text-[10px] text-fg-muted"
        >
          <Crosshair class="h-2.5 w-2.5" />
          ADPR {{ player.adpr }}
          <span v-if="player.weAvg != null" class="ml-1 flex items-center gap-0.5">
            <Target class="h-2.5 w-2.5" />
            WE {{ player.weAvg.toFixed(1) }}
          </span>
        </p>
      </div>
    </div>

    <div v-if="!compact" class="mt-2.5 space-y-2 border-t border-border-subtle pt-2.5">
      <RecentTrend :player="player" />
      <RadarMiniBars :player="player" />
    </div>
  </article>
</template>
