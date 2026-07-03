<script setup lang="ts">
import {
  ArrowDownUp,
  ChartColumn,
  ChevronDown,
  Layers,
  LineChart,
} from 'lucide-vue-next';
import { computed, ref } from 'vue';
import type { useCounterStrafing } from '../../composables/useCounterStrafing';

const props = defineProps<{
  cs: ReturnType<typeof useCounterStrafing>;
}>();

const expanded = ref(false);
const settings = props.cs.settings;

const switchTrackClass =
  'relative inline-block h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 peer-checked:bg-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:opacity-60';

const dualChartMode = computed(
  () => settings.value.gamebarShowAssessmentChart && settings.value.gamebarShowShootingChart,
);

const ratioLabel = computed(() => {
  const assessment = Math.round(settings.value.gamebarAssessmentRatio * 100);
  return `折线图 ${assessment}% / 柱状图 ${100 - assessment}%`;
});

const orderSummary = computed(() =>
  settings.value.gamebarAssessmentOnTop ? '折线图在上' : '柱状图在上',
);

const summaryChips = computed(() => {
  const chips: string[] = [];
  if (settings.value.gamebarShowAssessmentChart) chips.push('折线图');
  if (settings.value.gamebarShowShootingChart) chips.push('柱状图');
  if (dualChartMode.value) {
    chips.push(orderSummary.value);
    chips.push(ratioLabel.value);
  }
  return chips;
});

function toggleExpanded() {
  expanded.value = !expanded.value;
}

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
  <section class="overflow-hidden rounded-xl border border-border bg-base">
    <button
      type="button"
      class="group flex w-full cursor-pointer flex-col gap-1.5 px-4 py-3 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:bg-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      :class="expanded ? 'bg-elevated/40' : 'hover:border-accent/25'"
      :aria-expanded="expanded"
      @click="toggleExpanded()"
    >
      <div class="flex w-full items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors duration-200 group-hover:bg-accent/15"
        >
          <Layers class="h-4 w-4" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold text-fg">小组件显示设置</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
            {{
              expanded
                ? '调整游戏内图表显示、顺序与上下高度占比'
                : '点击展开，自定义游戏内小组件的图表布局'
            }}
          </p>
        </div>
        <span
          class="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-200"
          :class="
            expanded
              ? 'border-border bg-surface text-fg-secondary'
              : 'border-accent/25 bg-accent/8 text-accent group-hover:border-accent/40 group-hover:bg-accent/12'
          "
        >
          {{ expanded ? '收起' : '展开设置' }}
          <ChevronDown
            class="h-3.5 w-3.5 transition-transform duration-200 ease-out"
            :class="expanded ? 'rotate-180' : ''"
            aria-hidden="true"
          />
        </span>
      </div>

      <div
        v-if="!expanded && summaryChips.length"
        class="flex flex-wrap gap-1 pl-12"
        aria-hidden="true"
      >
        <span
          v-for="chip in summaryChips"
          :key="chip"
          class="rounded-md border border-border-subtle bg-surface px-2 py-0.5 text-[10px] font-medium text-fg-secondary"
        >
          {{ chip }}
        </span>
      </div>
    </button>

    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
      :class="expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="divide-y divide-border-subtle border-t border-border-subtle bg-surface/60">
          <label
            class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 hover:bg-elevated/50"
          >
            <span class="flex items-center gap-2 text-[12px] font-medium text-fg-secondary">
              <LineChart class="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
              显示急停折线图
            </span>
            <span class="relative inline-flex shrink-0 items-center">
              <input
                type="checkbox"
                class="peer sr-only"
                :checked="settings.gamebarShowAssessmentChart"
                aria-label="显示急停折线图"
                @change="patchShowAssessment(($event.target as HTMLInputElement).checked)"
              />
              <span :class="switchTrackClass" aria-hidden="true" />
            </span>
          </label>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 hover:bg-elevated/50"
          >
            <span class="flex items-center gap-2 text-[12px] font-medium text-fg-secondary">
              <ChartColumn class="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
              显示开枪柱状图
            </span>
            <span class="relative inline-flex shrink-0 items-center">
              <input
                type="checkbox"
                class="peer sr-only"
                :checked="settings.gamebarShowShootingChart"
                aria-label="显示开枪柱状图"
                @change="patchShowShooting(($event.target as HTMLInputElement).checked)"
              />
              <span :class="switchTrackClass" aria-hidden="true" />
            </span>
          </label>

          <div class="space-y-2.5 px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[12px] font-medium text-fg-secondary">上下顺序</span>
              <span class="text-[11px] text-fg-muted">{{ orderSummary }}</span>
            </div>
            <div
              class="grid grid-cols-2 gap-2"
              :class="dualChartMode ? '' : 'pointer-events-none opacity-50'"
            >
              <button
                type="button"
                class="cursor-pointer rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors duration-200"
                :class="
                  settings.gamebarAssessmentOnTop
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-base text-fg-secondary hover:border-accent/35 hover:bg-elevated/80'
                "
                :disabled="!dualChartMode"
                :aria-pressed="settings.gamebarAssessmentOnTop"
                @click="patchAssessmentOnTop(true)"
              >
                折线图在上
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors duration-200"
                :class="
                  !settings.gamebarAssessmentOnTop
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-base text-fg-secondary hover:border-accent/35 hover:bg-elevated/80'
                "
                :disabled="!dualChartMode"
                :aria-pressed="!settings.gamebarAssessmentOnTop"
                @click="patchAssessmentOnTop(false)"
              >
                柱状图在上
              </button>
            </div>
          </div>

          <div class="space-y-2 px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <span class="flex items-center gap-2 text-[12px] font-medium text-fg-secondary">
                <ArrowDownUp class="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
                上下占比
              </span>
              <span class="text-[11px] tabular-nums text-fg-muted">{{ ratioLabel }}</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              class="widget-ratio-slider w-full"
              :class="dualChartMode ? '' : 'pointer-events-none opacity-50'"
              :disabled="!dualChartMode"
              :value="settings.gamebarAssessmentRatio"
              :style="{ '--ratio-pct': `${((settings.gamebarAssessmentRatio - 0.05) / 0.9) * 100}%` }"
              aria-label="折线图与柱状图高度占比"
              @input="patchAssessmentRatio(($event.target as HTMLInputElement).value)"
              @change="patchAssessmentRatio(($event.target as HTMLInputElement).value)"
            />
            <p class="text-[10px] leading-relaxed text-fg-muted">
              两个图表都显示时可调整；也可在小组件内将鼠标移到中间分割线，上下拖动调节
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.widget-ratio-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 9999px;
  cursor: pointer;
  background: linear-gradient(
    to right,
    var(--color-accent, #4a90e2) 0%,
    var(--color-accent, #4a90e2) var(--ratio-pct, 50%),
    color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent) var(--ratio-pct, 50%),
    color-mix(in srgb, var(--color-border, #e4e4e7) 88%, transparent) 100%
  );
  transition: opacity 0.2s ease;
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
