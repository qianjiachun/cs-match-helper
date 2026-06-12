<script setup lang="ts">
import { onMounted, ref } from 'vue';
import CopyToast from './components/CopyToast.vue';
import TitleBar from './components/TitleBar.vue';
import UpdateDialog from './components/UpdateDialog.vue';
import { useAiAnalysis } from './composables/useAiAnalysis';
import { useLogWatcher } from './composables/useLogWatcher';
import { useUpdateCheck } from './composables/useUpdateCheck';
import MatchAssistantView from './views/MatchAssistantView.vue';
import SettingsView, { type SettingsTab } from './views/SettingsView.vue';

const { matches, logEntries, clearLogEntries, watcher, injectMatch } = useLogWatcher();
const ai = useAiAnalysis();
const {
  formattedVersion,
  dialogOpen,
  state: updateState,
  ensureVersion,
  check,
  openDialog,
  closeDialog,
} = useUpdateCheck();

onMounted(() => {
  void ensureVersion();
  void check();
});

async function injectAiResult(raw: string): Promise<string | null> {
  const match = matches.value[0];
  if (!match) return '请先注入或接收一条匹配数据';
  return ai.injectResult(match.id, raw);
}

type AppView = 'main' | 'settings';

const currentView = ref<AppView>('main');
const settingsTab = ref<SettingsTab>('ai');

function openSettings(tab: SettingsTab = 'ai') {
  settingsTab.value = tab;
  currentView.value = 'settings';
}

function goMain() {
  currentView.value = 'main';
}
</script>

<template>
  <div class="flex h-full flex-col bg-base">
    <TitleBar
      :view="currentView"
      :inject-match="injectMatch"
      :inject-ai-result="injectAiResult"
      :log-entries="logEntries"
      :watcher="watcher"
      :version="formattedVersion"
      :has-update="updateState.hasUpdate"
      @clear-logs="clearLogEntries"
      @open-settings="openSettings()"
      @go-main="goMain"
      @open-update-dialog="openDialog()"
    />
    <main class="relative min-h-0 flex-1 overflow-hidden">
      <MatchAssistantView
        v-show="currentView === 'main'"
        class="h-full"
        :ai="ai"
        :matches="matches"
        :watcher="watcher"
        @open-settings="openSettings"
      />
      <SettingsView
        v-show="currentView === 'settings'"
        class="h-full"
        :ai="ai"
        :initial-tab="settingsTab"
        :visible="currentView === 'settings'"
      />
    </main>
    <CopyToast />
    <UpdateDialog
      :open="dialogOpen"
      :current-version="updateState.currentVersion"
      :latest-version="updateState.latestVersion"
      :release-notes="updateState.releaseNotes"
      :release-url="updateState.releaseUrl"
      :published-at="updateState.publishedAt"
      @close="closeDialog()"
    />
  </div>
</template>
