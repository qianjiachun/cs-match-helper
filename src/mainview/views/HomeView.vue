<script setup lang="ts">
import { ArrowRight, Gauge, Swords } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { APP_MODULES, type AppModuleId } from '../modules/appModules';

defineProps<{
  version?: string;
}>();

const emit = defineEmits<{
  openModule: [id: AppModuleId];
}>();

const rootRef = ref<HTMLElement | null>(null);
const previewStageRef = ref<HTMLElement | null>(null);
const activeModuleId = ref<AppModuleId>(APP_MODULES[0].id);
let tiltFrame = 0;

const activeModule = computed(
  () => APP_MODULES.find((module) => module.id === activeModuleId.value) ?? APP_MODULES[0],
);
const activeModuleIndex = computed(() => APP_MODULES.findIndex((module) => module.id === activeModuleId.value));

function moduleNumber(index: number) {
  return String(index + 1).padStart(2, '0');
}

function selectModule(id: AppModuleId) {
  activeModuleId.value = id;
}

function openModule(id: AppModuleId) {
  emit('openModule', id);
}

function updatePreviewTilt(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  const stage = previewStageRef.value;
  if (!stage) return;

  const rect = stage.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;

  cancelAnimationFrame(tiltFrame);
  tiltFrame = requestAnimationFrame(() => {
    stage.style.setProperty('--home-tilt-x', `${(-y * 1.2).toFixed(2)}deg`);
    stage.style.setProperty('--home-tilt-y', `${(x * 1.2).toFixed(2)}deg`);
    stage.style.setProperty('--home-preview-lift', '3px');
  });
}

function resetPreviewTilt() {
  const stage = previewStageRef.value;
  if (!stage) return;
  cancelAnimationFrame(tiltFrame);
  stage.style.setProperty('--home-tilt-x', '0deg');
  stage.style.setProperty('--home-tilt-y', '0deg');
  stage.style.setProperty('--home-preview-lift', '0px');
}

onMounted(() => {
  const root = rootRef.value;
  if (!root) return;
  root.querySelectorAll('[data-home-enter]').forEach((el, index) => {
    (el as HTMLElement).style.animationDelay = `${40 + index * 90}ms`;
    el.classList.add('home-enter--active');
  });
});

onBeforeUnmount(() => cancelAnimationFrame(tiltFrame));
</script>

<template>
  <div ref="rootRef" class="home-view h-full min-h-0 overflow-hidden bg-base">
    <div class="home-layout mx-auto flex h-full w-full max-w-280 flex-col px-7 py-7 lg:px-9 lg:py-8">
      <header class="home-enter flex shrink-0" data-home-enter>
        <div class="min-w-0">
          <p class="home-kicker mb-2 text-[11px] font-semibold">CS MATCH HELPER</p>
          <h1 class="home-product-title home-display text-fg">
            <span class="home-title-accent">CS</span>
            <span class="home-title-name">对局助手</span>
          </h1>
        </div>
      </header>

      <section class="home-enter home-launcher mt-7 min-h-0 flex-1 overflow-hidden" data-home-enter>
        <nav class="home-module-nav" aria-label="工具导航">
          <ol class="home-module-list">
            <li v-for="mod in APP_MODULES" :key="mod.id" class="home-module-item">
              <button
                type="button"
                class="home-module-button group"
                :class="activeModuleId === mod.id ? 'home-module-button--active' : ''"
                :aria-label="`打开${mod.title}`"
                @pointerenter="selectModule(mod.id)"
                @focus="selectModule(mod.id)"
                @click="openModule(mod.id)"
              >
                <span class="home-module-indicator" aria-hidden="true" />
                <span class="home-module-icon" aria-hidden="true">
                  <Swords v-if="mod.id === 'match'" class="h-4.75 w-4.75" :stroke-width="1.8" />
                  <Gauge v-else class="h-4.75 w-4.75" :stroke-width="1.8" />
                </span>

                <span class="min-w-0 flex-1">
                  <span class="home-module-category block text-[10px] font-semibold">{{ mod.category }}</span>
                  <span class="home-module-title home-display mt-1 block text-[15px] font-semibold leading-tight">
                    {{ mod.title }}
                  </span>
                </span>

                <span class="home-module-arrow" aria-hidden="true">
                  <ArrowRight class="h-4 w-4" :stroke-width="1.8" />
                </span>
              </button>
            </li>
          </ol>
        </nav>

        <div class="home-preview-panel min-w-0">
          <div class="home-preview-content">
            <div class="flex shrink-0 items-start justify-between gap-6">
              <div class="min-w-0">
                <p class="home-preview-category text-[11px] font-semibold">
                  {{ activeModule.category }}
                </p>
                <p class="home-display mt-1.5 text-[21px] font-semibold text-fg">{{ activeModule.title }}</p>
                <p class="mt-2 max-w-[46ch] text-pretty text-[12px] leading-5 text-[#5f6068]">
                  {{ activeModule.description }}
                </p>
              </div>
              <span class="home-preview-sequence" aria-hidden="true">
                {{ moduleNumber(activeModuleIndex) }} / {{ moduleNumber(APP_MODULES.length - 1) }}
              </span>
            </div>

            <div
              ref="previewStageRef"
              class="home-preview-stage mt-5 min-h-0 flex-1"
              @pointermove="updatePreviewTilt"
              @pointerleave="resetPreviewTilt"
            >
              <div class="home-preview-media">
                <component
                  v-for="mod in APP_MODULES"
                  :key="mod.id"
                  :is="mod.Preview"
                  class="home-preview-visual h-full w-full"
                  :class="activeModuleId === mod.id ? 'home-preview-visual--active' : ''"
                />
              </div>
            </div>

            <div class="home-preview-footer mt-4 flex shrink-0 justify-end">
              <button
                type="button"
                class="home-open-button no-drag"
                :aria-label="`打开${activeModule.title}`"
                @click="openModule(activeModule.id)"
              >
                <span>{{ activeModule.actionLabel }}</span>
                <ArrowRight class="h-4 w-4" :stroke-width="1.8" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<style scoped>
.home-view {
  --home-ink: #17191c;
  --home-canvas: #f3f4f6;
  --home-workspace: #eef0f3;
  --home-blue: #3b7dd8;
  --home-blue-strong: #316fbe;
  font-family: "Segoe UI Variable Text", "Microsoft YaHei UI", "Segoe UI", sans-serif;
  letter-spacing: 0;
  font-synthesis: none;
  background: var(--home-canvas);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.home-display {
  font-family: "Segoe UI Variable Display", "Microsoft YaHei UI", "Segoe UI", sans-serif;
  letter-spacing: 0;
}

.home-product-title {
  display: flex;
  align-items: baseline;
  gap: 11px;
  line-height: 1;
}

.home-title-accent {
  display: inline-block;
  color: #d39a26;
  font-family: "Arial Black", "Segoe UI Variable Display", "Segoe UI", sans-serif;
  font-size: 36px;
  font-weight: 900;
  font-style: italic;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
  transform: translateY(1px) skewX(-9deg) scaleX(1.06);
  transform-origin: left bottom;
}

.home-title-name {
  color: #1c1f23;
  font-size: 33px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
  transform: skewX(-6deg);
  transform-origin: left bottom;
}

.home-layout {
  min-height: 560px;
}

.home-enter {
  opacity: 0;
  transform: translateY(12px);
  filter: blur(4px);
}

.home-enter--active {
  animation: homeEnter 460ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.home-kicker {
  letter-spacing: 0;
  color: #767c84;
}

.home-launcher {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  border-radius: 8px;
  background: var(--home-workspace);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.07),
    0 2px 5px rgba(20, 24, 28, 0.04),
    0 20px 45px rgba(20, 24, 28, 0.08);
}

.home-module-nav {
  min-width: 0;
  padding: 12px 8px 12px 12px;
  background: transparent;
}

.home-module-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home-module-item {
  height: 76px;
  flex: 0 0 auto;
}

.home-module-button {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 76px;
  align-items: center;
  gap: 10px;
  border-radius: 8px;
  padding: 10px 8px 10px 12px;
  overflow: hidden;
  text-align: left;
  outline: none;
  background: transparent;
  transition-property: background-color, box-shadow;
  transition-duration: 180ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.home-module-button:hover {
  background: rgba(255, 255, 255, 0.72);
}

.home-module-button:focus-visible {
  z-index: 2;
  box-shadow: inset 0 0 0 2px rgba(74, 144, 226, 0.42);
}

.home-module-button--active,
.home-module-button--active:hover {
  background: #fff;
  box-shadow:
    0 0 0 1px rgba(74, 144, 226, 0.14),
    0 2px 4px rgba(20, 24, 28, 0.05),
    0 10px 22px rgba(20, 24, 28, 0.08);
}

.home-module-indicator {
  position: absolute;
  top: 14px;
  bottom: 14px;
  left: -1px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  opacity: 0;
  transform: scaleY(0.35);
  transition-property: transform, opacity;
  transition-duration: 220ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.home-module-button--active .home-module-indicator {
  opacity: 1;
  transform: scaleY(1);
}

.home-module-indicator {
  background: var(--home-blue);
}

.home-module-icon {
  display: flex;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition-property: color, background-color, box-shadow;
  transition-duration: 180ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.home-module-icon {
  color: #6d747e;
  background: #e2e5e9;
  box-shadow: 0 0 0 1px rgba(20, 24, 28, 0.05);
}

.home-module-button--active .home-module-icon {
  color: var(--home-blue);
  background: #e9f2fc;
  box-shadow:
    0 0 0 1px rgba(74, 144, 226, 0.12),
    0 5px 14px rgba(20, 24, 28, 0.08);
}

.home-module-category {
  color: #81858d;
}

.home-module-title {
  color: var(--home-ink);
}

.home-module-button--active .home-module-category {
  color: #6f7782;
}

.home-module-button--active .home-module-title {
  color: var(--home-ink);
}

.home-module-arrow {
  display: flex;
  width: 32px;
  height: 40px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  align-self: center;
  color: var(--color-fg-muted);
  opacity: 0;
  transform: translateX(-4px);
  transition-property: transform, color, opacity;
  transition-duration: 200ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.home-module-button:hover .home-module-arrow,
.home-module-button--active .home-module-arrow {
  opacity: 0.8;
  transform: translateX(0);
}

.home-module-button--active .home-module-arrow {
  color: var(--home-blue);
}

.home-preview-panel {
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

.home-preview-content {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  padding: 24px 26px 22px;
}

.home-preview-category {
  color: var(--home-blue);
}

.home-preview-sequence {
  min-width: 56px;
  min-height: 40px;
  padding-top: 4px;
  text-align: right;
  font-size: 10px;
  font-weight: 600;
  color: #9a9fa7;
  font-variant-numeric: tabular-nums;
}

.home-preview-stage {
  --home-tilt-x: 0deg;
  --home-tilt-y: 0deg;
  --home-preview-lift: 0px;
  display: flex;
  perspective: 1200px;
}

.home-preview-media {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
  background: #fff;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.05),
    0 14px 30px rgba(20, 24, 28, 0.1);
  transform: rotateX(var(--home-tilt-x)) rotateY(var(--home-tilt-y)) translateZ(var(--home-preview-lift));
  transform-style: preserve-3d;
  transition-property: transform, box-shadow;
  transition-duration: 180ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.home-preview-stage:hover .home-preview-media {
  box-shadow:
    0 3px 8px rgba(0, 0, 0, 0.06),
    0 20px 40px rgba(20, 24, 28, 0.12);
}

.home-open-button {
  display: flex;
  min-width: 132px;
  min-height: 40px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  padding: 0 14px 0 16px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 5px 12px rgba(24, 24, 27, 0.12);
  transition-property: scale, background-color, box-shadow;
  transition-duration: 160ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.home-open-button {
  background: var(--home-blue);
}

.home-preview-visual {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0;
  transform: scale(0.995);
  pointer-events: none;
  transition-property: opacity, transform;
  transition-duration: 180ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.home-preview-visual--active {
  z-index: 1;
  opacity: 1;
  transform: scale(1);
}

.home-open-button:hover {
  background: var(--home-blue-strong);
}

.home-open-button:focus-visible {
  outline: 2px solid rgba(74, 144, 226, 0.55);
  outline-offset: 2px;
}

.home-open-button:active {
  scale: 0.96;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.08);
}

@keyframes homeEnter {
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

@media (max-width: 1080px) {
  .home-launcher {
    grid-template-columns: 200px minmax(0, 1fr);
  }

  .home-module-button {
    padding-right: 8px;
  }

  .home-module-arrow {
    display: none;
  }

  .home-preview-content {
    padding-right: 22px;
    padding-left: 22px;
  }
}

@media (max-height: 720px) {
  .home-preview-content {
    padding-top: 20px;
    padding-bottom: 18px;
  }

  .home-preview-media {
    transform: none;
  }
}

</style>
