<script setup lang="ts">
import { Shield, Swords, TrendingUp, Users } from 'lucide-vue-next';
import type { MatchTeam } from '@core/match/models';
import PlayerStatCard from './PlayerStatCard.vue';

defineProps<{
  team: MatchTeam;
  highlight?: boolean;
  featured?: boolean;
}>();

function fmt(n?: number, digits = 0): string {
  if (n == null) return '—';
  return n.toFixed(digits);
}

function pct(n?: number): string {
  if (n == null) return '—';
  return `${Math.round(n * 100)}%`;
}
</script>

<template>
  <section
    class="flex h-full flex-col"
    :class="team.side === 'A' ? 'team-a' : 'team-b'"
  >
    <header
      class="mb-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2"
      :class="
        highlight
          ? 'bg-accent/10 ring-1 ring-accent/25'
          : team.side === 'A'
            ? 'bg-blue-50'
            : 'bg-orange-50'
      "
    >
      <div class="flex items-center gap-2">
        <Shield
          class="h-4 w-4"
          :class="team.side === 'A' ? 'text-blue-600' : 'text-orange-600'"
        />
        <h3 class="text-[13px] font-semibold text-fg">队伍 {{ team.side }}</h3>
        <span
          v-if="highlight"
          class="rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-white"
        >
          优势
        </span>
      </div>
      <div class="flex items-center gap-1 text-[11px] text-fg-muted">
        <Users class="h-3 w-3" />
        {{ team.players.length }}
      </div>
    </header>

    <dl class="mb-3 grid grid-cols-3 gap-1.5">
      <div class="rounded-md bg-surface px-2 py-1.5 text-center shadow-sm">
        <dt class="flex items-center justify-center gap-0.5 text-[9px] text-fg-muted">
          <Swords class="h-2.5 w-2.5" />
          均分
        </dt>
        <dd class="text-[13px] font-bold text-fg">{{ fmt(team.avgScore) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5 text-center shadow-sm">
        <dt class="flex items-center justify-center gap-0.5 text-[9px] text-fg-muted">
          <TrendingUp class="h-2.5 w-2.5" />
          Rating
        </dt>
        <dd class="text-[13px] font-bold text-fg">{{ fmt(team.avgRating, 2) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5 text-center shadow-sm">
        <dt class="text-[9px] text-fg-muted">近期胜</dt>
        <dd class="text-[13px] font-bold text-fg">{{ pct(team.recentWinRate) }}</dd>
      </div>
    </dl>

    <div class="space-y-2">
      <PlayerStatCard
        v-for="p in team.players"
        :key="p.steamId"
        :player="p"
        :compact="!featured"
        :team-side="team.side"
      />
    </div>
  </section>
</template>
