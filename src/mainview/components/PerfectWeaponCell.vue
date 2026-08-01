<script setup lang="ts">
import { computed, ref } from 'vue';
import { Crosshair } from 'lucide-vue-next';
import type { PerfectWeaponSummary } from '@core/match/models';
import { localize as l } from '../i18n';

const props = defineProps<{ weapons?: PerfectWeaponSummary[] }>();
const failedImages = ref(new Set<string>());
const weapon = computed(() => props.weapons?.[0]);

function markImageFailed(src: string) {
  failedImages.value = new Set([...failedImages.value, src]);
}

function weaponName(value: PerfectWeaponSummary): string {
  return value.nameZh || value.name;
}

function pct(value?: number): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function gradeClass(grade?: string): string {
  if (grade === 'S' || grade === 'A') return 'text-emerald-600';
  if (grade === 'B') return 'text-sky-600';
  if (grade === 'C') return 'text-amber-600';
  return 'text-slate-500';
}

function tooltip(value: PerfectWeaponSummary): string {
  return [
    `${weaponName(value)} · ${value.killNum} ${l('击杀', 'kills')} · ${value.matchNum ?? '—'} ${l('场', 'matches')}`,
    `TTK ${value.avgTimeToKill != null ? `${Math.round(value.avgTimeToKill)}ms` : '—'} (${value.levelAvgTimeToKill ?? '—'})`,
    `${l('爆头率', 'Headshot rate')} ${pct(value.headshotRate)}`,
    `${l('场均伤害', 'Avg damage')} ${value.avgDamage != null ? Math.round(value.avgDamage) : '—'} · ${l('伤害评级', 'Damage grade')} ${value.levelAvgDamage ?? '—'}`,
  ].join('\n');
}
</script>

<template>
  <div
    v-if="weapon"
    class="flex h-8 max-h-8 min-w-0 items-center gap-2 overflow-hidden text-left"
    :title="tooltip(weapon)"
    :aria-label="`${weaponName(weapon)}, TTK ${weapon.avgTimeToKill != null ? `${Math.round(weapon.avgTimeToKill)}ms` : '—'}, ${l('爆头率', 'headshot rate')} ${pct(weapon.headshotRate)}`"
  >
    <div class="min-w-0 shrink-0 text-center">
      <div class="flex h-5 w-11 items-center justify-center overflow-hidden">
        <img
          v-if="weapon.image && !failedImages.has(weapon.image)"
          :src="weapon.image"
          :alt="weaponName(weapon)"
          class="h-full w-full object-contain px-0.5"
          @error="markImageFailed(weapon.image)"
        >
        <Crosshair v-else :size="14" class="text-slate-400" aria-hidden="true" />
      </div>
      <div class="mt-0.5 w-11 truncate text-[8px] font-semibold leading-[8px] text-slate-600">{{ weaponName(weapon) }}</div>
    </div>

    <div class="grid min-w-0 flex-1 grid-cols-2 gap-1 text-center tabular-nums">
      <div class="min-w-0">
        <div class="text-[8px] leading-none text-slate-400">TTK</div>
        <div class="mt-1 flex items-baseline justify-center gap-0.5 whitespace-nowrap text-[10px] font-semibold leading-none text-slate-700">
          <span>{{ weapon.avgTimeToKill != null ? `${Math.round(weapon.avgTimeToKill)}ms` : '—' }}</span>
          <span class="text-[8px] font-bold" :class="gradeClass(weapon.levelAvgTimeToKill)">{{ weapon.levelAvgTimeToKill ?? '—' }}</span>
        </div>
      </div>
      <div class="min-w-0 border-l border-slate-200">
        <div class="text-[8px] leading-none text-slate-400">{{ l('爆头', 'HS') }}</div>
        <div class="mt-1 flex items-baseline justify-center gap-0.5 whitespace-nowrap text-[10px] font-semibold leading-none text-slate-700">
          <span>{{ pct(weapon.headshotRate) }}</span>
          <span class="text-[8px] font-bold" :class="gradeClass(weapon.levelHeadshotRate)">{{ weapon.levelHeadshotRate ?? '—' }}</span>
        </div>
      </div>
    </div>
  </div>
  <span v-else class="flex h-8 items-center text-[11px] text-slate-400">—</span>
</template>
