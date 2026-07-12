<script setup lang="ts">
import { computed } from 'vue';
import type { MatchPlatformId } from '@core/match/models';
import { getPlatformLogo } from '../utils/platform-logos';

const props = withDefaults(
  defineProps<{
    platformId?: MatchPlatformId;
    size?: 'xxs' | 'xs' | 'sm' | 'md';
  }>(),
  {
    platformId: 'perfect',
    size: 'sm',
  },
);

const logo = computed(() => getPlatformLogo(props.platformId));

const sizeClass = computed(() => {
  if (props.size === 'md') return 'h-6 w-6';
  if (props.size === 'xs') return 'h-4 w-4';
  if (props.size === 'xxs') return 'h-3.5 w-3.5';
  return 'h-5 w-5';
});
</script>

<template>
  <img
    :src="logo.src"
    :alt="logo.alt"
    :title="logo.alt"
    class="shrink-0 object-contain"
    :class="sizeClass"
    draggable="false"
  />
</template>
