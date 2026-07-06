<script setup lang="ts">
import {
  clampHudChartOpacity,
  clampHudLineStrokeWidth,
  clampHudStatTextScale,
  HUD_CHART_OPACITY_MAX,
  HUD_CHART_OPACITY_MIN,
  HUD_LINE_STROKE_WIDTH_MAX,
  HUD_LINE_STROKE_WIDTH_MIN,
  HUD_STAT_TEXT_SCALE_MAX,
  HUD_STAT_TEXT_SCALE_MIN,
} from '@core/counter-strafing/hudDisplay';
import type { useCounterStrafing } from '../../composables/useCounterStrafing';

const props = defineProps<{
  cs: ReturnType<typeof useCounterStrafing>;
  /** 嵌入折叠面板内时不重复顶部分割线与区块标题 */
  embedded?: boolean;
  disabled?: boolean;
}>();

const settings = props.cs.settings;

const sliderClass =
  'hud-display-slider w-full disabled:pointer-events-none disabled:opacity-50';

function patchStatTextScale(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  void props.cs.applySettings(
    { hudStatTextScale: clampHudStatTextScale(value) },
    { debounceMs: 120 },
  );
}

function patchLineStrokeWidth(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  void props.cs.applySettings(
    { hudLineStrokeWidth: clampHudLineStrokeWidth(value) },
    { debounceMs: 120 },
  );
}

function patchAssessmentOpacity(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  void props.cs.applySettings(
    { hudAssessmentChartOpacity: clampHudChartOpacity(value) },
    { debounceMs: 120 },
  );
}

function patchShootingOpacity(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  void props.cs.applySettings(
    { hudShootingChartOpacity: clampHudChartOpacity(value) },
    { debounceMs: 120 },
  );
}

function pct(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}
</script>

<template>
  <div
    class="space-y-3 px-4 py-3"
    :class="embedded ? '' : 'border-t border-border-subtle'"
  >
    <div v-if="!embedded">
      <p class="text-[12px] font-semibold text-fg">显示样式</p>
      <p class="mt-0.5 text-[10px] leading-relaxed text-fg-muted">
        同时作用于游戏内悬浮窗与 Game Bar 小组件；透明度含统计文字与图表
      </p>
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 text-[12px]">
        <span class="font-medium text-fg-secondary">统计文字大小</span>
        <span class="tabular-nums text-fg-muted">{{ settings.hudStatTextScale.toFixed(2) }}×</span>
      </div>
      <input
        type="range"
        :class="sliderClass"
        :min="HUD_STAT_TEXT_SCALE_MIN"
        :max="HUD_STAT_TEXT_SCALE_MAX"
        step="0.05"
        :disabled="disabled"
        :value="settings.hudStatTextScale"
        :style="{ '--slider-pct': pct(settings.hudStatTextScale, HUD_STAT_TEXT_SCALE_MIN, HUD_STAT_TEXT_SCALE_MAX) }"
        aria-label="统计文字大小"
        @input="patchStatTextScale(($event.target as HTMLInputElement).value)"
        @change="patchStatTextScale(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 text-[12px]">
        <span class="font-medium text-fg-secondary">折线图线宽</span>
        <span class="tabular-nums text-fg-muted">{{ settings.hudLineStrokeWidth.toFixed(1) }}px</span>
      </div>
      <input
        type="range"
        :class="sliderClass"
        :min="HUD_LINE_STROKE_WIDTH_MIN"
        :max="HUD_LINE_STROKE_WIDTH_MAX"
        step="0.1"
        :disabled="disabled"
        :value="settings.hudLineStrokeWidth"
        :style="{ '--slider-pct': pct(settings.hudLineStrokeWidth, HUD_LINE_STROKE_WIDTH_MIN, HUD_LINE_STROKE_WIDTH_MAX) }"
        aria-label="折线图线宽"
        @input="patchLineStrokeWidth(($event.target as HTMLInputElement).value)"
        @change="patchLineStrokeWidth(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 text-[12px]">
        <span class="font-medium text-fg-secondary">急停评估透明度</span>
        <span class="tabular-nums text-fg-muted">{{ Math.round(settings.hudAssessmentChartOpacity * 100) }}%</span>
      </div>
      <input
        type="range"
        :class="sliderClass"
        :min="HUD_CHART_OPACITY_MIN"
        :max="HUD_CHART_OPACITY_MAX"
        step="0.05"
        :disabled="disabled"
        :value="settings.hudAssessmentChartOpacity"
        :style="{ '--slider-pct': pct(settings.hudAssessmentChartOpacity, HUD_CHART_OPACITY_MIN, HUD_CHART_OPACITY_MAX) }"
        aria-label="急停评估透明度（含统计文字与折线）"
        @input="patchAssessmentOpacity(($event.target as HTMLInputElement).value)"
        @change="patchAssessmentOpacity(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 text-[12px]">
        <span class="font-medium text-fg-secondary">开枪稳定透明度</span>
        <span class="tabular-nums text-fg-muted">{{ Math.round(settings.hudShootingChartOpacity * 100) }}%</span>
      </div>
      <input
        type="range"
        :class="sliderClass"
        :min="HUD_CHART_OPACITY_MIN"
        :max="HUD_CHART_OPACITY_MAX"
        step="0.05"
        :disabled="disabled"
        :value="settings.hudShootingChartOpacity"
        :style="{ '--slider-pct': pct(settings.hudShootingChartOpacity, HUD_CHART_OPACITY_MIN, HUD_CHART_OPACITY_MAX) }"
        aria-label="开枪稳定透明度（含统计文字与柱状图）"
        @input="patchShootingOpacity(($event.target as HTMLInputElement).value)"
        @change="patchShootingOpacity(($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>
</template>

<style scoped>
.hud-display-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 9999px;
  cursor: pointer;
  background: linear-gradient(
    to right,
    var(--color-accent, #4a90e2) 0%,
    var(--color-accent, #4a90e2) var(--slider-pct, 50%),
    color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent) var(--slider-pct, 50%),
    color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent) 100%
  );
}

.hud-display-slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 9999px;
  background: transparent;
}

.hud-display-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -5px;
  border: 2px solid color-mix(in srgb, var(--color-accent, #4a90e2) 35%, white);
  border-radius: 9999px;
  background: var(--color-surface, #fff);
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.12);
  cursor: pointer;
}

.hud-display-slider::-moz-range-track {
  height: 6px;
  border: none;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent);
}

.hud-display-slider::-moz-range-progress {
  height: 6px;
  border-radius: 9999px;
  background: var(--color-accent, #4a90e2);
}

.hud-display-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--color-accent, #4a90e2) 35%, white);
  border-radius: 9999px;
  background: var(--color-surface, #fff);
  cursor: pointer;
}
</style>
