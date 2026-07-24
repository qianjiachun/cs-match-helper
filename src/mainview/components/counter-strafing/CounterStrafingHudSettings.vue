<script setup lang="ts">
import { computed } from 'vue';
import { ChartColumn, Eye, EyeOff, Info, Layers, LineChart, Lock, LockOpen } from 'lucide-vue-next';
import HudDisplaySettingsControls from './HudDisplaySettingsControls.vue';
import type { useCounterStrafing } from '../../composables/useCounterStrafing';

const props = defineProps<{
  cs: ReturnType<typeof useCounterStrafing>;
}>();

const snapshot = props.cs.snapshot;
const assessmentSnapshot = props.cs.assessmentSnapshot;
const settings = props.cs.settings;
const busy = props.cs.busy;

const panels = [
  {
    key: 'assessment',
    title: '急停评估',
    description: '左右、前后切换时的急停图表',
    icon: LineChart,
    visible: () => assessmentSnapshot.value.hudVisible,
    toggle: () => props.cs.toggleAssessmentHud(),
    locked: () => settings.value.assessmentHudLocked,
    toggleLock: () =>
      props.cs.applySettings({ assessmentHudLocked: !settings.value.assessmentHudLocked }),
  },
  {
    key: 'shooting',
    title: '开枪稳定',
    description: '开枪时的稳定程度直方图',
    icon: ChartColumn,
    visible: () => snapshot.value.hudVisible,
    toggle: () => props.cs.toggleHud(),
    locked: () => settings.value.hudLocked,
    toggleLock: () => props.cs.applySettings({ hudLocked: !settings.value.hudLocked }),
  },
] as const;

const visibleCount = computed(() => panels.filter((panel) => panel.visible()).length);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-start gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Layers class="size-4" aria-hidden="true" />
        </span>
        <div>
          <p class="text-[13px] font-semibold text-fg">悬浮窗</p>
          <p class="mt-0.5 text-pretty text-[11px] leading-relaxed text-fg-muted">分别控制显示状态与鼠标穿透</p>
        </div>
      </div>
      <span class="shrink-0 pt-1 text-[11px] tabular-nums text-fg-muted">{{ visibleCount }}/2 已显示</span>
    </div>

    <div class="divide-y divide-border-subtle rounded-lg bg-base shadow-[inset_0_0_0_1px_var(--color-border-subtle)]">
      <div
        v-for="panel in panels"
        :key="panel.key"
        class="flex min-h-16 items-center gap-3 px-3 py-2.5"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150"
          :class="panel.visible() ? 'bg-accent/10 text-accent' : 'bg-elevated text-fg-muted'"
        >
          <component :is="panel.icon" class="size-4" aria-hidden="true" />
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <p class="text-[12px] font-semibold text-fg">{{ panel.title }}</p>
            <span class="inline-flex items-center gap-1 text-[10px] font-medium" :class="panel.visible() ? 'text-emerald-700' : 'text-fg-muted'">
              <span class="size-1.5 rounded-full" :class="panel.visible() ? 'bg-emerald-500' : 'bg-slate-300'" />
              {{ panel.visible() ? '显示中' : '已隐藏' }}
            </span>
          </div>
          <p class="mt-0.5 truncate text-[10px] text-fg-muted">{{ panel.description }}</p>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-[background-color,color,scale] duration-150 after:absolute after:-inset-0.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
            :class="
              panel.visible()
                ? 'text-fg-muted hover:bg-elevated hover:text-fg-secondary'
                : 'bg-accent text-white hover:bg-accent-hover'
            "
            :disabled="busy"
            :aria-label="panel.visible() ? `隐藏${panel.title}` : `显示${panel.title}`"
            :title="panel.visible() ? '隐藏悬浮窗' : '显示悬浮窗'"
            @click="panel.toggle()"
          >
            <component :is="panel.visible() ? EyeOff : Eye" class="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-[background-color,color,scale] duration-150 after:absolute after:-inset-0.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
            :class="panel.locked() ? 'bg-accent/10 text-accent hover:bg-accent/15' : 'text-fg-muted hover:bg-elevated hover:text-fg-secondary'"
            :disabled="busy"
            :aria-label="panel.locked() ? `解锁${panel.title}` : `锁定${panel.title}`"
            :aria-pressed="panel.locked()"
            :title="panel.locked() ? '解锁并允许拖动' : '锁定并启用鼠标穿透'"
            @click="panel.toggleLock()"
          >
            <component :is="panel.locked() ? LockOpen : Lock" class="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <HudDisplaySettingsControls :cs="cs" :disabled="busy" />

    <div class="flex items-start gap-2 text-pretty text-[10px] leading-relaxed text-fg-muted">
      <Info class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <p>解锁后拖动右下角把手调整位置；锁定后鼠标可穿透悬浮窗。</p>
    </div>
  </div>
</template>
