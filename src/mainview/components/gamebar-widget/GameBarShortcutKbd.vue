<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_GAME_BAR_OPEN_SHORTCUT, parseGameBarShortcut } from '@core/gamebar-widget/shortcut';

const props = withDefaults(
  defineProps<{
    shortcut?: string | null;
    size?: 'sm' | 'md';
  }>(),
  {
    shortcut: null,
    size: 'md',
  },
);

const parts = computed(() =>
  parseGameBarShortcut(props.shortcut?.trim() || DEFAULT_GAME_BAR_OPEN_SHORTCUT),
);

const kbdClass = computed(() =>
  props.size === 'sm'
    ? 'mx-0.5 rounded border border-border bg-base px-1 py-0.5 text-[10px] font-semibold'
    : 'mx-0.5 rounded border border-border bg-elevated px-1.5 py-0.5 text-[11px] font-semibold',
);
</script>

<template>
  <span class="inline-flex flex-wrap items-center">
    <template v-for="(part, index) in parts" :key="`${part}-${index}`">
      <span v-if="index > 0" class="mx-0.5 text-fg-muted">+</span>
      <kbd :class="kbdClass">{{ part }}</kbd>
    </template>
  </span>
</template>
