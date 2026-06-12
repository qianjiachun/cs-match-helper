<script setup lang="ts">
// @ts-ignore
import { animate, stagger } from 'animejs';
import { onMounted, onUnmounted, ref } from 'vue';

const gridContainer = ref<HTMLElement | null>(null);

let animation: any = null;

const columns = 14;
const rows = 6;
const totalDots = columns * rows;

onMounted(() => {
  if (!gridContainer.value) return;

  const dots = gridContainer.value.querySelectorAll('.ai-loading-dot');

  animation = animate(dots, {
    scale: [0.1, 1],
    opacity: [0.2, 1],
    delay: stagger(100, { grid: [columns, rows], from: 'center' }),
    loop: true,
    direction: 'alternate',
    duration: 1200,
    ease: 'easeInOutQuad'
  });
});

onUnmounted(() => {
  if (animation && typeof animation.pause === 'function') {
    animation.pause();
  }
});
</script>

<template>
  <div class="flex w-full flex-col items-center justify-center py-10">
    <div
      ref="gridContainer"
      class="grid gap-2.5"
      :style="{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }"
    >
      <div
        v-for="i in totalDots"
        :key="i"
        class="ai-loading-dot h-2 w-2 rounded-full bg-indigo-500"
      />
    </div>
    <div class="mt-8 flex flex-col items-center gap-2">
      <p class="animate-pulse text-[14px] font-semibold text-indigo-600">AI 数据分析中...</p>
      <p class="text-[11px] text-slate-500">正在分析对局，请稍候</p>
    </div>
  </div>
</template>

<style scoped>
.ai-loading-dot {
  will-change: transform, opacity;
}
</style>
