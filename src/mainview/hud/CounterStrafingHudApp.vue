<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { MoveDiagonal2 } from 'lucide-vue-next';
import ShootingErrorBars from '../components/counter-strafing/ShootingErrorBars.vue';
import {
  getCounterStrafingSnapshot,
  onCounterStrafingShot,
  onCounterStrafingSnapshot,
} from '@core/counter-strafing/native';
import type { CounterStrafingSnapshot, ShootingErrorRecord } from '@core/counter-strafing/types';
import {
  formatSampleKind,
  formatSpeedRatio,
  formatStopTiming,
  sampleStateColor,
} from '@core/counter-strafing/types';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useHudWindow } from './useHudWindow';

const DEFAULT_CHART_HEIGHT = 80;

const snapshot = ref<CounterStrafingSnapshot>({
  active: false,
  listening: false,
  hudVisible: true,
  cs2Foreground: false,
  shotRecords: [],
  avgError: 0,
  stableRate: 0,
  lastShot: null,
  fireActive: false,
});
const liveSample = ref<ShootingErrorRecord | null>(null);
const initError = ref<string | null>(null);
const chartHeight = ref(DEFAULT_CHART_HEIGHT);
let unlisteners: UnlistenFn[] = [];

const { startResize } = useHudWindow();

const displaySample = computed(() => liveSample.value ?? snapshot.value.lastShot);
const showLive = computed(() => snapshot.value.fireActive && liveSample.value);
const hasRecords = computed(() => snapshot.value.shotRecords.length > 0);

const reasonText = computed(() => {
  const s = displaySample.value;
  if (!s) return snapshot.value.listening ? '监听中' : '等待开火';
  if (s.crouchGraceActive || s.reason === 'crouchGrace') return '蹲起窗口';
  if (s.axisConflict) return '方向冲突';
  if (s.crouching) return '蹲射稳定';
  if (s.counterStrafeActive && s.speedRatio > 1) return '反向急停';
  if (s.reason === 'naturalDeceleration' && s.speedRatio > 1) return '自然减速';
  if (s.speedRatio <= 1) return '已停稳';
  return '移动中';
});

onMounted(async () => {
  try {
    snapshot.value = await getCounterStrafingSnapshot();
    if (snapshot.value.lastShot) {
      liveSample.value = snapshot.value.lastShot;
    }
    unlisteners = await Promise.all([
      onCounterStrafingShot((record) => {
        liveSample.value = record;
      }),
      onCounterStrafingSnapshot((next) => {
        snapshot.value = next;
      }),
    ]);
  } catch (e) {
    initError.value = e instanceof Error ? e.message : 'HUD 初始化失败';
  }
});

onUnmounted(() => {
  void Promise.all(unlisteners.map((fn) => fn()));
});
</script>

<template>
  <div class="hud-root group/hud relative h-full min-h-[120px] min-w-[280px] w-full select-none" :class="snapshot.hudLocked ? 'pointer-events-none' : ''">
    <div
      v-if="!snapshot.hudLocked"
      class="hud-drag-surface absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
      data-tauri-drag-region
      aria-hidden="true"
    />

    <div class="hud-frame pointer-events-none absolute inset-0 z-10" aria-hidden="true" />

    <button
      v-if="!snapshot.hudLocked"
      type="button"
      class="hud-resize-handle absolute right-0 bottom-0 z-20 flex h-6 w-6 cursor-nwse-resize items-center justify-center"
      aria-label="调整 HUD 大小"
      title="调整大小"
      @mousedown.stop="startResize"
    >
      <MoveDiagonal2 class="h-3.5 w-3.5 text-white/35 opacity-0 transition-opacity group-hover/hud:opacity-100" aria-hidden="true" />
    </button>

    <div
      v-if="initError"
      class="hud-error pointer-events-none relative z-1 flex h-full min-h-[120px] items-center justify-center px-4 text-center"
    >
      <p class="hud-stat text-[11px] leading-relaxed text-rose-200/90">{{ initError }}</p>
    </div>

    <div
      v-else
      class="hud-layout pointer-events-none relative z-1 flex h-full min-h-[120px] flex-col justify-center px-4 py-3"
    >
      <!-- Bottom Row: Chart Only -->
      <div class="hud-chart-wrap flex-1 min-h-[60px] w-full items-center">
        <ShootingErrorBars
          :records="snapshot.shotRecords"
          :max-points="16"
          :height="chartHeight"
          ghost
          compact
          class="h-full w-full"
        />
      </div>
    </div>
  </div>
</template>
