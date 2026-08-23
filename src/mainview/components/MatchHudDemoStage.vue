<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { localize as l } from '../i18n';
import {
  AIR_WINDOW_MS_VALUE,
  ASSESSMENT_COLORS,
  ASSESSMENT_DIFF_SEQUENCE,
  DEMO_AIR_CYCLE_MS,
  DEMO_AIR_JUMPS,
  DEMO_AIR_SCORES,
  RECOIL_STROKE,
  SHOT_BAR_COLORS,
  SHOT_SPEED_SEQUENCE,
  average,
  createAssessmentSample,
  createRecoilPreviewPoints,
  createShotSample,
  pickRandomMapBackground,
  previewLoopProgress,
  scoreAirJump,
  type AssessmentSample,
  type ShotSample,
} from './matchHudIntroDemo';

const props = defineProps<{
  kind: 'counter' | 'recoil' | 'airSync';
  active: boolean;
}>();

const mapBackgroundUrl = ref(pickRandomMapBackground());
const sampleIndex = ref(18);
const assessmentRecords = ref<AssessmentSample[]>(
  Array.from({ length: 18 }, (_, index) =>
    createAssessmentSample(ASSESSMENT_DIFF_SEQUENCE[index], index)),
);
const shotRecords = ref<ShotSample[]>(
  Array.from({ length: 16 }, (_, index) =>
    createShotSample(SHOT_SPEED_SEQUENCE[index], index)),
);
const comboVisible = ref(false);
const comboRecord = ref<AssessmentSample | null>(null);
const elapsedMs = ref(0);

let sampleTimer: ReturnType<typeof window.setInterval> | null = null;
let comboTimer: ReturnType<typeof window.setTimeout> | null = null;

const initialAssessment = assessmentRecords.value;
const demoAverageTiming = Math.round(average(initialAssessment.map((record) => record.diffMs)));
const demoSuccessRate = Math.round(
  initialAssessment.filter((record) => Math.abs(record.diffMs) <= 36).length
    / initialAssessment.length * 100,
);
const demoTimingStdDev = Math.round(Math.sqrt(average(
  initialAssessment.map((record) => (record.diffMs - demoAverageTiming) ** 2),
)));
const initialShots = shotRecords.value;
const demoAverageError = average(initialShots.map((record) =>
  Math.min(1, Math.max(0, (record.speedRatio - 0.25) / 1.6))));
const demoStableRate = Math.round(
  initialShots.filter((record) => record.speedRatio <= 1).length / initialShots.length * 100,
);

const overlayDim = computed(() => (props.kind === 'counter' ? 'bg-black/24' : 'bg-black/48'));

const assessmentChart = computed(() => {
  const data = assessmentRecords.value.slice(-24);
  const width = 360;
  const height = 66;
  const padX = 2;
  const padTop = 2;
  const padBottom = 2;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const zeroY = padTop + innerH / 2;
  const dots = data.map((record, index) => {
    const x = padX + (data.length === 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
    const clamped = Math.max(-100, Math.min(100, record.diffMs));
    const y = zeroY - (clamped / 100) * (innerH / 2 - 4);
    return { x, y, color: record.color, isLatest: index === data.length - 1 };
  });
  const segments = dots.slice(1).map((dot, index) => {
    const prev = dots[index];
    return { d: `M${prev.x} ${prev.y} L${dot.x} ${dot.y}`, color: dot.color };
  });
  return { width, height, padX, zeroY, dots, segments };
});

const shotChart = computed(() => {
  const data = shotRecords.value.slice(-18);
  const count = 18;
  const width = 320;
  const height = 54;
  const padX = 10;
  const padY = 6;
  const innerW = width - padX * 2;
  const blockW = innerW / count;
  const blockH = height - padY * 2;
  const barBottom = padY + blockH;
  const items = data.map((record, index) => {
    const slot = count - data.length + index;
    const x = padX + slot * blockW;
    const greenH = record.greenRatio * blockH;
    const yellowH = record.yellowRatio * blockH;
    const redH = record.redRatio * blockH;
    return {
      x,
      w: blockW,
      thresholdY: barBottom - 0.5 * blockH,
      greenY: barBottom - greenH,
      greenH,
      yellowY: barBottom - greenH - yellowH,
      yellowH,
      redY: barBottom - greenH - yellowH - redH,
      redH,
      isTapFirst: record.isTapFirst,
      markerX: x + blockW / 2,
      markerY: barBottom + 1.6,
    };
  });
  return { width, height, items };
});

const DEMO_POINTS = createRecoilPreviewPoints(240, 1_520, 0.35);
const DEMO_AVERAGE = createRecoilPreviewPoints(180, 1_420, 0.1);
const recoilProgress = computed(() => previewLoopProgress(elapsedMs.value, 1_100, 420));
const recoilPointCount = computed(() => Math.max(2, Math.ceil(DEMO_POINTS.length * recoilProgress.value)));

function recoilPath(points: Array<{ x: number; y: number }>, width: number, height: number) {
  const originX = width / 2;
  const originY = height * 0.15;
  const scale = 10;
  return points.map((point, index) => {
    const x = originX + point.x / scale;
    const y = originY + point.y / scale;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

const recoilCurrentPath = computed(() =>
  recoilPath(DEMO_POINTS.slice(0, recoilPointCount.value), 360, 200),
);
const recoilAveragePath = computed(() =>
  recoilPath(DEMO_AVERAGE.slice(0, recoilPointCount.value), 360, 200),
);

const airLive = computed(() => {
  const cycleIndex = Math.floor(elapsedMs.value / DEMO_AIR_CYCLE_MS);
  const jumpIndex = cycleIndex % DEMO_AIR_JUMPS.length;
  const segments = DEMO_AIR_JUMPS[jumpIndex];
  const jumpElapsed = elapsedMs.value % DEMO_AIR_CYCLE_MS;
  const active = jumpElapsed < AIR_WINDOW_MS_VALUE;
  const live = scoreAirJump(segments, jumpElapsed);
  const finished = DEMO_AIR_SCORES[jumpIndex];
  const previous = DEMO_AIR_SCORES[(jumpIndex + DEMO_AIR_JUMPS.length - 1) % DEMO_AIR_JUMPS.length];
  const syncRate = active ? live.syncRate : finished.syncRate;
  const sessionSync = DEMO_AIR_SCORES.reduce((sum, jump) => sum + jump.syncRate, 0)
    / DEMO_AIR_SCORES.length;
  const switchMs = active ? null : finished.switchErrorMs;
  const state = active ? live.state : 'idle';
  const aTone = state === 'leftMatched' || state === 'bothKeys'
    ? (state === 'bothKeys' ? 'conflict' : 'matched')
    : state === 'rightOpposed' ? 'opposed' : 'idle';
  const dTone = state === 'rightMatched' || state === 'bothKeys'
    ? (state === 'bothKeys' ? 'conflict' : 'matched')
    : state === 'leftOpposed' ? 'opposed' : 'idle';
  const mouse = state === 'leftMatched' || state === 'leftOpposed'
    ? 'left'
    : state === 'rightMatched' || state === 'rightOpposed' ? 'right' : 'none';
  const pct = Math.round(syncRate * 100);
  const quality = pct >= 90 ? 'perfect' : pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'poor';
  const fillTone = !active
    ? (quality === 'poor' ? 'desync' : 'matched')
    : (state === 'leftMatched' || state === 'rightMatched'
      ? 'matched'
      : state === 'leftOpposed' || state === 'rightOpposed' || state === 'bothKeys'
        ? 'desync'
        : 'neutral');
  return {
    active,
    syncPct: pct,
    quality,
    aTone,
    dTone,
    mouse,
    accelCount: active ? live.accelCount : finished.accelCount,
    progress: active
      ? Math.min(1, jumpElapsed / AIR_WINDOW_MS_VALUE)
      : 1,
    fillTone,
    switchMs: switchMs == null ? '—' : `${Math.round(switchMs)}`,
    sessionPct: Math.round(sessionSync * 100),
    lastRated: cycleIndex > 0 || !active,
    previousSync: previous.syncRate,
  };
});

function flashCombo(record: AssessmentSample) {
  comboRecord.value = record;
  comboVisible.value = true;
  if (comboTimer != null) window.clearTimeout(comboTimer);
  comboTimer = window.setTimeout(() => {
    comboVisible.value = false;
  }, 360);
}

function appendCounterSample() {
  const index = sampleIndex.value;
  const assessment = createAssessmentSample(
    ASSESSMENT_DIFF_SEQUENCE[index % ASSESSMENT_DIFF_SEQUENCE.length],
    index,
  );
  assessmentRecords.value = [...assessmentRecords.value.slice(-23), assessment];
  shotRecords.value = [
    ...shotRecords.value.slice(-17),
    createShotSample(SHOT_SPEED_SEQUENCE[index % SHOT_SPEED_SEQUENCE.length], index),
  ];
  sampleIndex.value += 1;
  flashCombo(assessment);
}

function stopAll() {
  if (sampleTimer != null) {
    window.clearInterval(sampleTimer);
    sampleTimer = null;
  }
}

function startCounterLoop() {
  stopAll();
  sampleTimer = window.setInterval(appendCounterSample, 1_400);
}

function startFrameLoop() {
  stopAll();
  sampleTimer = window.setInterval(() => {
    elapsedMs.value += 32;
  }, 32);
}

watch(
  () => [props.active, props.kind] as const,
  ([active, kind]) => {
    if (!active) {
      stopAll();
      return;
    }
    mapBackgroundUrl.value = pickRandomMapBackground();
    if (kind === 'counter') {
      startCounterLoop();
      return;
    }
    elapsedMs.value = 0;
    startFrameLoop();
  },
  { immediate: true },
);

onUnmounted(() => {
  stopAll();
  if (comboTimer != null) window.clearTimeout(comboTimer);
});
</script>

<template>
  <div class="relative h-full w-full min-h-0 overflow-hidden bg-[#cbd0d5] text-white">
    <img
      :src="mapBackgroundUrl"
      alt=""
      class="pointer-events-none absolute inset-0 h-full w-full scale-[1.06] object-cover blur-[3px] outline-1 -outline-offset-1 outline-black/10"
      draggable="false"
      decoding="async"
    />
    <div class="pointer-events-none absolute inset-0" :class="overlayDim" aria-hidden="true" />
    <span
      class="pointer-events-none absolute right-2 top-2 z-20 whitespace-nowrap rounded bg-black/45 px-1.5 py-1 text-[9px] font-semibold leading-none text-white/78 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] backdrop-blur-sm"
    >
      {{ l('效果示例', 'Demo') }}
    </span>

    <div v-if="kind === 'counter'" class="relative z-1 flex h-full min-h-0 flex-col gap-1.5 overflow-hidden p-2.5">
      <section class="hud-preview-window min-h-0 flex-1">
        <div class="hud-preview-stats flex h-5 shrink-0 items-baseline gap-4 overflow-hidden px-2 pt-1">
          <div class="hud-preview-stat">
            <span class="hud-preview-label">{{ l('平均', 'Avg') }}</span>
            <span class="hud-preview-value tabular-nums" :style="{ color: demoAverageTiming < -5 ? ASSESSMENT_COLORS.early : demoAverageTiming > 5 ? ASSESSMENT_COLORS.late : ASSESSMENT_COLORS.success }">
              {{ demoAverageTiming > 0 ? '+' : '' }}{{ demoAverageTiming }}ms
            </span>
          </div>
          <div class="hud-preview-stat">
            <span class="hud-preview-label">{{ l('表现不错', 'Good rate') }}</span>
            <span class="hud-preview-value tabular-nums" :style="{ color: demoSuccessRate >= 70 ? ASSESSMENT_COLORS.success : demoSuccessRate >= 40 ? ASSESSMENT_COLORS.early : ASSESSMENT_COLORS.late }">
              {{ demoSuccessRate }}%
            </span>
          </div>
          <div class="hud-preview-stat">
            <span class="hud-preview-label">{{ l('标准差', 'Std Dev') }}</span>
            <span class="hud-preview-value tabular-nums" :style="{ color: demoTimingStdDev <= 3 ? ASSESSMENT_COLORS.success : demoTimingStdDev <= 8 ? ASSESSMENT_COLORS.early : ASSESSMENT_COLORS.late }">
              {{ demoTimingStdDev }}ms
            </span>
          </div>
        </div>
        <div class="relative min-h-0 flex-1 px-1.5 pb-1">
          <svg
            :viewBox="`0 0 ${assessmentChart.width} ${assessmentChart.height}`"
            class="h-full w-full"
            preserveAspectRatio="none"
          >
            <line
              :x1="assessmentChart.padX"
              :y1="assessmentChart.zeroY"
              :x2="assessmentChart.width - assessmentChart.padX"
              :y2="assessmentChart.zeroY"
              stroke="rgba(255,255,255,0.18)"
              stroke-width="1"
              stroke-dasharray="3 4"
              vector-effect="non-scaling-stroke"
            />
            <path
              v-for="(segment, index) in assessmentChart.segments"
              :key="index"
              :d="segment.d"
              fill="none"
              :stroke="segment.color"
              stroke-width="1.25"
              stroke-opacity="0.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
            <circle
              v-for="(dot, index) in assessmentChart.dots"
              :key="index"
              :cx="dot.x"
              :cy="dot.y"
              :r="dot.isLatest ? 2 : 1.25"
              :fill="dot.color"
            />
          </svg>
          <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Transition name="combo-pop">
              <div
                v-if="comboVisible && comboRecord"
                class="flex flex-col items-center"
                :style="{ color: comboRecord.color }"
              >
                <p class="text-[17px] font-bold leading-none" style="text-shadow: 0 1px 5px rgb(0 0 0 / 0.9)">
                  {{ l(comboRecord.labelZh, comboRecord.labelEn) }}
                </p>
                <p class="mt-0 text-[9px] font-semibold leading-[1.1] tabular-nums">
                  {{ comboRecord.fromKey }} → {{ comboRecord.toKey }}
                  <span class="mx-1 text-white/45">·</span>
                  {{ comboRecord.diffMs > 0 ? '+' : '' }}{{ comboRecord.diffMs.toFixed(1) }}ms
                </p>
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <section class="hud-preview-window min-h-0 flex-1">
        <div class="hud-preview-stats flex h-5 shrink-0 items-baseline gap-4 overflow-hidden px-2 pt-1">
          <div class="hud-preview-stat">
            <span class="hud-preview-label">{{ l('误差', 'Error') }}</span>
            <span
              class="hud-preview-value tabular-nums"
              :class="demoAverageError <= 0.15 ? 'text-emerald-400' : demoAverageError <= 0.35 ? 'text-amber-300' : 'text-rose-400'"
            >
              {{ demoAverageError.toFixed(2) }}
            </span>
          </div>
          <div class="hud-preview-stat">
            <span class="hud-preview-label">{{ l('稳定', 'Stable') }}</span>
            <span
              class="hud-preview-value tabular-nums"
              :class="demoStableRate >= 70 ? 'text-emerald-400' : demoStableRate >= 40 ? 'text-amber-300' : 'text-rose-400'"
            >
              {{ demoStableRate }}%
            </span>
          </div>
        </div>
        <div class="min-h-0 flex-1 px-1 pb-1">
          <svg :viewBox="`0 0 ${shotChart.width} ${shotChart.height}`" class="h-full w-full" preserveAspectRatio="none">
            <g v-for="(block, index) in shotChart.items" :key="index">
              <line
                :x1="block.x"
                :y1="block.thresholdY"
                :x2="block.x + block.w"
                :y2="block.thresholdY"
                :stroke="SHOT_BAR_COLORS.threshold"
                stroke-width="1"
                stroke-dasharray="2 2"
                vector-effect="non-scaling-stroke"
              />
              <rect
                v-if="block.greenH > 0"
                :x="block.x"
                :y="block.greenY"
                :width="block.w"
                :height="block.greenH"
                :fill="SHOT_BAR_COLORS.stable"
              />
              <rect
                v-if="block.yellowH > 0"
                :x="block.x"
                :y="block.yellowY"
                :width="block.w"
                :height="block.yellowH"
                :fill="SHOT_BAR_COLORS.micro"
              />
              <rect
                v-if="block.redH > 0"
                :x="block.x"
                :y="block.redY"
                :width="block.w"
                :height="block.redH"
                :fill="SHOT_BAR_COLORS.run"
              />
              <circle
                v-if="block.isTapFirst"
                :cx="block.markerX"
                :cy="block.markerY"
                r="1.1"
                fill="white"
                opacity="0.92"
              />
            </g>
          </svg>
        </div>
      </section>
    </div>

    <div v-else-if="kind === 'recoil'" class="relative z-1 h-full min-h-0 w-full px-2 py-1.5">
      <svg class="block h-full w-full" viewBox="0 0 360 200" preserveAspectRatio="none">
        <line x1="180" y1="8" x2="180" y2="192" stroke="rgba(255,255,255,0.11)" stroke-width="1" vector-effect="non-scaling-stroke" />
        <line x1="8" y1="30" x2="352" y2="30" stroke="rgba(255,255,255,0.11)" stroke-width="1" vector-effect="non-scaling-stroke" />
        <path
          :d="recoilAveragePath"
          fill="none"
          :stroke="`${RECOIL_STROKE}73`"
          stroke-width="2.6"
          stroke-dasharray="5 4"
          vector-effect="non-scaling-stroke"
        />
        <path
          :d="recoilCurrentPath"
          fill="none"
          :stroke="RECOIL_STROKE"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
        <circle cx="180" cy="30" r="2.5" :fill="RECOIL_STROKE" />
      </svg>
    </div>

    <div v-else class="kz-hud relative z-1 h-full">
      <div class="kz-strafe">
        <div class="kz-key" :class="`kz-key--${airLive.aTone}`">
          <span class="kz-chevron kz-chevron--left" :class="{ 'kz-chevron--on': airLive.mouse === 'left' }" />
          <span class="kz-cap">A</span>
        </div>
        <div class="kz-sync" :class="`kz-sync--${airLive.quality}`">
          <span class="kz-sync-value">{{ airLive.lastRated || airLive.active ? airLive.syncPct : '—' }}</span>
          <span class="kz-sync-unit">%</span>
        </div>
        <div class="kz-key kz-key--right" :class="`kz-key--${airLive.dTone}`">
          <span class="kz-cap">D</span>
          <span class="kz-chevron kz-chevron--right" :class="{ 'kz-chevron--on': airLive.mouse === 'right' }" />
        </div>
      </div>
      <p v-if="airLive.accelCount > 0" :key="airLive.accelCount" class="kz-combo kz-combo--pop">
        <span class="kz-combo-count">×{{ airLive.accelCount }}</span>
        <span class="kz-combo-unit">{{ l('加速', 'accels') }}</span>
      </p>
      <p v-else class="kz-combo kz-combo--placeholder" />
      <div class="kz-air">
        <div class="kz-air-fill" />
      </div>
      <div class="kz-meta">
        <span>{{ l('切键延迟', 'Switch delay') }} {{ airLive.switchMs }}<span v-if="airLive.switchMs !== '—'">ms</span></span>
        <span>{{ l('平均', 'avg') }} {{ airLive.sessionPct }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud-preview-window {
  display: flex;
  min-width: 0;
  width: calc(100% - 20px);
  margin-left: 10px;
  flex-direction: column;
  overflow: visible;
  background: transparent;
  font-family: 'Bahnschrift', 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
}

.hud-preview-stat {
  display: flex;
  flex-shrink: 0;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
}

.hud-preview-label {
  color: rgb(255 255 255 / 0.72);
  font-size: 8px;
  font-weight: 500;
  line-height: 1;
  text-shadow: 0 1px 4px rgb(0 0 0 / 0.85);
}

.hud-preview-value {
  display: inline-block;
  min-width: 34px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 4px rgb(0 0 0 / 0.9);
}

.combo-pop-enter-active {
  transition:
    opacity 70ms ease-out,
    transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.combo-pop-leave-active {
  transition:
    opacity 100ms ease-in,
    transform 100ms ease-in;
}

.combo-pop-enter-from {
  opacity: 0;
  transform: scale(1.35) translateY(4px);
}

.combo-pop-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-8px);
}

.kz-hud {
  display: flex;
  height: 100%;
  min-height: 4.5rem;
  flex-direction: column;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.55rem 0.75rem;
  color: #f8fafc;
}

.kz-strafe {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.5rem;
}

.kz-key {
  display: flex;
  min-width: 2.75rem;
  height: 1.85rem;
  align-items: center;
  justify-content: center;
  justify-self: start;
  gap: 0.28rem;
  padding: 0 0.5rem;
  border-radius: 6px;
  background: rgb(0 0 0 / 0.38);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
  color: rgb(248 250 252 / 0.42);
  transition: color 180ms cubic-bezier(0.2, 0, 0, 1), background-color 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms cubic-bezier(0.2, 0, 0, 1);
}

.kz-key--right {
  justify-self: end;
}

.kz-cap {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.85);
}

.kz-chevron {
  width: 0;
  height: 0;
  opacity: 0.28;
}

.kz-chevron--left {
  border-style: solid;
  border-width: 4px 6px 4px 0;
  border-color: transparent currentColor transparent transparent;
}

.kz-chevron--right {
  border-style: solid;
  border-width: 4px 0 4px 6px;
  border-color: transparent transparent transparent currentColor;
}

.kz-chevron--on {
  opacity: 1;
}

.kz-key--matched {
  background: rgb(16 185 129 / 0.28);
  box-shadow:
    inset 0 0 0 1px rgb(52 211 153 / 0.7),
    0 0 12px rgb(16 185 129 / 0.28);
  color: #6ee7b7;
}

.kz-key--opposed,
.kz-key--conflict {
  background: rgb(244 63 94 / 0.28);
  box-shadow:
    inset 0 0 0 1px rgb(251 113 133 / 0.7),
    0 0 12px rgb(244 63 94 / 0.22);
  color: #fda4af;
}

.kz-sync {
  display: flex;
  min-width: 4.5rem;
  align-items: baseline;
  justify-content: center;
  color: #5eead4;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.9);
}

.kz-sync-value {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.kz-sync-unit {
  margin-left: 0.12rem;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.7;
}

.kz-sync--good { color: #4ade80; }
.kz-sync--ok { color: #fbbf24; }
.kz-sync--poor { color: #fb7185; }
.kz-sync--idle { color: rgb(248 250 252 / 0.55); }

.kz-combo {
  display: flex;
  min-height: 1.05rem;
  margin: 0;
  align-items: baseline;
  justify-content: center;
  gap: 0.22rem;
  color: #fde68a;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.9);
}

.kz-combo--placeholder {
  visibility: hidden;
}

.kz-combo-count {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.kz-combo-unit {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.78;
}

.kz-combo--pop {
  animation: kz-combo-pop 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes kz-combo-pop {
  0% {
    opacity: 0.35;
    transform: scale(1.55) translateY(3px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.kz-air {
  flex-shrink: 0;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.12);
}

.kz-air-fill {
  height: 100%;
  width: 0%;
  border-radius: inherit;
  animation: kz-air-progress 1435ms linear infinite;
}

@keyframes kz-air-progress {
  0% { width: 0%; background: #fbbf24; }
  2% { width: 3%; background: #fbbf24; }
  3% { width: 5%; background: #34d399; }
  17% { width: 32%; background: #34d399; }
  18% { width: 34%; background: #fb7185; }
  20% { width: 38%; background: #fb7185; }
  21% { width: 40%; background: #34d399; }
  35% { width: 66%; background: #34d399; }
  36% { width: 68%; background: #fb7185; }
  38% { width: 72%; background: #fb7185; }
  39% { width: 74%; background: #34d399; }
  53% { width: 100%; background: #34d399; }
  100% { width: 100%; background: #34d399; }
}

.kz-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
  line-height: 1;
  color: rgb(248 250 252 / 0.48);
  font-variant-numeric: tabular-nums;
}
</style>
