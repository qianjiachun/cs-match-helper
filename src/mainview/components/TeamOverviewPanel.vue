<script setup lang="ts">
import type { MatchTeam } from '@core/match/models';
import { localize as l } from '../i18n';

defineProps<{
  team: MatchTeam;
  highlight?: boolean;
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
    class="rounded-lg border bg-base p-3"
    :class="highlight ? 'border-accent/40 ring-1 ring-accent/20' : 'border-border'"
  >
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-[13px] font-semibold text-fg">{{ l(`队伍 ${team.side}`, `Team ${team.side}`) }}</h3>
      <span class="text-[11px] text-fg-muted">{{ l(`${team.players.length} 人`, `${team.players.length} players`) }}</span>
    </div>

    <dl class="grid grid-cols-2 gap-2">
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">{{ l('均分', 'Avg. score') }}</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ fmt(team.avgScore) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">{{ l('均 Rating', 'Avg. Rating') }}</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ fmt(team.avgRating, 2) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">{{ l('近期胜率', 'Recent WR') }}</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ pct(team.recentWinRate) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">{{ l('地图胜率', 'Map WR') }}</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ pct(team.mapWinRate) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">{{ l('均 WE', 'Avg. WE') }}</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ fmt(team.avgWe, 1) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">{{ l('单排', 'Solo') }}</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ team.singleCount }}/5</dd>
      </div>
    </dl>

    <p v-if="team.partyGroups.length > 0" class="mt-2 text-[10px] text-fg-secondary">
      {{ l(`组排：${team.partyGroups.map((n) => `${n}人`).join('、')}`, `Parties: ${team.partyGroups.map((n) => `${n}-stack`).join(', ')}`) }}
    </p>
  </section>
</template>
