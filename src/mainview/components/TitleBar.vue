<script setup lang="ts">
import { ArrowLeft, Minus, Settings, Square, X } from 'lucide-vue-next';
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from '../native';
import type { DebugLogEntry } from '@core/log/types';
import type { WatcherStatus } from '@core/types';
import appIcon from '@app-icon';
import { useDebugUnlock } from '../composables/useDebugUnlock';
import MatchDebugPanel from './MatchDebugPanel.vue';
import UpdateBadge from './UpdateBadge.vue';

const { debugEnabled } = useDebugUnlock();

defineProps<{
  view: 'main' | 'settings';
  injectMatch: (data: Record<string, unknown>) => void;
  injectAiResult: (raw: string) => Promise<string | null>;
  p5e: ReturnType<typeof import('../composables/useP5eCdp').useP5eCdp>;
  logEntries: DebugLogEntry[];
  watcher: WatcherStatus;
  version: string;
  hasUpdate: boolean;
}>();

const emit = defineEmits<{
  clearLogs: [];
  openSettings: [];
  goMain: [];
  openUpdateDialog: [];
}>();
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
      <MatchDebugPanel
        v-if="debugEnabled"
        placement="header"
        :log-entries="logEntries"
        :watcher="watcher"
        :inject-ai-result="injectAiResult"
        :p5e="p5e"
        @inject="injectMatch"
        @clear-logs="emit('clearLogs')"
      />
      <button
        v-if="view === 'main'"
        type="button"
        class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        aria-label="打开设置"
        title="设置"
        @click="emit('openSettings')"
      >
        <Settings class="h-4 w-4" />
        <span class="hidden sm:inline">设置</span>
      </button>
      <button
        v-else
        type="button"
        class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        aria-label="返回主页"
        title="返回"
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
