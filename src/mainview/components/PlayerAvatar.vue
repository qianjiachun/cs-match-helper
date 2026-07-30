<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { localize as l } from '../i18n';

const props = withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    shape?: 'circle' | 'rounded';
  }>(),
  {
    size: 'md',
    shape: 'circle',
  },
);

const loadFailed = ref(false);
const resolvedAlt = computed(() => props.alt ?? l('玩家头像', 'Player avatar'));

watch(
  () => props.src,
  () => {
    loadFailed.value = false;
  },
);

const sizeClass = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[12px]',
  lg: 'h-11 w-11 text-[13px]',
}[props.size];

const shapeClass = props.shape === 'circle' ? 'rounded-full' : 'rounded-md';

function onError() {
  loadFailed.value = true;
}

const fallbackText = () => (resolvedAlt.value.trim().charAt(0) || '?').toUpperCase();
</script>

<template>
  <img
    v-if="src && !loadFailed"
    :src="src"
    :alt="resolvedAlt"
    :class="[sizeClass, shapeClass, 'bg-slate-200 object-cover']"
    referrerpolicy="no-referrer"
    @error="onError"
  />
  <div
    v-else
    :class="[
      sizeClass,
      shapeClass,
      'flex items-center justify-center bg-slate-200 font-semibold text-slate-500',
    ]"
    :aria-label="resolvedAlt"
  >
    {{ fallbackText() }}
  </div>
</template>
