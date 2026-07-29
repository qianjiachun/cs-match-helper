<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Bug, Minus, Settings, Square, X } from 'lucide-vue-next';
import { computed, defineAsyncComponent, ref } from 'vue';
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from '../native';
import type { DebugLogEntry } from '@core/log/types';
import type { WatcherStatus } from '@core/types';
import appIcon from '@app-icon';
import { useDebugUnlock } from '../composables/useDebugUnlock';
import type { useComments } from '../composables/useComments';
import type { MatchHistoryApi } from '../composables/useMatchHistory';
import UpdateBadge from './UpdateBadge.vue';
import CounterStrafingHeaderControl from './counter-strafing/CounterStrafingHeaderControl.vue';

const { t, locale } = useI18n();

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
  counterStrafingBusy: boolean;
  injectMatch: (data: Record<string, unknown>) => void;
  injectAiResult: (raw: string) => Promise<string | null>;
  p5e: ReturnType<typeof import('../composables/useP5eCdp').useP5eCdp>;
  logEntries: DebugLogEntry[];
  watcher: WatcherStatus;
  version: string;
  hasUpdate: boolean;
  comments: ReturnType<typeof useComments>;
  matchHistory: MatchHistoryApi;
}>();

const emit = defineEmits<{
  clearLogs: [];
  openSettings: [];
  openCounterStrafing: [];
  toggleCounterStrafing: [];
  goHome: [];
  openUpdateDialog: [];
  debugOpen: [];
}>();

const showSettingsButton = computed(
  () => props.view === 'main',
);

const showBackButton = computed(() => props.view === 'settings' || props.view === 'counter-strafing');
</script>

<template>
  <header
    class="flex h-11 shrink-0 items-center border-b border-border bg-surface"
    data-tauri-drag-region
  >
    <div class="flex min-w-0 flex-1 items-center gap-3 px-4" data-tauri-drag-region>
      <div class="flex min-w-0 items-center gap-2.5 px-1 py-0.5">
        <img
          :src="appIcon"
          alt=""
          class="h-6 w-6 shrink-0 rounded-md object-cover"
          aria-hidden="true"
        />
        <div class="flex min-w-0 items-baseline gap-2">
          <p class="truncate text-[13px] font-semibold text-fg">{{ locale === 'en-US' ? 'CS Match Helper - by 小淳' : 'CS 对局助手 -By 小淳' }}</p>
          <span class="shrink-0 text-[11px] text-fg-muted">{{ version }}</span>
        </div>
      </div>
      <UpdateBadge
        v-if="hasUpdate"
        compact
        class="no-drag"
        @click="emit('openUpdateDialog')"
      />
    </div>

    <div class="no-drag relative flex h-full items-stretch">
      <button
        v-if="debugEnabled && !debugPanelMounted"
        type="button"
        class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        @click="openDebugPanel"
      >
        <Bug class="h-4 w-4" />
        <span class="hidden sm:inline">{{ t('common.debug') }}</span>
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
        :match-history="matchHistory"
        @inject="injectMatch"
        @clear-logs="emit('clearLogs')"
      />

      <CounterStrafingHeaderControl
        :active-page="view === 'counter-strafing'"
        :listening="counterStrafingListening"
        :busy="counterStrafingBusy"
        @open="emit('openCounterStrafing')"
        @toggle="emit('toggleCounterStrafing')"
      />

      <button
        v-if="showSettingsButton"
        type="button"
        class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        :aria-label="t('common.settings')"
        @click="emit('openSettings')"
      >
        <Settings class="h-4 w-4" />
        <span class="hidden sm:inline">{{ t('common.settings') }}</span>
      </button>

      <button
        v-if="showBackButton"
        type="button"
        class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
        :aria-label="t('common.previous')"
        @click="emit('goHome')"
      >
        <ArrowLeft class="h-4 w-4" />
        <span class="hidden sm:inline">{{ t('common.back') }}</span>
      </button>

      <div class="mx-1 w-px self-stretch bg-border" />

      <button
        type="button"
        class="flex w-11 cursor-pointer items-center justify-center text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg"
        :aria-label="t('common.minimize')"
        @click="minimizeWindow"
      >
        <Minus class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="flex w-11 cursor-pointer items-center justify-center text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg"
        :aria-label="t('common.maximize')"
        @click="toggleMaximizeWindow"
      >
        <Square class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        class="flex w-11 cursor-pointer items-center justify-center text-fg-muted transition-colors duration-200 hover:bg-danger/8 hover:text-danger"
        :aria-label="t('common.close')"
        @click="closeWindow"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </header>
</template>
