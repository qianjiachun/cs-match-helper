<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { animate } from 'animejs';
import type { PlatformId } from '@platforms/types';
import { getPlatformLogo } from '../utils/platform-logos';

const emit = defineEmits<{
  select: [platform: PlatformId];
}>();

const containerRef = ref<HTMLElement | null>(null);

const platforms: { id: PlatformId; name: string; desc: string }[] = [
  {
    id: 'perfect',
    name: '完美世界对战平台',
    desc: '自动检测对局数据，无需其他操作',
  },
  {
    id: '5e',
    name: '5E 对战平台',
    desc: '需通过本软件启动对战平台',
  },
];

function select(id: PlatformId) {
  emit('select', id);
}

onMounted(() => {
  const root = containerRef.value;
  if (!root) return;

  const title = root.querySelector('.platform-select__title');
  const cards = root.querySelectorAll('.platform-card');

  if (title) {
    animate(title, {
      opacity: [0, 1],
      translateY: [-8, 0],
      duration: 700,
      ease: 'outCubic',
    });
  }

  // Cards use CSS animations via classes for better performance with backdrop-blur
  cards.forEach((el, index) => {
    (el as HTMLElement).style.animationDelay = `${150 + index * 100}ms`;
    el.classList.add('animate-slide-up-fade');
  });
});
</script>

<template>
  <div ref="containerRef" class="platform-select relative flex min-h-full items-center justify-center overflow-hidden p-6 sm:p-12">
    <!-- Ambient Background Glows -->
    <div class="pointer-events-none absolute inset-0 bg-base" aria-hidden="true">
      <div class="absolute left-[10%] top-[10%] h-[40vw] w-[40vw] animate-[float_10s_ease-in-out_infinite_alternate] rounded-full bg-team-b opacity-[0.08] blur-[80px]"></div>
      <div class="absolute bottom-[10%] right-[10%] h-[35vw] w-[35vw] animate-[float_10s_ease-in-out_infinite_alternate-reverse] rounded-full bg-accent opacity-[0.08] blur-[80px]"></div>
    </div>

    <div class="relative z-10 w-full max-w-4xl">
      <header class="mb-10 text-center">
        <h1 class="platform-select__title text-2xl font-bold tracking-tight text-fg sm:text-3xl">选择对战平台</h1>
      </header>

      <div class="flex flex-col gap-5 sm:flex-row sm:justify-center" role="list">
        <button
          v-for="item in platforms"
          :key="item.id"
          type="button"
          class="platform-card opacity-0 group relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-border/40 bg-surface/40 p-6 text-center backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-surface/80 hover:shadow-lg sm:p-8"
          :class="item.id === '5e' ? 'hover:border-accent/30 hover:shadow-accent/5' : 'hover:border-team-b/30 hover:shadow-team-b/5'"
          role="listitem"
          @click="select(item.id)"
        >
          <!-- Hover Inner Glow -->
          <div 
            class="absolute inset-0 opacity-0 mix-blend-screen transition-opacity duration-300 group-hover:opacity-100"
            :class="item.id === '5e' ? 'bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--color-accent)_10%,transparent),transparent_60%)]' : 'bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--color-team-b)_10%,transparent),transparent_60%)]'"
          ></div>
          
          <div class="relative flex h-16 w-16 items-center justify-center transition-transform duration-300 group-hover:scale-105">
            <img
              :src="getPlatformLogo(item.id).src"
              :alt="getPlatformLogo(item.id).alt"
              class="h-14 w-14 object-contain"
              draggable="false"
            />
          </div>
          
          <div class="relative z-10 mt-1 flex flex-col gap-1.5">
            <h2 class="text-lg font-semibold tracking-wide text-fg">{{ item.name }}</h2>
            <p class="mx-auto max-w-56 text-xs leading-relaxed text-fg-muted">{{ item.desc }}</p>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes float {
  0% { transform: translate(0, 0); }
  100% { transform: translate(5%, 10%); }
}

@keyframes slideUpFade {
  0% { 
    opacity: 0; 
    transform: translateY(24px); 
  }
  100% { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

.animate-slide-up-fade {
  animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  will-change: transform, opacity;
}

@media (prefers-reduced-motion: reduce) {
  .platform-card, .animate-\[float_10s_ease-in-out_infinite_alternate\] {
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }
  .animate-slide-up-fade {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
</style>