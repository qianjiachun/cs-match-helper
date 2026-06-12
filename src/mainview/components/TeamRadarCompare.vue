<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { animate } from 'animejs/animation';

export type RadarData = {
  firepower: number;
  entry: number;
  defense: number;
  clutch: number;
  utility: number;
};

const props = defineProps<{
  primary: RadarData;
  secondary?: RadarData;
  primaryColor: string;
  secondaryColor: string;
}>();

const RADAR_KEYS = ['firepower', 'entry', 'defense', 'clutch', 'utility'] as const;
const RADAR_LABELS = ['火力', '突破', '防守', '残局', '道具'] as const;
const RADIUS = 36;
const CENTER = 50;

function generateRadarSvgPoints(radarData: RadarData, progress = 1) {
  return RADAR_KEYS.map((key, i) => {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const value = Math.min(Math.max(radarData[key], 0), 100);
    const r = (value / 100) * RADIUS * progress;
    return `${CENTER + r * Math.cos(angle)},${CENTER + r * Math.sin(angle)}`;
  }).join(' ');
}

const radarBgPoints = (() => {
  const center = 50;
  return [0, 1, 2, 3, 4]
    .map((i) => {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      return `${center + RADIUS * Math.cos(angle)},${center + RADIUS * Math.sin(angle)}`;
    })
    .join(' ');
})();

function scaleRadarPoints(scale: number) {
  return radarBgPoints
    .split(' ')
    .map((p) => {
      const [x, y] = p.split(',');
      return `${50 + (Number(x) - 50) * scale},${50 + (Number(y) - 50) * scale}`;
    })
    .join(' ');
}

const centerPoints = generateRadarSvgPoints(
  { firepower: 0, entry: 0, defense: 0, clutch: 0, utility: 0 },
  1,
);

const primaryPoints = ref(centerPoints);
const secondaryPoints = ref(centerPoints);

let radarAnimation: ReturnType<typeof animate> | null = null;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyRadarPoints(progress: number) {
  primaryPoints.value = generateRadarSvgPoints(props.primary, progress);
  secondaryPoints.value = props.secondary
    ? generateRadarSvgPoints(props.secondary, progress)
    : centerPoints;
}

onMounted(() => {
  const targetPrimary = generateRadarSvgPoints(props.primary);
  const targetSecondary = props.secondary ? generateRadarSvgPoints(props.secondary) : centerPoints;

  if (prefersReducedMotion()) {
    primaryPoints.value = targetPrimary;
    secondaryPoints.value = targetSecondary;
    return;
  }

  const progress = { value: 0 };
  radarAnimation = animate(progress, {
    value: { from: 0, to: 1, duration: 750, ease: 'outExpo', delay: 120 },
    onUpdate: () => applyRadarPoints(progress.value),
  });
});

onUnmounted(() => {
  radarAnimation?.pause();
  radarAnimation = null;
});

const axisLines = [0, 1, 2, 3, 4].map((i) => {
  const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
  return { x2: 50 + RADIUS * Math.cos(angle), y2: 50 + RADIUS * Math.sin(angle) };
});

const labelPositions = [
  { x: 50, y: 7, anchor: 'middle' as const },
  { x: 88, y: 37, anchor: 'start' as const },
  { x: 73, y: 84, anchor: 'middle' as const },
  { x: 27, y: 84, anchor: 'middle' as const },
  { x: 12, y: 37, anchor: 'end' as const },
];
</script>

<template>
  <div class="radar-chart flex justify-center">
    <svg viewBox="0 0 100 100" class="h-56 w-56 overflow-visible" aria-hidden="true">
      <!-- 网格 -->
      <polygon :points="radarBgPoints" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="0.5" />
      <polygon
        v-for="scale in [0.75, 0.5, 0.25]"
        :key="scale"
        :points="scaleRadarPoints(scale)"
        fill="none"
        stroke="#d1d5db"
        stroke-width="0.45"
      />
      <line
        v-for="(axis, i) in axisLines"
        :key="i"
        x1="50"
        y1="50"
        :x2="axis.x2"
        :y2="axis.y2"
        stroke="#d1d5db"
        stroke-width="0.45"
      />

      <!-- 对方：底层，弱化参考线 -->
      <polygon
        v-if="secondary"
        :points="secondaryPoints"
        :fill="secondaryColor"
        fill-opacity="0.06"
        :stroke="secondaryColor"
        stroke-width="0.65"
        stroke-opacity="0.32"
        stroke-linejoin="round"
      />

      <!-- 本方：顶层，同等线宽 -->
      <polygon
        :points="primaryPoints"
        :fill="primaryColor"
        fill-opacity="0.2"
        :stroke="primaryColor"
        stroke-width="0.75"
        stroke-opacity="0.9"
        stroke-linejoin="round"
      />

      <!-- 维度标签 -->
      <text
        v-for="(label, i) in RADAR_LABELS"
        :key="label"
        :x="labelPositions[i].x"
        :y="labelPositions[i].y"
        font-size="5"
        :text-anchor="labelPositions[i].anchor"
        fill="#94a3b8"
      >
        {{ label }}
      </text>
    </svg>
  </div>
</template>
