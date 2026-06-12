<script setup lang="ts">
import type { MatchTeam } from '@core/match/models';

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
      <h3 class="text-[13px] font-semibold text-fg">队伍 {{ team.side }}</h3>
      <span class="text-[11px] text-fg-muted">{{ team.players.length }} 人</span>
    </div>

    <dl class="grid grid-cols-2 gap-2">
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">均分</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ fmt(team.avgScore) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">均 Rating</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ fmt(team.avgRating, 2) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">近期胜率</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ pct(team.recentWinRate) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">地图胜率</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ pct(team.mapWinRate) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">均 WE</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ fmt(team.avgWe, 1) }}</dd>
      </div>
      <div class="rounded-md bg-surface px-2 py-1.5">
        <dt class="text-[9px] text-fg-muted">单排</dt>
        <dd class="text-[13px] font-semibold text-fg">{{ team.singleCount }}/5</dd>
      </div>
    </dl>

    <p v-if="team.partyGroups.length > 0" class="mt-2 text-[10px] text-fg-secondary">
      组排: {{ team.partyGroups.map((n) => `${n}人`).join('、') }}
    </p>
  </section>
</template>
