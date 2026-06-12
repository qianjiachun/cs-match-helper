<script setup lang="ts">
import { computed } from 'vue';
import type { WatcherStatus } from '@core/types';

const props = defineProps<{
  status: WatcherStatus;
}>();

const state = computed(() => {
  if (!props.status.running) {
    return {
      label: '服务未就绪',
      hint: props.status.lastError ?? '请重启应用后重试',
      tone: 'danger' as const,
      pulse: false,
    };
  }

  if (!props.status.fileExists) {
    return {
      label: '等待客户端',
      hint: '启动完美对战平台后，将自动开始捕获匹配信息',
      tone: 'warning' as const,
      pulse: true,
    };
  }

  return {
    label: '监听中',
    hint: '正在后台捕获匹配事件，开始匹配即可',
    tone: 'success' as const,
    pulse: true,
  };
});

const dotClass = computed(() => {
  const map = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };
  return map[state.value.tone];
});

const stripeClass = computed(() => {
  const map = {
    success: 'border-l-success',
    warning: 'border-l-warning',
    danger: 'border-l-danger',
  };
  return map[state.value.tone];
});
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 shadow-sm"
    :class="['border-l-[3px]', stripeClass]"
    role="status"
    :aria-label="state.label"
  >
    <span class="relative mt-1 flex h-2 w-2 shrink-0">
      <span
        v-if="state.pulse"
        class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
        :class="dotClass"
      />
      <span class="relative inline-flex h-2 w-2 rounded-full" :class="dotClass" />
    </span>
    <div class="min-w-0">
      <p class="text-[13px] font-medium text-fg">{{ state.label }}</p>
      <p class="mt-0.5 text-[12px] leading-relaxed text-fg-secondary">{{ state.hint }}</p>
    </div>
  </div>
</template>
