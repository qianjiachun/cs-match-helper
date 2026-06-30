<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onMounted, ref } from 'vue';
import CopyToast from './components/CopyToast.vue';
import PlayerCommentsDrawer from './components/comments/PlayerCommentsDrawer.vue';
import TitleBar from './components/TitleBar.vue';
import UpdateDialog from './components/UpdateDialog.vue';
import { useAiAnalysis } from './composables/useAiAnalysis';
import { useAppSession } from './composables/useAppSession';
import { useComments } from './composables/useComments';
import { useLogWatcher } from './composables/useLogWatcher';
import { useP5eCdp } from './composables/useP5eCdp';
import { useUpdateCheck } from './composables/useUpdateCheck';
import MatchAssistantView from './views/MatchAssistantView.vue';
import P5eLaunchView from './views/P5eLaunchView.vue';
import PlatformSelectView from './views/PlatformSelectView.vue';
import CounterStrafingView from './views/CounterStrafingView.vue';
import SettingsView, { type SettingsTab } from './views/SettingsView.vue';
import type { PlatformId } from '@platforms/types';

const { phase, selectedPlatform, selectPlatform, completeP5eSetup, resetToPlatformSelect } =
  useAppSession();

const { matches, logEntries, clearLogEntries, watcher, injectMatch, startWatching, stopWatching } =
  useLogWatcher();
const p5e = useP5eCdp((record) => {
  matches.value = [record];
});
const ai = useAiAnalysis();
const comments = useComments();
const {
  formattedVersion,
  dialogOpen,
  state: updateState,
  isBusy: updateBusy,
  ensureVersion,
  check,
  openDialog,
  closeDialog,
  retryDownload,
} = useUpdateCheck();

onMounted(() => {
  void getCurrentWindow().show();
  void ensureVersion();
  window.setTimeout(() => {
    void check();
  }, 1500);
});

async function injectAiResult(raw: string): Promise<string | null> {
  const match = matches.value[0];
  if (!match) return '请先注入或接收一条匹配数据';
  return ai.injectResult(match.id, raw);
}

type AppView = 'main' | 'settings' | 'counter-strafing';

const currentView = ref<AppView>('main');
const settingsTab = ref<SettingsTab>('ai');

function openSettings(tab: SettingsTab = 'ai') {
  settingsTab.value = tab;
  currentView.value = 'settings';
}

function openCounterStrafing() {
  currentView.value = 'counter-strafing';
}

function goMain() {
  currentView.value = 'main';
  const match = matches.value[0];
  if (match) {
    void ai.analyzeMatch(match);
  }
}

async function onSelectPlatform(id: PlatformId) {
  selectPlatform(id);
  if (id === 'perfect') {
    await stopWatching();
    await startWatching();
  } else {
    void stopWatching();
  }
}

function onP5eReady() {
  completeP5eSetup();
}

function onBackFromP5e() {
  resetToPlatformSelect();
  void p5e.stopCollect();
}
</script>

<template>
  <div class="flex h-full flex-col bg-base">
    <TitleBar
      :view="currentView"
      :inject-match="injectMatch"
      :inject-ai-result="injectAiResult"
      :p5e="p5e"
      :log-entries="logEntries"
      :watcher="watcher"
      :version="formattedVersion"
      :has-update="updateState.hasUpdate"
      :comments="comments"
      @clear-logs="clearLogEntries"
      @open-settings="openSettings()"
      @open-counter-strafing="openCounterStrafing()"
      @go-main="goMain"
      @open-update-dialog="openDialog()"
    />
    <main class="relative min-h-0 flex-1 overflow-hidden">
      <div
        class="view-shell"
        :class="currentView === 'main' ? 'view-shell--active' : 'view-shell--exit-left'"
        :aria-hidden="currentView !== 'main'"
      >
        <Transition name="phase-cross" mode="out-in">
          <PlatformSelectView
            v-if="phase === 'select-platform'"
            key="select-platform"
            class="h-full"
            @select="onSelectPlatform"
          />
          <P5eLaunchView
            v-else-if="phase === 'p5e-launch'"
            key="p5e-launch"
            class="h-full"
            :p5e="p5e"
            @ready="onP5eReady"
            @back="onBackFromP5e"
          />
          <MatchAssistantView
            v-else
            key="match-assistant"
            class="h-full"
            :ai="ai"
            :comments="comments"
            :matches="matches"
            :watcher="watcher"
            :platform="selectedPlatform ?? 'perfect'"
            :p5e="p5e"
            @open-settings="openSettings"
          />
        </Transition>
      </div>
      <div
        class="view-shell"
        :class="currentView === 'settings' ? 'view-shell--active' : 'view-shell--exit-right'"
        :aria-hidden="currentView !== 'settings'"
      >
        <SettingsView
          v-if="currentView === 'settings'"
          class="h-full"
          :ai="ai"
          :comments="comments"
          :initial-tab="settingsTab"
          :visible="true"
        />
      </div>
      <div
        class="view-shell"
        :class="currentView === 'counter-strafing' ? 'view-shell--active' : 'view-shell--exit-right'"
        :aria-hidden="currentView !== 'counter-strafing'"
      >
        <KeepAlive>
          <CounterStrafingView
            v-if="currentView === 'counter-strafing'"
            class="h-full"
          />
        </KeepAlive>
      </div>
    </main>
    <CopyToast />
    <PlayerCommentsDrawer :comments="comments" />
    <UpdateDialog
      :open="dialogOpen"
      :current-version="updateState.currentVersion"
      :latest-version="updateState.latestVersion"
      :release-notes="updateState.releaseNotes"
      :release-url="updateState.releaseUrl"
      :published-at="updateState.publishedAt"
      :phase="updateState.phase"
      :progress-percent="updateState.progressPercent"
      :downloaded-bytes="updateState.downloadedBytes"
      :total-bytes="updateState.totalBytes"
      :download-error="updateState.downloadError"
      :busy="updateBusy"
      @close="closeDialog()"
      @retry="retryDownload()"
    />
  </div>
</template>
