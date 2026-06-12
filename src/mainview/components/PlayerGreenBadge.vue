<script setup lang="ts">
import iconGreen from '@/assets/icons/icon-green.svg';

defineProps<{
  show?: boolean;
}>();
</script>

<template>
  <img
    v-if="show"
    :src="iconGreen"
    alt="绿色玩家"
    title="绿色玩家"
    class="inline-block h-[14px] w-auto shrink-0"
  />
</template>
