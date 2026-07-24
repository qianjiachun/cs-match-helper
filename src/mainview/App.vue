<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { getCounterStrafingSnapshot } from '@core/counter-strafing/native';
import CopyToast from './components/CopyToast.vue';
import CloseConfirmDialog from './components/CloseConfirmDialog.vue';
import TitleBar from './components/TitleBar.vue';
import { useCounterStrafingListening } from './composables/useCounterStrafingListening';
import { useCounterStrafingSession } from './composables/useCounterStrafingSession';
import { useAiAnalysis } from './composables/useAiAnalysis';
import { useAppSession } from './composables/useAppSession';
import { useComments } from './composables/useComments';
import { useLogWatcher } from './composables/useLogWatcher';
import { useMatchHistory } from './composables/useMatchHistory';
import { useP5eCdp } from './composables/useP5eCdp';
import { useCloseConfirm } from './composables/useCloseConfirm';
import { useUpdateCheck } from './composables/useUpdateCheck';
import MatchAssistantView from './views/MatchAssistantView.vue';
import PlatformSelectView from './views/PlatformSelectView.vue';
import SettingsView, { type SettingsTab } from './views/SettingsView.vue';
import { startupMark } from './utils/startup-metrics';
import type { PlatformId } from '@platforms/types';
import { requestMatchAttention } from './native';

startupMark('app setup start');

const P5eLaunchView = defineAsyncComponent(() => import('./views/P5eLaunchView.vue'));
const CounterStrafingView = defineAsyncComponent(() => import('./views/CounterStrafingView.vue'));
const PlayerCommentsDrawer = defineAsyncComponent(
  () => import('./components/comments/PlayerCommentsDrawer.vue'),
);
const UpdateDialog = defineAsyncComponent(() => import('./components/UpdateDialog.vue'));

const { phase, selectedPlatform, selectPlatform, completeP5eSetup, resetToP5eLaunch, resetToPlatformSelect } =
  useAppSession();

function flashTaskbarForNewMatch() {
  void requestMatchAttention().catch(() => {
    // Attention is best-effort and must not interrupt match processing.
  });
}

const logWatcher = useLogWatcher({ autoInit: false, onNewMatch: flashTaskbarForNewMatch });
const { matches, logEntries, clearLogEntries, watcher, injectMatch, ensureListeners, startWatching, stopWatching } =
  logWatcher;

const matchHistory = useMatchHistory();

const p5e = useP5eCdp(
  (record) => {
    matches.value = [record];
  },
  {
    autoInit: false,
    onClientExit: () => {
      matches.value = [];
      currentView.value = 'main';
      resetToP5eLaunch();
    },
    onNewMatch: flashTaskbarForNewMatch,
  },
);
const ai = useAiAnalysis({
  autoInit: false,
  onAnalysisSettled: (payload) => {
    const current = matches.value[0];
    const fromIndex = matchHistory.index.value?.entries.find((e) => e.id === payload.matchId);
    const platformId =
      current && current.id === payload.matchId
        ? matchHistory.platformOf(current)
        : fromIndex?.platformId ?? current?.platformId ?? 'unknown';
    void matchHistory
      .patchMatchAi(payload.matchId, platformId, {
        status: payload.status,
        result: payload.result,
        usage: payload.usage,
        elapsedMs: payload.elapsedMs,
        error: payload.error,
        model: payload.model,
        providerMode: payload.providerMode,
        analyzedAt: payload.analyzedAt,
        fallbackRecord: current && current.id === payload.matchId ? current : null,
      })
      .catch(() => {
        // 历史写入失败不阻断 AI 展示
      });
  },
});

watch(
  () => matches.value[0] ?? null,
  (record) => {
    if (!record) return;
    void matchHistory.saveMatchSnapshot(record).catch(() => {
      // 历史写入失败不阻断主流程
    });
  },
);
const comments = useComments({ autoInit: false });
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
const { closeConfirmOpen, cancelClose, confirmClose, onCloseDialogAfterLeave } = useCloseConfirm();
const counterStrafingListening = useCounterStrafingListening();
const { busy: counterStrafingBusy, toggleListening: toggleCounterStrafingListening } =
  useCounterStrafingSession();

const commentsDrawerMounted = ref(false);
const updateDialogMounted = ref(false);

watch(
  () => comments.drawerOpen.value,
  (open) => {
    if (open) commentsDrawerMounted.value = true;
  },
);

watch(dialogOpen, (open) => {
  if (open) updateDialogMounted.value = true;
});

watch(
  () => updateState.hasUpdate,
  (hasUpdate) => {
    if (hasUpdate) updateDialogMounted.value = true;
  },
);

onMounted(() => {
  startupMark('app mounted');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startupMark('first interaction ready');
      const preloadKey = () => {
        comments.preloadClientKey();
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(preloadKey, { timeout: 3000 });
      } else {
        window.setTimeout(preloadKey, 1500);
      }
    });
  });

  void ensureVersion();
  window.setTimeout(() => void check({ silent: true }), 12000);
  void getCounterStrafingSnapshot()
    .then((snap) => {
      counterStrafingListening.value = snap.listening;
    })
    .catch(() => {
      // 急停模块未就绪时忽略
    });
});

startupMark('app setup end');

async function injectAiResult(raw: string): Promise<string | null> {
  const match = matches.value[0];
  if (!match) return '请先注入或接收一条匹配数据';
  return ai.injectResult(match.id, raw);
}

type AppView = 'main' | 'settings' | 'counter-strafing';

const currentView = ref<AppView>('main');
const settingsTab = ref<SettingsTab>('history');

const settingsViewRef = ref<{ goBack: () => boolean } | null>(null);

function openSettings(tab: SettingsTab = 'history') {
  settingsTab.value = tab;
  currentView.value = 'settings';
}

function openCounterStrafing() {
  currentView.value = 'counter-strafing';
}

async function toggleCounterStrafing() {
  await toggleCounterStrafingListening();
}

function goMain() {
  if (currentView.value === 'settings' && settingsViewRef.value?.goBack?.()) {
    return;
  }
  currentView.value = 'main';
  const match = matches.value[0];
  if (match) {
    void ai.analyzeMatch(match);
  }
}

async function onSelectPlatform(id: PlatformId) {
  selectPlatform(id);
  if (id === 'perfect') {
    await ensureListeners();
    await stopWatching();
    await startWatching();
  } else {
    void stopWatching();
    if (id === '5e') {
      void p5e.ensureReady();
    }
  }
}

async function onDebugOpen() {
  await ensureListeners();
  await p5e.ensureReady();
}

function onP5eReady() {
  completeP5eSetup();
}

async function onBackToPlatformSelect() {
  resetToPlatformSelect();
  matches.value = [];
  await stopWatching();
  void p5e.stopCollect();
}

function onBackFromP5e() {
  void onBackToPlatformSelect();
}
</script>

<template>
  <div class="flex h-full flex-col bg-base">
    <TitleBar
      :view="currentView"
      :counter-strafing-listening="counterStrafingListening"
      :counter-strafing-busy="counterStrafingBusy"
      :inject-match="injectMatch"
      :inject-ai-result="injectAiResult"
      :p5e="p5e"
      :log-entries="logEntries"
      :watcher="watcher"
      :version="formattedVersion"
      :has-update="updateState.hasUpdate"
      :comments="comments"
      :match-history="matchHistory"
      @clear-logs="clearLogEntries"
      @open-settings="openSettings()"
      @open-counter-strafing="openCounterStrafing()"
      @toggle-counter-strafing="toggleCounterStrafing()"
      @go-main="goMain"
      @open-update-dialog="openDialog()"
      @debug-open="onDebugOpen()"
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
            @open-settings="openSettings('ai')"
            @back="onBackToPlatformSelect"
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
          ref="settingsViewRef"
          class="h-full"
          :ai="ai"
          :comments="comments"
          :history="matchHistory"
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
    <PlayerCommentsDrawer v-if="commentsDrawerMounted" :comments="comments" />
    <UpdateDialog
      v-if="updateDialogMounted"
      :open="dialogOpen"
      :current-version="updateState.currentVersion"
      :latest-version="updateState.latestVersion"
      :release-notes="updateState.releaseNotes"
      :release-url="updateState.releaseUrl"
      :download-url="updateState.downloadUrl"
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
    <CloseConfirmDialog
      :open="closeConfirmOpen"
      @cancel="cancelClose()"
      @confirm="confirmClose()"
      @after-leave="onCloseDialogAfterLeave()"
    />
  </div>
</template>
