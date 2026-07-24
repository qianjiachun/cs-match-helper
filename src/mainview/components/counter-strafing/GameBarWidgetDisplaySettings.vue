<script setup lang="ts">
import { ArrowDownUp, ChartColumn, ChevronDown, Eye, Layers, LineChart } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import type { useCounterStrafing } from '../../composables/useCounterStrafing';
import HudDisplaySettingsControls from './HudDisplaySettingsControls.vue';

const props = defineProps<{
  cs: ReturnType<typeof useCounterStrafing>;
}>();

const settings = props.cs.settings;
const expanded = ref(false);

const switchTrackClass =
  'relative inline-block h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors duration-150 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-150 peer-checked:bg-accent peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:opacity-50';

const dualChartMode = computed(
  () => settings.value.gamebarShowAssessmentChart && settings.value.gamebarShowShootingChart,
);

const ratioLabel = computed(() => {
  const assessment = Math.round(settings.value.gamebarAssessmentRatio * 100);
  return `急停 ${assessment}% / 开枪 ${100 - assessment}%`;
});

const orderSummary = computed(() =>
  settings.value.gamebarAssessmentOnTop ? '急停在上' : '开枪在上',
);

const displaySummary = computed(() => {
  const charts = [
    settings.value.gamebarShowAssessmentChart ? '急停' : '',
    settings.value.gamebarShowShootingChart ? '开枪' : '',
  ].filter(Boolean);
  if (!dualChartMode.value) return charts[0] ?? '未配置';
  return `${charts.join(' + ')} · ${orderSummary.value} · ${ratioLabel.value}`;
});

function patchShowAssessment(checked: boolean) {
  if (!checked && !settings.value.gamebarShowShootingChart) {
    void props.cs.applySettings({
      gamebarShowAssessmentChart: true,
      gamebarShowShootingChart: true,
    });
    return;
  }
  void props.cs.applySettings({ gamebarShowAssessmentChart: checked });
}

function patchShowShooting(checked: boolean) {
  if (!checked && !settings.value.gamebarShowAssessmentChart) {
    void props.cs.applySettings({
      gamebarShowAssessmentChart: true,
      gamebarShowShootingChart: true,
    });
    return;
  }
  void props.cs.applySettings({ gamebarShowShootingChart: checked });
}

function patchAssessmentOnTop(assessmentOnTop: boolean) {
  void props.cs.applySettings({ gamebarAssessmentOnTop: assessmentOnTop });
}

function patchAssessmentRatio(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  const clamped = Math.min(0.95, Math.max(0.05, value));
  void props.cs.applySettings({ gamebarAssessmentRatio: clamped }, { debounceMs: 120 });
}
</script>

<template>
  <section
    class="overflow-hidden rounded-xl border transition-[border-color,background-color,box-shadow] duration-200"
    :class="
      expanded
        ? 'border-border bg-surface shadow-[0_1px_2px_rgb(15_23_42/0.05)]'
        : 'border-accent/25 bg-accent/5 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_6px_18px_rgb(15_23_42/0.04)]'
    "
  >
    <button
      type="button"
      class="group flex min-h-16 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-[background-color,scale] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35 active:scale-[0.96]"
      :class="expanded ? 'bg-elevated/25 hover:bg-elevated/45' : 'hover:bg-accent/7'"
      :aria-expanded="expanded"
      :aria-label="expanded ? '收起小组件显示设置' : '展开小组件显示设置'"
      @click="expanded = !expanded"
    >
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-150"
        :class="
          expanded
            ? 'bg-accent/10 text-accent group-hover:bg-accent/15'
            : 'bg-accent text-white shadow-[0_2px_5px_rgb(15_23_42/0.12)]'
        "
      >
        <Layers class="size-4" aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[14px] font-semibold leading-tight text-fg">
          小组件显示设置
        </span>
        <span class="mt-1 block truncate text-[10px] tabular-nums text-fg-muted">
          {{ displaySummary }}
        </span>
      </span>
      <span
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,box-shadow,color] duration-150"
        :class="
          expanded
            ? 'bg-elevated text-fg-muted'
            : 'bg-surface text-accent shadow-[0_1px_3px_rgb(15_23_42/0.1)] group-hover:bg-accent group-hover:text-white'
        "
      >
        <ChevronDown
          class="size-4 transition-transform duration-150"
          :class="expanded ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </span>
    </button>

    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
      :class="expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="space-y-5 border-t border-border-subtle bg-surface px-4 py-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <section
              class="flex h-full flex-col overflow-hidden rounded-lg bg-elevated/30 shadow-[inset_0_0_0_1px_var(--color-border-subtle)]"
            >
              <div class="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
                <Eye class="size-3.5 text-fg-muted" aria-hidden="true" />
                <p class="text-[11px] font-semibold text-fg-secondary">显示内容</p>
              </div>
              <div class="grid flex-1 grid-rows-2 divide-y divide-border-subtle">
                <label
                  class="group/option flex min-h-14 cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-elevated/45"
                >
                  <span class="flex min-w-0 items-center gap-2.5">
                    <span
                      class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/8 text-accent transition-colors duration-150 group-hover/option:bg-accent/12"
                    >
                      <LineChart class="size-3.5" aria-hidden="true" />
                    </span>
                    <span class="min-w-0">
                      <span class="block text-[12px] font-medium leading-tight text-fg-secondary">
                        急停图表
                      </span>
                      <span class="mt-1 block text-[10px] leading-tight text-fg-muted">
                        急停时机趋势
                      </span>
                    </span>
                  </span>
                  <span class="relative inline-flex shrink-0 items-center">
                    <input
                      type="checkbox"
                      class="peer sr-only"
                      :checked="settings.gamebarShowAssessmentChart"
                      aria-label="显示急停图表"
                      @change="patchShowAssessment(($event.target as HTMLInputElement).checked)"
                    />
                    <span :class="switchTrackClass" aria-hidden="true" />
                  </span>
                </label>
                <label
                  class="group/option flex min-h-14 cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-elevated/45"
                >
                  <span class="flex min-w-0 items-center gap-2.5">
                    <span
                      class="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/8 text-emerald-700 transition-colors duration-150 group-hover/option:bg-emerald-500/12"
                    >
                      <ChartColumn class="size-3.5" aria-hidden="true" />
                    </span>
                    <span class="min-w-0">
                      <span class="block text-[12px] font-medium leading-tight text-fg-secondary">
                        开枪稳定图表
                      </span>
                      <span class="mt-1 block text-[10px] leading-tight text-fg-muted">
                        开枪稳定趋势
                      </span>
                    </span>
                  </span>
                  <span class="relative inline-flex shrink-0 items-center">
                    <input
                      type="checkbox"
                      class="peer sr-only"
                      :checked="settings.gamebarShowShootingChart"
                      aria-label="显示开枪稳定直方图"
                      @change="patchShowShooting(($event.target as HTMLInputElement).checked)"
                    />
                    <span :class="switchTrackClass" aria-hidden="true" />
                  </span>
                </label>
              </div>
            </section>

            <section
              class="flex h-full flex-col overflow-hidden rounded-lg bg-elevated/30 shadow-[inset_0_0_0_1px_var(--color-border-subtle)]"
            >
              <div
                class="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2"
              >
                <div class="flex items-center gap-2">
                  <ArrowDownUp class="size-3.5 text-fg-muted" aria-hidden="true" />
                  <p class="text-[11px] font-semibold text-fg-secondary">上下布局</p>
                </div>
                <span v-if="!dualChartMode" class="text-[10px] text-fg-muted">
                  需显示两个图表
                </span>
              </div>
              <div
                class="grid flex-1 place-items-center px-3 py-2.5 transition-opacity duration-150"
                :class="dualChartMode ? '' : 'opacity-45'"
              >
                <div class="w-full space-y-1.5">
                  <div
                    class="grid grid-cols-2 gap-1 rounded-lg bg-elevated/65 p-1 shadow-[inset_0_0_0_1px_var(--color-border-subtle)]"
                    role="group"
                    aria-label="图表上下顺序"
                  >
                    <button
                      type="button"
                      class="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md px-2 text-[11px] font-medium transition-[background-color,box-shadow,color,scale] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed"
                      :class="settings.gamebarAssessmentOnTop ? 'bg-surface text-accent shadow-[0_1px_2px_rgb(15_23_42/0.08)]' : 'text-fg-muted hover:bg-surface/65 hover:text-fg-secondary'"
                      :disabled="!dualChartMode"
                      :aria-pressed="settings.gamebarAssessmentOnTop"
                      @click="patchAssessmentOnTop(true)"
                    >
                      急停在上
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md px-2 text-[11px] font-medium transition-[background-color,box-shadow,color,scale] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed"
                      :class="!settings.gamebarAssessmentOnTop ? 'bg-surface text-accent shadow-[0_1px_2px_rgb(15_23_42/0.08)]' : 'text-fg-muted hover:bg-surface/65 hover:text-fg-secondary'"
                      :disabled="!dualChartMode"
                      :aria-pressed="!settings.gamebarAssessmentOnTop"
                      @click="patchAssessmentOnTop(false)"
                    >
                      开枪在上
                    </button>
                  </div>
                  <div>
                    <div class="flex h-4 items-center justify-between gap-3 px-0.5 text-[10px] text-fg-muted">
                      <span>高度占比</span>
                      <output class="tabular-nums">
                        {{ ratioLabel }}
                      </output>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.95"
                      step="0.01"
                      class="widget-ratio-slider relative top-1 block w-full"
                      :disabled="!dualChartMode"
                      :value="settings.gamebarAssessmentRatio"
                      :style="{ '--ratio-pct': `${((settings.gamebarAssessmentRatio - 0.05) / 0.9) * 100}%` }"
                      aria-label="急停图表与开枪图表高度占比"
                      @input="patchAssessmentRatio(($event.target as HTMLInputElement).value)"
                      @change="patchAssessmentRatio(($event.target as HTMLInputElement).value)"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <HudDisplaySettingsControls :cs="props.cs" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.widget-ratio-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 40px;
  border-radius: 9999px;
  cursor: pointer;
  background: linear-gradient(
    to right,
    var(--color-accent, #4a90e2) 0%,
    var(--color-accent, #4a90e2) var(--ratio-pct, 50%),
    color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent) var(--ratio-pct, 50%),
    color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent) 100%
  );
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 6px;
  transition: opacity 0.15s ease;
}

.widget-ratio-slider:disabled {
  cursor: not-allowed;
}

.widget-ratio-slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 9999px;
  background: transparent;
}

.widget-ratio-slider::-webkit-slider-thumb {
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
  transition: box-shadow 0.15s ease;
}

.widget-ratio-slider:not(:disabled)::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent, #4a90e2) 16%, transparent);
}

.widget-ratio-slider::-moz-range-track {
  height: 6px;
  border: none;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent);
}

.widget-ratio-slider::-moz-range-progress {
  height: 6px;
  border-radius: 9999px;
  background: var(--color-accent, #4a90e2);
}

.widget-ratio-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--color-accent, #4a90e2) 35%, white);
  border-radius: 9999px;
  background: var(--color-surface, #fff);
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.12);
  cursor: pointer;
}
</style>
