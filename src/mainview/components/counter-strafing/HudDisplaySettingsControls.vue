<script setup lang="ts">
import { Settings2 } from 'lucide-vue-next';
import {
  clampHudChartOpacity,
  clampHudLineStrokeWidth,
  clampHudStatTextScale,
  HUD_CHART_OPACITY_MAX,
  HUD_CHART_OPACITY_MIN,
  HUD_CONTENT_MODES,
  HUD_LINE_STROKE_WIDTH_MAX,
  HUD_LINE_STROKE_WIDTH_MIN,
  HUD_STAT_TEXT_SCALE_MAX,
  HUD_STAT_TEXT_SCALE_MIN,
  type HudContentMode,
} from '@core/counter-strafing/hudDisplay';
import type { useCounterStrafing } from '../../composables/useCounterStrafing';
import type { AssessmentChartType } from '@core/counter-strafing/types';
import AssessmentChartStyleControls from './AssessmentChartStyleControls.vue';

const props = defineProps<{
  cs: ReturnType<typeof useCounterStrafing>;
  disabled?: boolean;
}>();

const settings = props.cs.settings;

const contentModeOptions: { value: HudContentMode; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'chartOnly', label: '仅图表' },
  { value: 'textOnly', label: '仅文字' },
];

const sliderClass =
  'hud-display-slider w-full disabled:pointer-events-none disabled:opacity-50';

const switchTrackClass =
  'relative inline-block h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors duration-150 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-150 peer-checked:bg-accent peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:opacity-50';

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

function patchContentMode(mode: HudContentMode) {
  if (!HUD_CONTENT_MODES.includes(mode)) return;
  void props.cs.applySettings({ hudContentMode: mode });
}

function patchAssessmentChartType(chartType: AssessmentChartType) {
  void props.cs.applySettings({ assessmentChartType: chartType });
}

function pct(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}
</script>

<template>
  <section class="space-y-4 border-t border-border-subtle pt-4">
    <div class="flex items-start gap-3">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Settings2 class="size-4" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <p class="text-[13px] font-semibold text-fg">显示样式</p>
        <p class="mt-0.5 text-pretty text-[11px] leading-relaxed text-fg-muted">
          同步作用于悬浮窗与 Game Bar 小组件
        </p>
      </div>
    </div>

    <div class="divide-y divide-border-subtle rounded-lg bg-elevated/35 shadow-[inset_0_0_0_1px_var(--color-border-subtle)]">
      <div class="grid gap-3 px-3 py-2.5 sm:grid-cols-2 sm:gap-5">
        <div class="flex min-h-10 items-center justify-between gap-3">
          <span class="text-[12px] font-medium text-fg-secondary">内容</span>
          <div
            class="inline-flex shrink-0 items-center rounded-lg bg-base p-1 shadow-[inset_0_0_0_1px_var(--color-border-subtle)]"
            role="group"
            aria-label="显示内容"
          >
            <button
              v-for="option in contentModeOptions"
              :key="option.value"
              type="button"
              class="relative h-8 cursor-pointer rounded px-2.5 text-[11px] font-medium transition-[background-color,box-shadow,color,scale] duration-150 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
              :class="
                settings.hudContentMode === option.value
                  ? 'bg-surface text-accent shadow-[0_1px_2px_rgb(15_23_42/0.08)]'
                  : 'text-fg-muted hover:bg-surface/70 hover:text-fg-secondary'
              "
              :disabled="disabled"
              :aria-pressed="settings.hudContentMode === option.value"
              @click="patchContentMode(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="flex min-h-10 items-center justify-between gap-3">
          <span class="text-[12px] font-medium text-fg-secondary">急停图表</span>
          <AssessmentChartStyleControls
            :chart-type="settings.assessmentChartType"
            :disabled="disabled"
            compact
            @update:chart-type="patchAssessmentChartType"
          />
        </div>
      </div>

      <div class="grid sm:grid-cols-2 sm:divide-x sm:divide-border-subtle">
        <label class="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 transition-colors duration-150 hover:bg-elevated/45">
          <span class="min-w-0">
            <span class="block text-[12px] font-medium text-fg-secondary">显示稳定柱</span>
            <span class="block text-pretty text-[10px] leading-relaxed text-fg-muted">关闭后只突出失误采样</span>
          </span>
          <span class="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              class="peer sr-only"
              :checked="settings.hudShowStableBars"
              :disabled="disabled"
              aria-label="显示绿色稳定柱"
              @change="props.cs.applySettings({ hudShowStableBars: ($event.target as HTMLInputElement).checked })"
            />
            <span :class="switchTrackClass" aria-hidden="true" />
          </span>
        </label>

        <label class="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 transition-colors duration-150 hover:bg-elevated/45">
          <span class="min-w-0">
            <span class="block text-[12px] font-medium text-fg-secondary">显示首枪标记</span>
            <span class="block text-pretty text-[10px] leading-relaxed text-fg-muted">白点标记每次按下的第一枪</span>
          </span>
          <span class="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              class="peer sr-only"
              :checked="settings.hudShowTapMarkers"
              :disabled="disabled"
              aria-label="显示首枪白点标记"
              @change="props.cs.applySettings({ hudShowTapMarkers: ($event.target as HTMLInputElement).checked })"
            />
            <span :class="switchTrackClass" aria-hidden="true" />
          </span>
        </label>
      </div>
    </div>

    <div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <div>
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

      <div
        class="transition-opacity duration-150"
        :class="settings.assessmentChartType === 'line' ? '' : 'opacity-45'"
      >
        <div class="flex items-center justify-between gap-3 text-[12px]">
          <span class="font-medium text-fg-secondary">折线宽度</span>
          <span class="tabular-nums text-fg-muted">{{ settings.hudLineStrokeWidth.toFixed(1) }}px</span>
        </div>
        <input
          type="range"
          :class="sliderClass"
          :min="HUD_LINE_STROKE_WIDTH_MIN"
          :max="HUD_LINE_STROKE_WIDTH_MAX"
          step="0.1"
          :disabled="disabled || settings.assessmentChartType !== 'line'"
          :value="settings.hudLineStrokeWidth"
          :style="{ '--slider-pct': pct(settings.hudLineStrokeWidth, HUD_LINE_STROKE_WIDTH_MIN, HUD_LINE_STROKE_WIDTH_MAX) }"
          aria-label="急停评估折线宽度"
          @input="patchLineStrokeWidth(($event.target as HTMLInputElement).value)"
          @change="patchLineStrokeWidth(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div>
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
          aria-label="急停评估透明度（含统计文字与图表）"
          @input="patchAssessmentOpacity(($event.target as HTMLInputElement).value)"
          @change="patchAssessmentOpacity(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div>
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
          aria-label="开枪稳定透明度（含统计文字与直方图）"
          @input="patchShootingOpacity(($event.target as HTMLInputElement).value)"
          @change="patchShootingOpacity(($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.hud-display-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 40px;
  border-radius: 9999px;
  cursor: pointer;
  background: linear-gradient(
    to right,
    var(--color-accent, #4a90e2) 0%,
    var(--color-accent, #4a90e2) var(--slider-pct, 50%),
    color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent) var(--slider-pct, 50%),
    color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent) 100%
  );
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 6px;
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
