<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MatchPlayer, PerfectHotMap } from '@core/match/models';
import {
  getPerfectMapFamiliarity,
  getPerfectMapMetrics,
  summarizePerfectMapPool,
  type PerfectMapFamiliarityTier,
} from '@platforms/perfect/map-pool';
import { localize as l } from '../i18n';

const props = defineProps<{ player: MatchPlayer; currentMap?: string }>();
const failedImages = ref(new Set<string>());
const summary = computed(() => summarizePerfectMapPool(props.player, props.currentMap));
const meterSegments = [0, 1, 2, 3, 4];
const overviewMaps = computed(() => summary.value.topMaps.map((entry) => ({
  entry,
  familiarity: getPerfectMapFamiliarity(props.player, entry.map),
  metrics: getPerfectMapMetrics(props.player, entry),
})));
const overviewPrimary = computed(() => overviewMaps.value[0]);
const overviewMapLabel = computed(() => overviewPrimary.value?.entry.map.replace(/^de_/, '') || '—');
const overviewImage = computed(() => overviewPrimary.value ? mapVisual(overviewPrimary.value.entry) : undefined);
const overviewUsesLogo = computed(() => Boolean(
  overviewPrimary.value?.entry.mapLogo
  && overviewImage.value === overviewPrimary.value.entry.mapLogo,
));

function mapName(entry?: PerfectHotMap, fallback?: string): string {
  return entry?.mapName || entry?.map.replace(/^de_/, '') || fallback?.replace(/^de_/, '') || l('未知地图', 'Unknown map');
}

function mapVisual(entry: PerfectHotMap): string | undefined {
  return [entry.mapLogo, entry.mapImage]
    .find((src): src is string => Boolean(src) && !failedImages.value.has(src!));
}

function markImageFailed(src: string) {
  failedImages.value = new Set([...failedImages.value, src]);
}

function tierLabel(tier?: PerfectMapFamiliarityTier): string {
  if (tier === 'specialist') return l('专精', 'Specialist');
  if (tier === 'skilled') return l('熟练', 'Skilled');
  if (tier === 'experienced') return l('有经验', 'Experienced');
  if (tier === 'limited') return l('本季少玩', 'Limited this season');
  return l('无记录', 'No data');
}

function compactTierLabel(tier?: PerfectMapFamiliarityTier): string {
  if (tier === 'specialist') return l('专精', 'Expert');
  if (tier === 'skilled') return l('熟练', 'Skilled');
  if (tier === 'experienced') return l('经验', 'Known');
  if (tier === 'limited') return l('少玩', 'Few');
  return l('暂无', 'None');
}

function tierClass(tier?: PerfectMapFamiliarityTier, strong = false): string {
  if (strong) return 'bg-violet-50 text-violet-700 ring-violet-200';
  if (tier === 'specialist') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (tier === 'skilled') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (tier === 'experienced') return 'bg-sky-50 text-sky-700 ring-sky-200';
  if (tier === 'limited') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-slate-50 text-slate-400 ring-slate-200';
}

function currentTierLabel(): string {
  return summary.value.strongPerformance
    ? l('强图', 'Strong')
    : compactTierLabel(summary.value.familiarity?.tier);
}

function meterClass(tier?: PerfectMapFamiliarityTier, strong = false): string {
  if (strong) return 'bg-violet-500';
  if (tier === 'specialist') return 'bg-amber-500';
  if (tier === 'skilled') return 'bg-emerald-500';
  if (tier === 'experienced') return 'bg-sky-500';
  return 'bg-slate-400';
}

function activeSegments(score = 0): number {
  return score <= 0 ? 0 : Math.ceil(score / 20);
}

function pct(value?: number): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function fixed(value?: number, digits = 2): string {
  return value == null ? '—' : value.toFixed(digits);
}

function currentTooltip(): string {
  const item = summary.value;
  const metrics = item.metrics;
  const familiarity = item.familiarity;
  return [
    mapName(item.current, props.currentMap),
    `${l('熟练度', 'Familiarity')} ${familiarity?.score ?? 0}/100 (${tierLabel(familiarity?.tier)})`,
    `${metrics?.matches ?? 0} ${l('场', 'matches')} · ${l('赛季占比', 'Season share')} ${pct(metrics?.share)}`,
    `${l('胜率', 'Win rate')} ${pct(metrics?.winRate)} · Rating ${fixed(metrics?.rating)} · ADR ${fixed(metrics?.adr, 1)}`,
    `K/D ${fixed(metrics?.kd)} · RWS ${fixed(metrics?.rws)} · ${l('首杀对枪', 'Opening duels')} ${pct(metrics?.openingDuelRate)} · ${l('爆头率', 'Headshot rate')} ${pct(metrics?.headshotRate)}`,
    metrics?.roundWinRate != null
      ? `${l('回合胜率', 'Round win rate')} ${pct(metrics.roundWinRate)} · CT ${pct(metrics.ctRoundWinRate)} · T ${pct(metrics.tRoundWinRate)} · ${l('火力', 'Firepower')} ${metrics.firePower ?? '—'}`
      : '',
    item.current ? `MVP ${item.current.matchMvpNum ?? '—'} · 3K ${item.current.threeKillNum ?? '—'} · 4K ${item.current.fourKillNum ?? '—'} · 5K ${item.current.fiveKillNum ?? '—'}` : '',
    l('标签只基于当前赛季。专精需要至少 25 场且占比不低于 25%，或单图至少 40 场；强图至少需要 10 场且表现显著高于赛季水平。', 'Labels use current-season evidence only. Specialist requires 25+ matches with at least 25% share, or 40+ matches on the map. Strong requires 10+ matches and performance above the season baseline.'),
  ].filter(Boolean).join('\n');
}

function overviewTooltip(entry: PerfectHotMap): string {
  const familiarity = getPerfectMapFamiliarity(props.player, entry.map);
  const metrics = getPerfectMapMetrics(props.player, entry);
  return `${mapName(entry)} · ${tierLabel(familiarity.tier)} ${familiarity.score}/100 · ${metrics.matches} ${l('场', 'matches')} · ${l('占比', 'share')} ${pct(metrics.share)} · ${l('胜率', 'win rate')} ${pct(metrics.winRate)} · Rating ${fixed(metrics.rating)}`;
}
</script>

<template>
  <div
    v-if="summary.mode === 'current'"
    data-map-pool-mode="current"
    class="flex h-8 max-h-8 min-w-0 flex-col justify-center overflow-hidden text-left"
    :title="currentTooltip()"
  >
    <div class="grid min-w-0 grid-cols-[30px_42px_22px] items-center gap-x-1 leading-none">
      <span class="inline-flex w-7.5 min-w-0 items-center justify-center truncate rounded-sm px-0.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset" :class="tierClass(summary.familiarity?.tier, summary.strongPerformance)">
        {{ currentTierLabel() }}
      </span>
      <span
        class="flex w-10.5 gap-0.5"
        role="meter"
        :aria-label="l('地图熟练度', 'Map familiarity')"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="summary.familiarity?.score ?? 0"
      >
        <span
          v-for="segment in meterSegments"
          :key="segment"
          class="h-1.5 flex-1 rounded-[1px]"
          :class="segment < activeSegments(summary.familiarity?.score) ? meterClass(summary.familiarity?.tier, summary.strongPerformance) : 'bg-slate-200'"
        />
      </span>
      <span class="w-5.5 text-right text-[11px] font-bold tabular-nums text-slate-700">{{ summary.familiarity?.score ?? 0 }}</span>
    </div>
    <div class="mt-1 truncate text-[9px] leading-none tabular-nums text-slate-500">
      {{ summary.metrics?.matches ?? 0 }}{{ l('场', ' matches') }} · {{ l('占比', 'Share') }} {{ pct(summary.metrics?.share) }} · {{ l('胜率', 'WR') }} {{ pct(summary.metrics?.winRate) }}
    </div>
  </div>

  <div
    v-else-if="summary.mode === 'overview' && overviewPrimary"
    data-map-pool-mode="overview"
    class="flex h-8 max-h-8 min-w-0 items-center gap-1.5 overflow-hidden text-left"
    :title="overviewTooltip(overviewPrimary.entry)"
  >
    <div
      v-if="overviewImage"
      class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-50 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
    >
      <img
        :src="overviewImage"
        :alt="mapName(overviewPrimary.entry)"
        :class="overviewUsesLogo
          ? 'max-h-4.5 max-w-4.5 object-contain'
          : 'h-6 w-6 rounded-md object-cover outline-1 -outline-offset-1 outline-black/10'"
        @error="markImageFailed(overviewImage)"
      >
    </div>
    <div class="flex min-w-0 flex-1 flex-col justify-center">
      <div class="flex min-w-0 items-center gap-0.5 leading-none">
        <span
          class="inline-flex w-7.5 shrink-0 items-center justify-center truncate rounded-sm px-0.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset"
          :class="tierClass(overviewPrimary.familiarity.tier)"
        >
          {{ compactTierLabel(overviewPrimary.familiarity.tier) }}
        </span>
        <span
          class="flex min-w-7 flex-1 gap-0.5"
          role="meter"
          :aria-label="l('主要地图熟练度', 'Top map familiarity')"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="overviewPrimary.familiarity.score"
        >
          <span
            v-for="segment in meterSegments"
            :key="segment"
            class="h-1.5 flex-1 rounded-[1px]"
            :class="segment < activeSegments(overviewPrimary.familiarity.score)
              ? meterClass(overviewPrimary.familiarity.tier)
              : 'bg-slate-200'"
          />
        </span>
        <span class="w-5 shrink-0 text-right text-[10px] font-bold tabular-nums text-slate-700">
          {{ overviewPrimary.familiarity.score }}
        </span>
      </div>
      <div class="mt-1 truncate whitespace-nowrap text-[9px] leading-none tabular-nums text-slate-500">
        <span class="font-medium text-slate-600">{{ overviewMapLabel }}</span>
        · {{ overviewPrimary.metrics.matches }}{{ l('场', ' matches') }} · {{ pct(overviewPrimary.metrics.share) }}
      </div>
    </div>
  </div>

  <span v-else class="flex h-8 items-center text-[11px] text-slate-400">{{ l('暂无图池', 'No map data') }}</span>
</template>
