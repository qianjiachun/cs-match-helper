<script setup lang="ts">
import { computed } from 'vue';
import { ChartColumn, Crosshair, Eye, EyeOff, Info, Layers, LineChart, Lock, LockOpen } from 'lucide-vue-next';
import HudDisplaySettingsControls from './HudDisplaySettingsControls.vue';
import type { useCounterStrafing } from '../../composables/useCounterStrafing';
import { localize as l } from '../../i18n';

const props = defineProps<{
  cs: ReturnType<typeof useCounterStrafing>;
}>();

const snapshot = props.cs.snapshot;
const assessmentSnapshot = props.cs.assessmentSnapshot;
const settings = props.cs.settings;
const busy = props.cs.busy;

const panels = computed(() => [
  {
    key: 'assessment',
    title: l('急停评估', 'Counter-strafing'),
    description: l('左右、前后切换时的急停图表', 'Counter-strafe timing chart'),
    icon: LineChart,
    visible: () => assessmentSnapshot.value.hudVisible,
    toggle: () => props.cs.toggleAssessmentHud(),
    locate: () => props.cs.locateHud('assessment'),
    locked: () => settings.value.assessmentHudLocked,
    toggleLock: () =>
      props.cs.applySettings({ assessmentHudLocked: !settings.value.assessmentHudLocked }),
  },
  {
    key: 'shooting',
    title: l('开枪稳定', 'Shooting stability'),
    description: l('开枪时的稳定程度直方图', 'Movement error at shot time'),
    icon: ChartColumn,
    visible: () => snapshot.value.hudVisible,
    toggle: () => props.cs.toggleHud(),
    locate: () => props.cs.locateHud('shooting'),
    locked: () => settings.value.hudLocked,
    toggleLock: () => props.cs.applySettings({ hudLocked: !settings.value.hudLocked }),
  },
] as const);

const visibleCount = computed(() => panels.value.filter((panel) => panel.visible()).length);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-start gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Layers class="size-4" aria-hidden="true" />
        </span>
        <div>
          <p class="text-[13px] font-semibold text-fg">{{ l('悬浮窗', 'HUDs') }}</p>
          <p class="mt-0.5 text-pretty text-[11px] leading-relaxed text-fg-muted">{{ l('分别控制显示状态与鼠标穿透', 'Control visibility and click-through independently.') }}</p>
        </div>
      </div>
      <span class="shrink-0 pt-1 text-[11px] tabular-nums text-fg-muted">{{ l(`${visibleCount}/2 已显示`, `${visibleCount}/2 visible`) }}</span>
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
              {{ panel.visible() ? l('显示中', 'Visible') : l('已隐藏', 'Hidden') }}
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
            :aria-label="panel.visible() ? l(`隐藏${panel.title}`, `Hide ${panel.title}`) : l(`显示${panel.title}`, `Show ${panel.title}`)"
            :title="panel.visible() ? l('隐藏悬浮窗', 'Hide HUD') : l('显示悬浮窗', 'Show HUD')"
            @click="panel.toggle()"
          >
            <component :is="panel.visible() ? EyeOff : Eye" class="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-[background-color,color,scale] duration-150 after:absolute after:-inset-0.5 after:content-[''] hover:bg-elevated hover:text-fg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35"
            :disabled="busy || !panel.visible()"
            :aria-label="l(`定位${panel.title}`, `Locate ${panel.title}`)"
            :title="panel.visible() ? l('定位悬浮窗', 'Locate HUD') : l('请先显示悬浮窗', 'Show the HUD first')"
            @click="panel.locate()"
          >
            <Crosshair class="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-[background-color,color,scale] duration-150 after:absolute after:-inset-0.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
            :class="panel.locked() ? 'bg-accent/10 text-accent hover:bg-accent/15' : 'text-fg-muted hover:bg-elevated hover:text-fg-secondary'"
            :disabled="busy"
            :aria-label="panel.locked() ? l(`解锁${panel.title}`, `Unlock ${panel.title}`) : l(`锁定${panel.title}`, `Lock ${panel.title}`)"
            :aria-pressed="panel.locked()"
            :title="panel.locked() ? l('解锁并允许拖动', 'Unlock and allow dragging') : l('锁定并启用鼠标穿透', 'Lock and enable click-through')"
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
      <p>{{ l('解锁后拖动右下角把手调整位置；锁定后鼠标可穿透悬浮窗。', 'Unlock to drag or resize from the bottom-right handle. Lock to enable click-through.') }}</p>
    </div>
  </div>
</template>
