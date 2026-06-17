<script setup lang="ts">
import type { PartyBarPosition } from './team-table-shared';

defineProps<{
  color: string;
  position: PartyBarPosition;
  title?: string;
}>();
</script>

<template>
  <div
    class="pointer-events-none absolute left-1 z-10 w-[3px]"
    :title="title"
    :style="{ backgroundColor: color }"
    :class="[
      position === 'single' || position === 'top' ? 'top-2.5 rounded-t-[2px]' : 'top-0',
      position === 'single' || position === 'bottom' ? 'bottom-2.5 rounded-b-[2px]' : 'bottom-0',
    ]"
    aria-hidden="true"
  />
</template>
