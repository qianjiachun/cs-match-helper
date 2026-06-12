<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { animate } from 'animejs';
import { stagger } from 'animejs';
import type { WatcherStatus } from '@core/types';

const props = defineProps<{
  watcher: WatcherStatus;
}>();

const containerRef = ref<HTMLElement | null>(null);

const showPlatformHint = computed(
  () =>
    props.watcher.running &&
    (props.watcher.logSourceLost || !props.watcher.fileExists),
);

const orbits = [
  { size: 100, dotSize: 5, duration: 6 },
  { size: 160, dotSize: 7, duration: 10 },
  { size: 220, dotSize: 4, duration: 15 },
];

onMounted(() => {
  if (!containerRef.value) return;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const orb = containerRef.value.querySelector('.wait__orb');
  const orbitWrappers = containerRef.value.querySelectorAll('.wait__orbit-wrapper');
  const text = containerRef.value.querySelector('.wait__text');
  const hint = containerRef.value.querySelector('.wait__hint');

  // Initial state for entrance
  if (orb) {
    (orb as HTMLElement).style.opacity = '0';
  }
  orbitWrappers.forEach(el => {
    (el as HTMLElement).style.opacity = '0';
    (el as HTMLElement).style.transform = 'scale(0.8)';
  });
  if (text) {
    (text as HTMLElement).style.opacity = '0';
  }
  if (hint) {
    (hint as HTMLElement).style.opacity = '0';
  }

  // Entrance animation (Anime.js)
  if (orb) {
    animate(orb, {
      opacity: [0, 1],
      scale: [0.5, 1],
      duration: 1000,
      ease: 'outElastic(1, .6)'
    });
  }

  if (orbitWrappers.length > 0) {
    animate(orbitWrappers, {
      opacity: [0, 1],
      scale: [0.8, 1],
      duration: 1200,
      delay: stagger(150, { start: 200 }),
      ease: 'outExpo'
    });
  }

  if (text) {
    animate(text, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: 900,
      delay: 650,
      ease: 'outCubic',
    });
  }

  if (hint) {
    animate(hint, {
      opacity: [0, 1],
      translateY: [4, 0],
      duration: 700,
      delay: 820,
      ease: 'outCubic',
    });
  }
});
</script>

<template>
  <div class="wait-container" ref="containerRef" role="status" aria-label="等待对局数据">
    <div class="wait__bg-mesh" aria-hidden="true"></div>

    <div class="wait__visual">
      <!-- Center Orb -->
      <div class="wait__orb">
        <div class="wait__orb-core"></div>
        <div class="wait__orb-pulse"></div>
      </div>

      <!-- Orbital Rings -->
      <div class="wait__orbits">
        <div
          v-for="(orbit, index) in orbits"
          :key="`orbit-${index}`"
          class="wait__orbit-wrapper"
        >
          <div
            class="wait__orbit"
            :style="{
              width: `${orbit.size}px`,
              height: `${orbit.size}px`,
              animationDuration: `${orbit.duration}s`,
              animationDirection: index % 2 === 0 ? 'normal' : 'reverse'
            }"
          >
            <div
              class="wait__orbit-dot"
              :style="{
                width: `${orbit.dotSize}px`,
                height: `${orbit.dotSize}px`
              }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <p class="wait__text">等待对局数据</p>
    <p
      v-if="showPlatformHint"
      class="wait__hint"
      role="note"
    >
      请重启完美对战平台
    </p>
  </div>
</template>

<style scoped>
.wait-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  flex: 1;
  overflow: hidden;
  background-color: transparent;
}

.wait__bg-mesh {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(at 20% 30%, color-mix(in srgb, var(--color-accent) 6%, transparent) 0px, transparent 50%),
    radial-gradient(at 80% 70%, color-mix(in srgb, var(--color-team-b) 5%, transparent) 0px, transparent 50%);
  pointer-events: none;
}

.wait__visual {
  position: relative;
  width: 240px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Center Orb */
.wait__orb {
  position: absolute;
  width: 24px;
  height: 24px;
  z-index: 10;
}

.wait__orb-core {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent), var(--color-team-b));
  box-shadow: 0 0 24px color-mix(in srgb, var(--color-accent) 50%, transparent);
  animation: orb-breathe 3s ease-in-out infinite alternate;
}

.wait__orb-pulse {
  position: absolute;
  inset: -16px;
  border-radius: 50%;
  border: 1px solid var(--color-accent);
  opacity: 0;
  animation: orb-ripple 2.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

/* Orbits */
.wait__orbits {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wait__orbit-wrapper {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform, opacity;
}

.wait__orbit {
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--color-accent) 15%, transparent);
  animation: orbit-spin linear infinite;
  position: relative;
}

.wait__orbit-dot {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent) 80%, transparent);
}

/* Text */
.wait__text {
  margin-top: 1.75rem;
  font-size: 0.9375rem;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: normal;
  color: color-mix(in srgb, var(--color-fg) 42%, var(--color-accent-muted));
  user-select: none;
  z-index: 10;
}

.wait__hint {
  margin-top: 0.625rem;
  max-width: 16rem;
  text-align: center;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.5;
  color: color-mix(in srgb, var(--color-fg-secondary) 88%, var(--color-team-b));
  user-select: none;
  z-index: 10;
}

/* Keyframes */
@keyframes orb-breathe {
  0% { transform: scale(0.85); opacity: 0.8; }
  100% { transform: scale(1.15); opacity: 1; }
}

@keyframes orb-ripple {
  0% { transform: scale(0.4); opacity: 0.8; border-width: 2px; }
  100% { transform: scale(2.2); opacity: 0; border-width: 0px; }
}

@keyframes orbit-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Reduced Motion Fallback */
@media (prefers-reduced-motion: reduce) {
  .wait__orb-core,
  .wait__orb-pulse,
  .wait__orbit {
    animation: none;
  }
}
</style>
