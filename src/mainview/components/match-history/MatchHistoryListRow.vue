<script setup lang="ts">
import type { MatchHistoryListItem } from '@core/match/history';
import { resolveMapAsset } from '@core/match/history/map-assets';
import { Map, X } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import PlatformLogo from '../PlatformLogo.vue';
import {
  formatHistoryTime,
  formatMatchAvgScore,
  historyMapEnCaption,
  historyPrimaryMapTitle,
  platformLabel,
} from '../../utils/matchHistoryDisplay';

const props = defineProps<{
  item: MatchHistoryListItem;
  staggerIndex?: number;
}>();

const emit = defineEmits<{
  open: [];
  remove: [event: Event];
}>();

const imgFailed = ref(false);

watch(
  () => props.item.mapName,
  () => {
    imgFailed.value = false;
  },
);

const asset = computed(() => resolveMapAsset(props.item.mapName));
const imageUrl = computed(() => (imgFailed.value ? null : asset.value?.imageUrl ?? null));
const showMapPlaceholder = computed(() => !imageUrl.value);
const mapPlaceholderLabel = computed(() =>
  props.item.mapName?.trim() && asset.value ? '暂无预览' : '未知地图',
);
const title = computed(() => historyPrimaryMapTitle(props.item));
const enCaption = computed(() => historyMapEnCaption(props.item));
const timeLabel = computed(() => formatHistoryTime(props.item.savedAt, props.item.matchTime));
const avgLabel = computed(() => formatMatchAvgScore(props.item.matchAvgScore));

const platformId = computed(() =>
  props.item.platformId === '5e' || props.item.platformId === 'perfect'
    ? props.item.platformId
    : 'perfect',
);

const platformName = computed(() => platformLabel(props.item.platformId));

const placeholderTone = computed(() => {
  if (props.item.platformId === '5e') return 'from-amber-200/80 via-orange-100 to-amber-50';
  if (props.item.platformId === 'perfect') return 'from-sky-200/80 via-blue-100 to-sky-50';
  return 'from-slate-200 via-slate-100 to-slate-50';
});

const placeholderIconTone = computed(() => {
  if (props.item.platformId === '5e') return 'text-amber-500/70';
  if (props.item.platformId === 'perfect') return 'text-sky-500/70';
  return 'text-slate-400';
});

function onImgError() {
  imgFailed.value = true;
}
</script>

<template>
  <li
    class="group relative flex cursor-pointer items-center gap-4 rounded-2xl bg-white p-3 pr-5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] ring-1 ring-slate-200/60 transition-shadow duration-300 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.1)] hover:ring-slate-300 active:scale-[0.99] active:transition-transform active:duration-150 sm:gap-5 sm:pr-6"
    :style="
      staggerIndex === undefined
        ? undefined
        : { '--row-delay': `${Math.min(staggerIndex, 12) * 40}ms` }
    "
    @click="emit('open')"
  >
    <!-- Map Thumbnail -->
    <div class="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-[72px] sm:w-[128px]">
      <div
        class="absolute inset-0 bg-linear-to-br"
        :class="placeholderTone"
        aria-hidden="true"
      />

      <!-- Unknown / failed map: friendly illustrated placeholder -->
      <div
        v-if="showMapPlaceholder"
        class="absolute inset-0 flex flex-col items-center justify-center gap-1"
        aria-hidden="true"
      >
        <div
          class="pointer-events-none absolute inset-0 opacity-[0.35]"
          style="
            background-image:
              radial-gradient(circle at 20% 30%, rgba(255,255,255,0.7) 0%, transparent 45%),
              radial-gradient(circle at 80% 70%, rgba(255,255,255,0.45) 0%, transparent 40%),
              repeating-linear-gradient(
                -32deg,
                transparent,
                transparent 6px,
                rgba(15, 23, 42, 0.04) 6px,
                rgba(15, 23, 42, 0.04) 7px
              );
          "
        />
        <span
          class="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/70 shadow-sm ring-1 ring-black/5"
          :class="placeholderIconTone"
        >
          <Map class="h-4 w-4" />
        </span>
        <span class="relative text-[10px] font-semibold tracking-wide text-slate-500/90">
          {{ mapPlaceholderLabel }}
        </span>
      </div>

      <img
        v-if="imageUrl"
        :src="imageUrl"
        alt=""
        loading="lazy"
        draggable="false"
        class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        @error="onImgError"
      />
      <div class="absolute inset-0 rounded-xl ring-1 ring-inset ring-black/10" aria-hidden="true" />
    </div>

    <!-- Main copy -->
    <div class="flex min-w-0 flex-1 flex-col justify-center py-1">
      <div class="mb-1 flex min-w-0 items-center gap-2">
        <h2 class="truncate text-lg font-bold tracking-tight text-slate-900">
          {{ title }}
        </h2>
        <span
          class="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-semibold leading-5 text-slate-600"
          :title="platformName"
        >
          <PlatformLogo :platform-id="platformId" size="xxs" />
          {{ platformName }}
        </span>
        <span
          v-if="item.mode"
          class="inline-flex shrink-0 items-center rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-semibold leading-5 text-slate-600"
        >
          {{ item.mode }}
        </span>
      </div>
      <div class="flex min-w-0 items-center gap-2 text-sm text-slate-500">
        <span v-if="enCaption" class="truncate">{{ enCaption }}</span>
        <span v-if="enCaption" class="h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
        <span class="truncate">{{ timeLabel }}</span>
      </div>
    </div>

    <!-- Stats -->
    <div class="flex shrink-0 items-center">
      <div class="flex flex-col items-end justify-center">
        <span v-if="avgLabel" class="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Avg ELO
        </span>
        <span v-if="avgLabel" class="text-xl font-bold tracking-tight text-slate-900 tabular-nums">
          {{ avgLabel }}
        </span>
        <span v-else class="text-sm text-slate-300">—</span>
      </div>
    </div>

    <!-- Hover Action (Delete) -->
    <button
      type="button"
      class="absolute -right-2 -top-2 flex h-7 w-7 scale-90 items-center justify-center rounded-full bg-white text-slate-400 opacity-0 shadow-md ring-1 ring-slate-200/80 transition-[opacity,transform,color,box-shadow] duration-200 hover:text-rose-500 hover:ring-rose-200 group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100"
      aria-label="删除该对局"
      @click.stop="emit('remove', $event)"
    >
      <X class="h-3.5 w-3.5" />
    </button>
  </li>
</template>

<style scoped>
.history-row-enter-active,
.history-row-appear-active {
  transition:
    opacity 280ms cubic-bezier(0.2, 0, 0, 1),
    transform 280ms cubic-bezier(0.2, 0, 0, 1);
  transition-delay: var(--row-delay, 0ms);
}

.history-row-enter-from,
.history-row-appear-from {
  opacity: 0;
  transform: translateY(6px);
}
</style>
