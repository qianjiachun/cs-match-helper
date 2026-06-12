<script setup lang="ts">
defineProps<{
  label?: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    type="button"
    class="no-drag inline-flex shrink-0 cursor-pointer items-center rounded-full border border-warning/30 bg-warning/10 text-warning transition-colors duration-200 hover:border-warning/50 hover:bg-warning/15"
    :class="compact ? 'gap-1 px-1.5 py-0.5 text-[10px] font-medium' : 'gap-1.5 px-2 py-0.5 text-[11px] font-semibold'"
    :aria-label="label ?? '发现新版本'"
    @click="emit('click')"
  >
    <span
      class="rounded-full bg-warning"
      :class="compact ? 'h-1.5 w-1.5' : 'h-1.5 w-1.5'"
      aria-hidden="true"
    />
    <span>{{ label ?? '有新版本' }}</span>
  </button>
</template>
