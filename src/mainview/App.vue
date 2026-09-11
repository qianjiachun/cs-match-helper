<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { MotionConfig } from 'motion-v';
import CopyToast from './components/CopyToast.vue';
import CloseConfirmDialog from './components/CloseConfirmDialog.vue';
import TitleBar from './components/TitleBar.vue';
import { useAiAnalysis } from './composables/useAiAnalysis';
import { useAppSession } from './composables/useAppSession';
import { useComments } from './composables/useComments';
import { useLogWatcher } from './composables/useLogWatcher';
import { useMatchHistory } from './composables/useMatchHistory';
import { useP5eCdp } from './composables/useP5eCdp';
import { usePerfectAuth } from './composables/usePerfectAuth';
import { useCloseConfirm } from './composables/useCloseConfirm';
import { useUpdateCheck } from './composables/useUpdateCheck';
import MatchAssistantView from './views/MatchAssistantView.vue';
import PlatformSelectView from './views/PlatformSelectView.vue';
import SettingsView, { type SettingsTab } from './views/SettingsView.vue';
import { startupMark } from './utils/startup-metrics';
import type { PlatformId } from '@platforms/types';
import type { PerfectAuthMethod } from '@platforms/perfect/auth';
import { requestMatchAttention } from './native';
import { localize as l } from './i18n';
import { buildAiDebugFixture } from '@core/ai/analysis-v2';

startupMark('app setup start');

const P5eLaunchView = defineAsyncComponent(() => import('./views/P5eLaunchView.vue'));
const PerfectAuthView = defineAsyncComponent(() => import('./views/PerfectAuthView.vue'));
const PlayerCommentsDrawer = defineAsyncComponent(
  () => import('./components/comments/PlayerCommentsDrawer.vue'),
);
const UpdateDialog = defineAsyncComponent(() => import('./components/UpdateDialog.vue'));
const MatchHudIntroDialog = defineAsyncComponent(
  () => import('./components/MatchHudIntroDialog.vue'),
);

const {
  phase,
  selectedPlatform,
  selectPlatform,
  completePerfectAuth,
  completeP5eSetup,
  resetToPerfectAuth,
  resetToP5eLaunch,
  resetToPlatformSelect,
} = useAppSession();
const perfectAuth = usePerfectAuth();
const perfectViewerSteamId = computed(() => (
  perfectAuth.status.value.phase === 'authenticated' ? perfectAuth.status.value.uid : undefined
));
const perfectLoginMethod = ref<PerfectAuthMethod>('qr');
const PERFECT_AUTH_MIN_DWELL_MS = 1000;
const PERFECT_AUTH_SUCCESS_HOLD_MS = 420;
let perfectAuthEnteredAt = 0;

function markPerfectAuthEntry() {
  perfectAuthEnteredAt = performance.now();
}

async function waitForPerfectAuthDwell() {
  const remaining = PERFECT_AUTH_MIN_DWELL_MS - (performance.now() - perfectAuthEnteredAt);
  if (remaining > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
  }
}

async function waitForPerfectAuthSuccess(authenticatedAt: number) {
  const remaining = PERFECT_AUTH_SUCCESS_HOLD_MS - (performance.now() - authenticatedAt);
  if (remaining > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
  }
}

function flashTaskbarForNewMatch() {
  void requestMatchAttention().catch(() => {
    // Attention is best-effort and must not interrupt match processing.
  });
}

const logWatcher = useLogWatcher({ autoInit: false, onNewMatch: flashTaskbarForNewMatch });
const { matches, logEntries, clearLogEntries, watcher, injectMatch, replayPerfectFixture, ensureListeners, startWatching, stopWatching } =
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
        locale: payload.locale,
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
    if (record.detail.source === 'ladder-events' && record.detail.perfectSessionPhase !== 'assigned') return;
    void matchHistory.saveMatchSnapshot(record).catch(() => {
      // 历史写入失败不阻断主流程
    });
  },
);
const comments = useComments({
  autoInit: false,
  onPlayerLoadState: logWatcher.patchPlayerLoadState,
});
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

const commentsDrawerMounted = ref(false);
const updateDialogMounted = ref(false);
const matchHudDialogOpen = ref(false);
const matchHudDialogMounted = ref(false);

function openMatchHudDialog() {
  matchHudDialogMounted.value = true;
  matchHudDialogOpen.value = true;
}

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
});

startupMark('app setup end');

async function injectAiResult(raw: string): Promise<string | null> {
  const match = matches.value[0];
  if (!match) return l('请先注入或接收一条匹配数据', 'Inject or receive match data first');
  return ai.injectResult(match, raw, selectedPlatform.value === 'perfect' ? perfectViewerSteamId.value : undefined);
}

type AppView = 'main' | 'settings';

const currentView = ref<AppView>('main');
const settingsTab = ref<SettingsTab>('history');

const settingsViewRef = ref<{ goBack: () => boolean } | null>(null);

function openSettings(tab: SettingsTab = 'history') {
  settingsTab.value = tab;
  currentView.value = 'settings';
}

/** Leave settings (nested back first) or return to previous module view. */
function goHome() {
  if (currentView.value === 'settings' && settingsViewRef.value?.goBack?.()) {
    return;
  }
  if (currentView.value === 'settings') {
    currentView.value = 'main';
    return;
  }
  currentView.value = 'main';
}

async function onSelectPlatform(id: PlatformId, loginMethod: PerfectAuthMethod = 'qr') {
  if (id === 'perfect') markPerfectAuthEntry();
  selectPlatform(id);
  if (id === 'perfect') {
    perfectLoginMethod.value = loginMethod;
    await stopWatching();
    await perfectAuth.ensureListener();
  } else {
    void stopWatching();
    if (id === '5e') {
      void p5e.ensureReady();
    }
  }
}

function getAiV3Fixture(): string | null {
  const match = matches.value[0];
  return match ? buildAiDebugFixture(match) : null;
}

async function openPerfectLoginFromSettings(method: PerfectAuthMethod) {
  currentView.value = 'main';
  matches.value = [];
  void p5e.stopCollect();
  await onSelectPlatform('perfect', method);
}

let enteringPerfectMain = false;
watch(
  () => perfectAuth.status.value.phase,
  async (authPhase) => {
    if (selectedPlatform.value !== 'perfect') return;
    if (authPhase === 'authenticated' && phase.value === 'perfect-auth' && !enteringPerfectMain) {
      const authenticatedAt = performance.now();
      enteringPerfectMain = true;
      try {
        await ensureListeners();
        await startWatching();
        await Promise.all([
          waitForPerfectAuthDwell(),
          waitForPerfectAuthSuccess(authenticatedAt),
        ]);
        if (
          selectedPlatform.value !== 'perfect'
          || phase.value !== 'perfect-auth'
          || perfectAuth.status.value.phase !== 'authenticated'
        ) {
          await stopWatching();
          return;
        }
        completePerfectAuth();
      } finally {
        enteringPerfectMain = false;
      }
      return;
    }
    if (
      phase.value === 'main'
      && ['idle', 'expired', 'cancelled', 'error'].includes(authPhase)
    ) {
      matches.value = [];
      await stopWatching();
      markPerfectAuthEntry();
      resetToPerfectAuth();
    }
  },
);

async function onDebugOpen() {
  await ensureListeners();
  await p5e.ensureReady();
}

function onP5eReady() {
  completeP5eSetup();
}

async function onBackToPlatformSelect() {
  const leavingPlatform = selectedPlatform.value;
  resetToPlatformSelect();
  matches.value = [];
  await stopWatching();
  if (leavingPlatform === 'perfect') {
    perfectAuth.stopValidationTimer();
    const method = perfectAuth.status.value.method;
    const qrLive = method === 'qr' && perfectAuth.hasLiveQrSession();
    if (!qrLive) {
      await perfectAuth.cancel().catch(() => undefined);
    }
  }
  void p5e.stopCollect();
}

function onBackFromP5e() {
  void onBackToPlatformSelect();
}
</script>

<template>
  <MotionConfig reduced-motion="never">
    <div class="flex h-full flex-col bg-base">
    <TitleBar
      :view="currentView"
      :inject-match="injectMatch"
      :replay-perfect-fixture="replayPerfectFixture"
      :inject-ai-result="injectAiResult"
      :get-ai-v3-fixture="getAiV3Fixture"
      :p5e="p5e"
      :log-entries="logEntries"
      :watcher="watcher"
      :version="formattedVersion"
      :has-update="updateState.hasUpdate"
      :comments="comments"
      :match-history="matchHistory"
      :perfect-auth-status="perfectAuth.status.value"
      @clear-logs="clearLogEntries"
      @open-settings="openSettings()"
      @open-match-hud="openMatchHudDialog()"
      @go-home="goHome"
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
          <PerfectAuthView
            v-else-if="phase === 'perfect-auth'"
            key="perfect-auth"
            class="h-full"
            :auth="perfectAuth"
            :initial-method="perfectLoginMethod"
            @back="onBackToPlatformSelect"
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
            :active="currentView === 'main'"
            :viewer-steam-id="selectedPlatform === 'perfect' ? perfectViewerSteamId : undefined"
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
          :perfect-auth="perfectAuth"
          :viewer-steam-id="perfectViewerSteamId"
          :initial-tab="settingsTab"
          :visible="true"
          @open-perfect-login="openPerfectLoginFromSettings"
        />
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
    <MatchHudIntroDialog
      v-if="matchHudDialogMounted"
      :open="matchHudDialogOpen"
      @close="matchHudDialogOpen = false"
    />
    </div>
  </MotionConfig>
</template>
