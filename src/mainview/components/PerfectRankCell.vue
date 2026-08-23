<script setup lang="ts">
import { computed } from 'vue';
import { Star } from 'lucide-vue-next';
import normalIcon from '@assets/platforms/perfect/ranks/s-normal.png';
import goldIcon from '@assets/platforms/perfect/ranks/s-gold.png';
import diamondIcon from '@assets/platforms/perfect/ranks/s-diamond.png';
import demonIcon from '@assets/platforms/perfect/ranks/s-demon.png';
import { getPerfectRankDisplay, type PerfectSTier } from '@platforms/perfect/rank';
import { localize as l } from '../i18n';

const props = withDefaults(defineProps<{
  score?: number;
  stars?: number;
  season?: string;
  variant?: 'current' | 'peak';
  scoreClass?: string;
}>(), {
  variant: 'current',
  scoreClass: 'text-slate-700',
});

const rank = computed(() => getPerfectRankDisplay(props.score, props.stars));

const iconByTier: Record<PerfectSTier, string> = {
  normal: normalIcon,
  gold: goldIcon,
  diamond: diamondIcon,
  demon: demonIcon,
};

function tierLabel(tier: PerfectSTier): string {
  if (tier === 'gold') return l('黄金 S', 'Gold S');
  if (tier === 'diamond') return l('钻石 S', 'Diamond S');
  if (tier === 'demon') return l('魔王 S', 'Demon S');
  return l('普通 S', 'S rank');
}

const label = computed(() => {
  const prefix = props.variant === 'peak'
    ? l('最高分', 'Peak score')
    : 'ELO';
  const season = props.season ? ` · ${props.season}` : '';
  if (rank.value.kind === 's') {
    return `${prefix}：${tierLabel(rank.value.tier)} · ${rank.value.stars} ${l('星', 'stars')}${season}`;
  }
  if (rank.value.kind === 'score') {
    return `${prefix}：${Math.round(rank.value.score)} ${l('分', 'points')}${season}`;
  }
  return `${prefix}：${l('暂无数据', 'No data')}`;
});
</script>

<template>
  <div
    class="flex h-8 min-w-[68px] items-center justify-center tabular-nums"
    :title="label"
    :aria-label="label"
  >
    <template v-if="rank.kind === 's'">
      <img
        :src="iconByTier[rank.tier]"
        alt=""
        aria-hidden="true"
        class="h-6 w-6 shrink-0 object-contain drop-shadow-[0_1px_1px_rgba(15,23,42,0.16)]"
      >
      <span class="ml-0.5 inline-flex min-w-7 items-center justify-start gap-px whitespace-nowrap text-[11px] font-bold text-slate-700">
        <Star :size="10" :stroke-width="2" class="fill-current text-amber-500" aria-hidden="true" />
        <span>{{ rank.stars }}</span>
      </span>
    </template>
    <span v-else-if="rank.kind === 'score'" class="whitespace-nowrap text-[13px] font-semibold" :class="scoreClass">
      {{ Math.round(rank.score) }}
    </span>
    <span v-else class="text-[11px] text-slate-400">—</span>
  </div>
</template>
