<script setup lang="ts">
import { computed } from 'vue';
import type { MatchPlatformId } from '@core/match/models';
import { getPlatformLogo } from '../utils/platform-logos';

const props = withDefaults(
  defineProps<{
    platformId?: MatchPlatformId;
    size?: 'sm' | 'md';
  }>(),
  {
    platformId: 'perfect',
    size: 'sm',
  },
);

const logo = computed(() => getPlatformLogo(props.platformId));

const sizeClass = computed(() => (props.size === 'md' ? 'h-6 w-6' : 'h-5 w-5'));
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
