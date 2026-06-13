<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next';
import { computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    size?: 'xs' | 'sm' | 'md';
    badge?: boolean;
    /** 分析进行中：流光与光晕加快 */
    loading?: boolean;
    /** 静态展示：无渐变与动画 */
    static?: boolean;
  }>(),
  {
    size: 'md',
    badge: false,
    loading: false,
    static: false,
  },
);

const gradId = `ai-sparkle-grad-${useId().replace(/:/g, '')}`;
const shimmerDur = computed(() => (props.loading ? '1.1s' : '2.6s'));

const iconSize = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
} as const;

const badgeSize = {
  xs: 'h-6 w-6 rounded-lg',
  sm: 'h-7 w-7 rounded-lg',
  md: 'h-9 w-9 rounded-xl',
} as const;
</script>

<template>
  <span
    class="ai-sparkles-icon inline-flex shrink-0 items-center justify-center"
    :class="[
      badge ? ['ai-sparkles-icon--badge', badgeSize[size]] : '',
      loading ? 'ai-sparkles-icon--loading' : '',
      static ? 'ai-sparkles-icon--static' : '',
    ]"
    :style="static ? undefined : { '--ai-grad-url': `url(#${gradId})` }"
  >
    <svg v-if="!static" class="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
      <defs>
        <linearGradient
          :id="gradId"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="24"
          y2="24"
        >
          <stop offset="0%" stop-color="#818cf8" />
          <stop offset="18%" stop-color="#e879f9" />
          <stop offset="38%" stop-color="#fb7185" />
          <stop offset="58%" stop-color="#fb923c" />
          <stop offset="78%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#a78bfa" />
          <animate
            attributeName="x1"
            values="0;10;0"
            :dur="shimmerDur"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y1"
            values="0;4;0"
            :dur="shimmerDur"
            repeatCount="indefinite"
          />
          <animate
            attributeName="x2"
            values="24;34;24"
            :dur="shimmerDur"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y2"
            values="24;20;24"
            :dur="shimmerDur"
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>
    </svg>
    <Sparkles :class="[iconSize[size], 'ai-sparkles-icon__svg']" aria-hidden="true" />
  </span>
</template>

<style scoped>
.ai-sparkles-icon {
  position: relative;
}

.ai-sparkles-icon--static.ai-sparkles-icon--badge {
  background: color-mix(in srgb, var(--color-accent) 12%, white);
  animation: none;
  box-shadow: none;
}

.ai-sparkles-icon--static .ai-sparkles-icon__svg {
  animation: none;
  filter: none;
  color: var(--color-accent);
}

.ai-sparkles-icon--static .ai-sparkles-icon__svg :deep(path),
.ai-sparkles-icon--static .ai-sparkles-icon__svg :deep(line),
.ai-sparkles-icon--static .ai-sparkles-icon__svg :deep(circle),
.ai-sparkles-icon--static .ai-sparkles-icon__svg :deep(polyline),
.ai-sparkles-icon--static .ai-sparkles-icon__svg :deep(rect) {
  stroke: currentColor;
}

.ai-sparkles-icon--badge {
  background: linear-gradient(
    125deg,
    rgb(129 140 248 / 0.42),
    rgb(232 121 249 / 0.38),
    rgb(251 113 133 / 0.36),
    rgb(251 146 60 / 0.34),
    rgb(34 211 238 / 0.32)
  );
  background-size: 320% 320%;
  animation: ai-sparkles-bg 2.8s ease-in-out infinite;
  box-shadow: 0 0 12px rgb(167 139 250 / 0.3);
}

.ai-sparkles-icon--loading.ai-sparkles-icon--badge {
  animation-duration: 1.3s;
  box-shadow: 0 0 16px rgb(167 139 250 / 0.45);
}

.ai-sparkles-icon__svg {
  animation: ai-sparkles-glow 2.6s ease-in-out infinite;
}

.ai-sparkles-icon--loading .ai-sparkles-icon__svg {
  animation: ai-sparkles-glow 1.1s ease-in-out infinite, ai-sparkles-breathe 1.1s ease-in-out infinite;
}

.ai-sparkles-icon__svg :deep(path),
.ai-sparkles-icon__svg :deep(line),
.ai-sparkles-icon__svg :deep(circle),
.ai-sparkles-icon__svg :deep(polyline),
.ai-sparkles-icon__svg :deep(rect) {
  stroke: var(--ai-grad-url);
}

@keyframes ai-sparkles-bg {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

@keyframes ai-sparkles-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 2px rgb(232 121 249 / 0.45))
      drop-shadow(0 0 5px rgb(34 211 238 / 0.25));
  }
  50% {
    filter: drop-shadow(0 0 5px rgb(232 121 249 / 0.75))
      drop-shadow(0 0 10px rgb(34 211 238 / 0.45))
      drop-shadow(0 0 14px rgb(251 146 60 / 0.2));
  }
}

@keyframes ai-sparkles-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.88;
  }
}
</style>
