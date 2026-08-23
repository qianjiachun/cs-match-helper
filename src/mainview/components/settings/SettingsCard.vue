<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  title: string;
  description?: string;
  icon?: Component;
  iconSrc?: string;
}>();
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
    <header
      v-if="title"
      class="flex items-start gap-3 border-b border-border-subtle bg-elevated/50 px-5 py-4"
    >
      <div
        v-if="icon || iconSrc"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        :class="iconSrc ? 'bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06)]' : 'bg-accent/10 text-accent'"
      >
        <img v-if="iconSrc" :src="iconSrc" alt="" class="h-7 w-7 object-contain" draggable="false" />
        <component :is="icon" v-else class="h-4 w-4" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <h3 class="text-[14px] font-semibold text-fg">{{ title }}</h3>
        <p v-if="description" class="mt-0.5 text-[12px] leading-relaxed text-fg-muted">{{ description }}</p>
      </div>
    </header>
    <div class="space-y-4 p-5">
      <slot />
    </div>
  </section>
</template>
