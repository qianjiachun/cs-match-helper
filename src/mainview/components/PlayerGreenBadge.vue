<script setup lang="ts">
import iconGreen from '@/assets/icons/icon-green.svg';
import { localize as l } from '../i18n';

defineProps<{
  show?: boolean;
}>();
</script>

<template>
  <img
    v-if="show"
    :src="iconGreen"
    :alt="l('绿色玩家', 'Green-trusted player')"
    :title="l('绿色玩家', 'Green-trusted player')"
    class="inline-block h-[14px] w-auto shrink-0"
  />
</template>
