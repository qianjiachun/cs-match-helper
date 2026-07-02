<script setup lang="ts">
import { ChartColumn, Eye, EyeOff, Layers, LineChart, Lock, LockOpen } from 'lucide-vue-next';
import SettingsToggle from '../settings/SettingsToggle.vue';
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
    description: '左右、前后切换时的折线图',
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
    description: '开枪时的稳定程度柱状图',
    icon: ChartColumn,
    visible: () => snapshot.value.hudVisible,
    toggle: () => props.cs.toggleHud(),
    locked: () => settings.value.hudLocked,
    toggleLock: () => props.cs.applySettings({ hudLocked: !settings.value.hudLocked }),
  },
] as const;
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <Layers class="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      <div>
        <p class="text-[14px] font-semibold text-fg">悬浮窗设置</p>
        <p class="mt-0.5 text-[12px] text-fg-muted">开始记录后进游戏，在这里开关两个悬浮窗</p>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div
        v-for="panel in panels"
        :key="panel.key"
        class="flex flex-col rounded-xl border border-border bg-base p-4"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
          >
            <component :is="panel.icon" class="h-4 w-4" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold text-fg">{{ panel.title }}</p>
            <p class="mt-0.5 text-[11px] leading-snug text-fg-muted">{{ panel.description }}</p>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            :class="
              panel.visible()
                ? 'bg-emerald-500/12 text-emerald-700'
                : 'bg-elevated text-fg-muted'
            "
          >
            {{ panel.visible() ? '已显示' : '已隐藏' }}
          </span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors duration-200"
            :class="
              panel.visible()
                ? 'border border-border bg-surface text-fg-secondary hover:bg-elevated'
                : 'bg-accent text-white hover:bg-accent-hover'
            "
            :disabled="busy"
            @click="panel.toggle()"
          >
            <component :is="panel.visible() ? EyeOff : Eye" class="h-3.5 w-3.5 shrink-0" />
            {{ panel.visible() ? '隐藏' : '显示' }}
          </button>
          <button
            type="button"
            class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated"
            :disabled="busy"
            @click="panel.toggleLock()"
          >
            <component :is="panel.locked() ? LockOpen : Lock" class="h-3.5 w-3.5 shrink-0" />
            {{ panel.locked() ? '解锁' : '锁定' }}
          </button>
        </div>
      </div>
    </div>

    <SettingsToggle
      :model-value="settings.hudShowStableBars"
      label="开枪稳定：显示绿色稳定柱"
      description="关闭后只高亮失误，稳定射击留空位"
      :disabled="busy"
      @update:model-value="cs.applySettings({ hudShowStableBars: $event })"
    />

    <p class="text-[11px] leading-relaxed text-fg-muted">
      两个悬浮窗可同时打开。拖右下角把手移动；锁定后鼠标可穿透，不影响游戏操作。
    </p>
  </div>
</template>
