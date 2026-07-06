<script setup lang="ts">
import { ArrowLeft, Bug, Gauge, Minus, Settings, Square, X } from 'lucide-vue-next';
import { defineAsyncComponent, ref } from 'vue';
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from '../native';
import type { DebugLogEntry } from '@core/log/types';
import type { WatcherStatus } from '@core/types';
import appIcon from '@app-icon';
import { useDebugUnlock } from '../composables/useDebugUnlock';
import type { useComments } from '../composables/useComments';
import UpdateBadge from './UpdateBadge.vue';

const MatchDebugPanel = defineAsyncComponent(() => import('./MatchDebugPanel.vue'));

const { debugEnabled } = useDebugUnlock();
const debugPanelMounted = ref(false);
const debugPanelInitialOpen = ref(false);

function openDebugPanel() {
  debugPanelInitialOpen.value = true;
  debugPanelMounted.value = true;
  emit('debugOpen');
}

const props = defineProps<{
  view: 'main' | 'settings' | 'counter-strafing';
  counterStrafingListening: boolean;
  injectMatch: (data: Record<string, unknown>) => void;
  injectAiResult: (raw: string) => Promise<string | null>;
  p5e: ReturnType<typeof import('../composables/useP5eCdp').useP5eCdp>;
  logEntries: DebugLogEntry[];
  watcher: WatcherStatus;
  version: string;
  hasUpdate: boolean;
  comments: ReturnType<typeof useComments>;
}>();

const emit = defineEmits<{
  clearLogs: [];
  openSettings: [];
  openCounterStrafing: [];
  goMain: [];
  openUpdateDialog: [];
  debugOpen: [];
}>();

function counterStrafingAriaLabel(): string {
  const onPage = props.view === 'counter-strafing';
  if (props.counterStrafingListening) {
    return onPage ? '急停助手（当前，记录中）' : '急停助手（记录中）';
  }
  return onPage ? '急停助手（当前）' : '打开急停助手';
}
</script>

<template>
  <header
    class="flex h-11 shrink-0 items-center border-b border-border bg-surface"
    data-tauri-drag-region
  >
    <div class="flex min-w-0 flex-1 items-center gap-3 px-4" data-tauri-drag-region>
      <div class="flex items-center gap-2.5">
        <img
          :src="appIcon"
          alt=""
          class="h-6 w-6 shrink-0 rounded-md object-cover"
          aria-hidden="true"
        />
        <div class="flex min-w-0 items-baseline gap-2">
          <p class="truncate text-[13px] font-semibold text-fg">CS 匹配助手 -By 小淳</p>
          <span class="shrink-0 text-[11px] text-fg-muted">{{ version }}</span>
          <UpdateBadge
            v-if="hasUpdate"
            compact
            @click="emit('openUpdateDialog')"
          />
        </div>
      </div>
    </div>

    <div class="no-drag relative flex h-full items-stretch">
      <button
        v-if="debugEnabled && !debugPanelMounted"
        type="button"
        class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        @click="openDebugPanel"
      >
        <Bug class="h-4 w-4" />
        <span class="hidden sm:inline">调试</span>
      </button>
      <MatchDebugPanel
        v-else-if="debugEnabled && debugPanelMounted"
        placement="header"
        :initial-open="debugPanelInitialOpen"
        :log-entries="logEntries"
        :watcher="watcher"
        :inject-ai-result="injectAiResult"
        :p5e="p5e"
        :comments="comments"
        @inject="injectMatch"
        @clear-logs="emit('clearLogs')"
      />
      <button
        type="button"
        tabindex="-1"
        class="cs-header-strafing-btn relative flex h-full cursor-pointer items-center gap-1.5 px-3 text-[12px] outline-none transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        :class="
          view === 'counter-strafing'
            ? counterStrafingListening
              ? 'bg-emerald-500/8 text-fg'
              : 'bg-elevated text-fg'
            : counterStrafingListening
              ? 'text-emerald-700 hover:bg-emerald-500/8'
              : 'text-fg-muted hover:bg-elevated hover:text-fg-secondary'
        "
        :aria-label="counterStrafingAriaLabel()"
        :aria-current="view === 'counter-strafing' ? 'page' : undefined"
        @mousedown.prevent
        @click="view !== 'counter-strafing' && emit('openCounterStrafing')"
      >
        <span class="relative shrink-0">
          <Gauge
            class="h-4 w-4 transition-[color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            :class="counterStrafingListening ? 'scale-105 text-emerald-600' : 'scale-100'"
            aria-hidden="true"
          />
          <Transition name="cs-header-status-dot">
            <span
              v-if="counterStrafingListening"
              class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-surface motion-safe:animate-pulse sm:hidden"
              aria-hidden="true"
            />
          </Transition>
        </span>
        <span
          class="hidden min-w-0 items-center sm:inline-flex"
          :class="counterStrafingListening ? 'gap-1.5' : 'gap-0'"
        >
          <span class="shrink-0 whitespace-nowrap">急停助手</span>
          <div
            class="grid min-w-0 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            :class="counterStrafingListening ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'"
            aria-hidden="true"
          >
            <div class="min-w-0 overflow-hidden">
              <span
                class="cs-header-status-badge inline-flex w-max shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                :class="
                  counterStrafingListening
                    ? 'cs-header-status-badge--visible'
                    : 'cs-header-status-badge--hidden'
                "
              >
                <span
                  class="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse"
                  aria-hidden="true"
                />
                记录中
              </span>
            </div>
          </div>
        </span>
      </button>
      <button
        v-if="view === 'main'"
        type="button"
        class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        aria-label="打开设置"
        @click="emit('openSettings')"
      >
        <Settings class="h-4 w-4" />
        <span class="hidden sm:inline">设置</span>
      </button>
      <button
        v-if="view !== 'main'"
        type="button"
        class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        aria-label="返回主页"
        @click="emit('goMain')"
      >
        <ArrowLeft class="h-4 w-4" />
        <span class="hidden sm:inline">返回</span>
      </button>

      <div class="mx-1 w-px self-stretch bg-border" />

      <button
        type="button"
        class="flex w-11 cursor-pointer items-center justify-center text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg"
        aria-label="最小化"
        @click="minimizeWindow"
      >
        <Minus class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="flex w-11 cursor-pointer items-center justify-center text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg"
        aria-label="最大化"
        @click="toggleMaximizeWindow"
      >
        <Square class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        class="flex w-11 cursor-pointer items-center justify-center text-fg-muted transition-colors duration-200 hover:bg-danger/8 hover:text-danger"
        aria-label="关闭"
        @click="closeWindow"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.cs-header-status-badge {
  transition:
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cs-header-status-badge--visible {
  opacity: 1;
  transform: translateX(0);
  filter: blur(0);
  transition-delay: 200ms;
}

.cs-header-status-badge--hidden {
  opacity: 0;
  transform: translateX(-4px);
  filter: blur(2px);
  pointer-events: none;
  transition-delay: 0ms;
}

.cs-header-status-dot-enter-active,
.cs-header-status-dot-leave-active {
  transition:
    opacity 240ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cs-header-status-dot-enter-from,
.cs-header-status-dot-leave-to {
  opacity: 0;
  transform: scale(0.25);
}

.cs-header-status-dot-enter-to,
.cs-header-status-dot-leave-from {
  opacity: 1;
  transform: scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .cs-header-strafing-btn,
  .cs-header-status-badge,
  .cs-header-status-badge--visible {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }

  .cs-header-status-dot-enter-active,
  .cs-header-status-dot-leave-active {
    transition-duration: 0.01ms;
  }

  .cs-header-status-dot-enter-from,
  .cs-header-status-dot-leave-to {
    transform: none;
  }
}
</style>
