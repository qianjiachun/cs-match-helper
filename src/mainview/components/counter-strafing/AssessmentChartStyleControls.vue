<script setup lang="ts">
import { ChartScatter, LineChart } from 'lucide-vue-next';
import type { AssessmentChartType } from '@core/counter-strafing/types';

const props = withDefaults(
  defineProps<{
    chartType: AssessmentChartType;
    compact?: boolean;
    disabled?: boolean;
  }>(),
  {
    compact: false,
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:chartType': [value: AssessmentChartType];
}>();

const chartTypeOptions = [
  { value: 'line' as const, label: '折线', icon: LineChart },
  { value: 'scatter' as const, label: '散点', icon: ChartScatter },
];

function setChartType(value: AssessmentChartType) {
  if (!props.disabled && value !== props.chartType) emit('update:chartType', value);
}
</script>

<template>
  <div :class="compact ? 'flex items-center justify-end' : 'flex items-center justify-between gap-3'">
    <span v-if="!compact" class="text-[12px] font-medium text-fg-secondary">急停评估图表</span>

    <div
      class="inline-flex shrink-0 items-center rounded-lg bg-base p-1 shadow-[inset_0_0_0_1px_var(--color-border-subtle)]"
      role="group"
      aria-label="急停评估图表类型"
    >
      <button
        v-for="option in chartTypeOptions"
        :key="option.value"
        type="button"
        class="relative inline-flex h-8 min-w-16 cursor-pointer items-center justify-center gap-1.5 rounded px-2 text-[11px] font-medium transition-[background-color,box-shadow,color,scale] duration-150 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
        :class="
          chartType === option.value
            ? 'bg-surface text-accent shadow-[0_1px_2px_rgb(15_23_42/0.08)]'
            : 'text-fg-muted hover:bg-surface/70 hover:text-fg-secondary'
        "
        :disabled="disabled"
        :aria-label="`${option.label}图`"
        :aria-pressed="chartType === option.value"
        @click="setChartType(option.value)"
      >
        <component :is="option.icon" class="size-3.5" :stroke-width="1.8" aria-hidden="true" />
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
