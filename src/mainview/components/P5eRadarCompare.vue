<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { animate } from 'animejs/animation';

export type P5eRadarAxisView = {
  label: string;
  primary: number;
  secondary?: number;
};

const props = defineProps<{
  axes: P5eRadarAxisView[];
  primaryColor: string;
  secondaryColor: string;
  size?: 'md' | 'lg';
}>();

const RADIUS = 36;
const CENTER = 50;

const svgClass = computed(() => (props.size === 'md' ? 'h-48 w-48' : 'h-56 w-56'));
const axisCount = computed(() => props.axes.length);

function generateRadarSvgPoints(values: number[], count: number, progress = 1): string {
  if (count < 1) return `${CENTER},${CENTER}`;
  return values
    .slice(0, count)
    .map((value, i) => {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
      const clamped = Math.min(Math.max(value, 0), 100);
      const r = (clamped / 100) * RADIUS * progress;
      return `${CENTER + r * Math.cos(angle)},${CENTER + r * Math.sin(angle)}`;
    })
    .join(' ');
}

function generateBgPoints(count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    return `${CENTER + RADIUS * Math.cos(angle)},${CENTER + RADIUS * Math.sin(angle)}`;
  }).join(' ');
}

function scaleRadarPoints(bgPoints: string, scale: number): string {
  return bgPoints
    .split(' ')
    .map((p) => {
      const [x, y] = p.split(',');
      return `${50 + (Number(x) - 50) * scale},${50 + (Number(y) - 50) * scale}`;
    })
    .join(' ');
}

const radarBgPoints = computed(() => generateBgPoints(axisCount.value));

const axisLines = computed(() =>
  Array.from({ length: axisCount.value }, (_, i) => {
    const angle = (Math.PI * 2 * i) / axisCount.value - Math.PI / 2;
    return { x2: CENTER + RADIUS * Math.cos(angle), y2: CENTER + RADIUS * Math.sin(angle) };
  }),
);

const labelPositions = computed(() =>
  Array.from({ length: axisCount.value }, (_, i) => {
    const angle = (Math.PI * 2 * i) / axisCount.value - Math.PI / 2;
    const labelR = RADIUS + 11;
    const x = CENTER + labelR * Math.cos(angle);
    const y = CENTER + labelR * Math.sin(angle);
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    if (x < CENTER - 4) anchor = 'end';
    else if (x > CENTER + 4) anchor = 'start';
    return { x, y, anchor };
  }),
);

const primaryPoints = ref(`${CENTER},${CENTER}`);
const secondaryPoints = ref(`${CENTER},${CENTER}`);

let radarAnimation: ReturnType<typeof animate> | null = null;

function applyRadarPoints(progress: number) {
  const count = axisCount.value;
  const primaryValues = props.axes.map((axis) => axis.primary);
  const secondaryValues = props.axes.map((axis) => axis.secondary ?? 0);
  primaryPoints.value = generateRadarSvgPoints(primaryValues, count, progress);
  secondaryPoints.value = props.axes.some((axis) => axis.secondary != null)
    ? generateRadarSvgPoints(secondaryValues, count, progress)
    : `${CENTER},${CENTER}`;
}

function runRadarAnimation() {
  radarAnimation?.pause();
  applyRadarPoints(0);

  const progress = { value: 0 };
  radarAnimation = animate(progress, {
    value: { from: 0, to: 1, duration: 750, ease: 'outExpo', delay: 120 },
    onUpdate: () => applyRadarPoints(progress.value),
  });
}

onMounted(() => {
  if (axisCount.value >= 3) runRadarAnimation();
});

watch(
  () => props.axes,
  () => {
    if (axisCount.value >= 3) runRadarAnimation();
  },
  { deep: true },
);

onUnmounted(() => {
  radarAnimation?.pause();
  radarAnimation = null;
});
</script>

<template>
  <div v-if="axes.length >= 3" class="radar-chart flex justify-center">
    <svg viewBox="0 0 100 100" class="overflow-visible" :class="svgClass" aria-hidden="true">
      <polygon :points="radarBgPoints" fill="#f8fafc" stroke="#e2e8f0" stroke-width="0.5" />
      <polygon
        v-for="scale in [0.75, 0.5, 0.25]"
        :key="scale"
        :points="scaleRadarPoints(radarBgPoints, scale)"
        fill="none"
        stroke="#e2e8f0"
        stroke-width="0.45"
      />
      <line
        v-for="(axis, i) in axisLines"
        :key="i"
        x1="50"
        y1="50"
        :x2="axis.x2"
        :y2="axis.y2"
        stroke="#e2e8f0"
        stroke-width="0.45"
      />

      <polygon
        v-if="axes.some((axis) => axis.secondary != null)"
        :points="secondaryPoints"
        :fill="secondaryColor"
        fill-opacity="0.08"
        :stroke="secondaryColor"
        stroke-width="0.7"
        stroke-opacity="0.35"
        stroke-linejoin="round"
      />

      <polygon
        :points="primaryPoints"
        :fill="primaryColor"
        fill-opacity="0.18"
        :stroke="primaryColor"
        stroke-width="0.85"
        stroke-opacity="0.9"
        stroke-linejoin="round"
      />

      <text
        v-for="(axis, i) in axes"
        :key="axis.label"
        :x="labelPositions[i].x"
        :y="labelPositions[i].y"
        font-size="4.8"
        :text-anchor="labelPositions[i].anchor"
        fill="#64748b"
        font-weight="600"
      >
        {{ axis.label }}
      </text>
    </svg>
  </div>
</template>
