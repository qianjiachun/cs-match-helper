<script setup lang="ts">
import { computed } from 'vue';
import {
  ChevronDown,
  Cloud,
  Copy,
  Download,
  FolderOpen,
  Github,
  Loader2,
  RefreshCw,
} from 'lucide-vue-next';
import { useGameBarWidgetInstallUi } from '../../composables/useGameBarWidgetInstallUi';
import { showToast } from '../../composables/useCopyFeedback';
import { openExternalUrl } from '../../native';
import type { useGameBarWidget } from '../../composables/useGameBarWidget';

const WIDGET_FEEDBACK_ISSUES_URL = 'https://github.com/qianjiachun/cs-match-helper/issues';

function openWidgetFeedback() {
  void openExternalUrl(WIDGET_FEEDBACK_ISSUES_URL);
}

const props = withDefaults(
  defineProps<{
    widget: ReturnType<typeof useGameBarWidget>;
    showStepNumber?: boolean;
    showRedetect?: boolean;
    defaultInstallPanelOpen?: boolean;
    gameBarInstalledAssumed?: boolean;
    actionsDisabled?: boolean;
    contentClass?: string;
  }>(),
  {
    showStepNumber: true,
    showRedetect: true,
    defaultInstallPanelOpen: false,
    gameBarInstalledAssumed: false,
    actionsDisabled: false,
    contentClass: '',
  },
);

const actionsDisabledRef = computed(() => props.actionsDisabled);

const {
  showInstallPanel,
  selectedInstallSource,
  widgetStatus,
  widgetBusy,
  widgetStatusRefreshing,
  widgetDetecting,
  widgetError,
  gameBarInstalled,
  downloadSources,
  widgetReady,
  widgetSetupStep,
  widgetStep2Title,
  widgetStep2Badge,
  widgetInstallCtaLabel,
  installPanelHint,
  showInstallWaitingHint,
  widgetProgressLabel,
  showInstallFailure,
  showWidgetActivity,
  widgetDetectHint,
  installActionsDisabled,
  redetectWidget,
  onInstallCtaClick,
  installFromSelectedSource,
  installFromSource,
  copySourceUrl,
  pickLocalPackage,
  pickLocalFolder,
  copyDiagnostics,
  openInstallPanel,
} = useGameBarWidgetInstallUi(props.widget, {
  defaultInstallPanelOpen: props.defaultInstallPanelOpen,
  gameBarInstalledAssumed: props.gameBarInstalledAssumed,
  actionsDisabled: actionsDisabledRef,
  onToast: showToast,
});

defineExpose({ openInstallPanel });
</script>

<template>
  <div
    class="rounded-xl border px-4 py-3.5 transition-colors duration-200"
    :class="[
      widgetDetecting
        ? 'border-accent/40 bg-accent/8 ring-1 ring-accent/20'
        : widgetReady
          ? 'border-emerald-500/25 bg-emerald-500/6'
          : widgetSetupStep === 2
            ? 'border-accent/30 bg-accent/5'
            : 'border-border bg-base',
      contentClass,
    ]"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 gap-3.5">
        <span
          v-if="showStepNumber"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
          :class="
            widgetDetecting
              ? 'bg-accent/15 text-accent'
              : widgetReady
                ? 'bg-emerald-500/15 text-emerald-700'
                : 'bg-accent/12 text-accent'
          "
        >
          2
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold text-fg">{{ widgetStep2Title }}</p>
          <p class="mt-1 text-[12px] leading-relaxed text-fg-muted">
            {{ widgetDetectHint }}
          </p>
        </div>
      </div>
      <span
        class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        :class="
          widgetDetecting
            ? 'bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent'
            : widgetReady
              ? 'bg-emerald-500/12 text-emerald-700'
              : !widgetStatus?.installed
                ? 'bg-warning/12 text-amber-700'
                : 'bg-elevated text-fg-muted'
        "
      >
        <Loader2
          v-if="widgetDetecting"
          class="h-3 w-3 animate-spin"
          aria-hidden="true"
        />
        {{ widgetStep2Badge }}
      </span>
    </div>

    <div class="mt-3 flex flex-wrap gap-2" :class="showStepNumber ? 'sm:pl-10.5' : ''">
      <button
        type="button"
        class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="installActionsDisabled || !gameBarInstalled"
        @click="onInstallCtaClick()"
      >
        <Loader2
          v-if="widgetBusy"
          class="h-4 w-4 animate-spin"
          aria-hidden="true"
        />
        <Download v-else class="h-4 w-4" aria-hidden="true" />
        {{ widgetInstallCtaLabel }}
        <ChevronDown
          v-if="!widgetBusy"
          class="h-4 w-4 transition-transform duration-200 ease-out"
          :class="showInstallPanel ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
      <button
        v-if="showRedetect"
        type="button"
        class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="widgetStatusRefreshing || !gameBarInstalled"
        @click="redetectWidget()"
      >
        <RefreshCw
          class="h-4 w-4"
          :class="widgetStatusRefreshing ? 'animate-spin' : ''"
          aria-hidden="true"
        />
        重新检测
      </button>
    </div>

    <div
      v-if="showWidgetActivity"
      class="mt-2.5 space-y-2"
      :class="showStepNumber ? 'sm:pl-10.5' : ''"
      aria-live="polite"
      aria-atomic="true"
    >
      <p class="text-[11px] leading-snug text-fg-secondary">
        {{ widgetProgressLabel }}
      </p>
      <div
        v-if="showInstallWaitingHint"
        class="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900"
      >
        <p class="font-semibold">安装进行中，请稍候</p>
        <p class="mt-1">
          会弹出<strong class="font-medium">安装窗口</strong>，完成后会自动关闭。
          <strong class="font-medium">请勿手动关闭</strong>。
        </p>
        <p class="mt-1.5">
          若中途出现系统提示（例如「资源正在使用」），属于正常现象，耐心等待几分钟即可。
        </p>
      </div>
    </div>

    <div
      v-if="showInstallFailure"
      class="mt-3 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[11px] leading-relaxed text-danger"
      :class="showStepNumber ? 'sm:ml-10.5' : ''"
    >
      <p class="font-medium">安装失败</p>
      <p class="mt-1 whitespace-pre-wrap">{{ widgetError }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-fg-secondary underline-offset-2 hover:underline"
          @click="copyDiagnostics()"
        >
          复制问题信息
        </button>
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-fg-secondary underline-offset-2 hover:underline"
          @click="openWidgetFeedback()"
        >
          去反馈
        </button>
      </div>
    </div>

    <div
      class="install-panel-shell mt-3"
      :class="[showStepNumber ? 'sm:ml-10.5' : '', showInstallPanel ? 'install-panel-shell--open' : '']"
      :aria-hidden="!showInstallPanel"
    >
      <div class="install-panel-shell__inner">
        <div class="rounded-xl border border-border bg-elevated/50 p-3">
          <p class="mb-3 text-[12px] font-medium text-fg">选择下载方式</p>
          <div v-if="downloadSources.length" class="space-y-2">
            <div
              v-for="source in downloadSources"
              :key="source.id"
              class="cursor-pointer rounded-xl border p-3 transition-[border-color,background-color] duration-200"
              :class="
                selectedInstallSource === source.id
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-surface hover:border-accent/30'
              "
              @click="selectedInstallSource = source.id"
            >
              <div class="flex items-start gap-2.5">
                <Cloud
                  v-if="source.id === 'cdn'"
                  class="mt-0.5 h-4 w-4 shrink-0 text-fg-muted"
                  aria-hidden="true"
                />
                <Github
                  v-else
                  class="mt-0.5 h-4 w-4 shrink-0 text-fg-muted"
                  aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-[13px] font-semibold text-fg">{{ source.label }}</p>
                  <p class="mt-0.5 text-[11px] text-fg-muted">{{ source.hint }}</p>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2 pl-6">
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                  :disabled="widgetBusy || !source.url"
                  @click.stop="installFromSource(source.id)"
                >
                  从此源安装
                </button>
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-base px-3 py-1.5 text-[11px] font-medium text-fg-secondary disabled:opacity-50"
                  :disabled="widgetBusy"
                  @click.stop="copySourceUrl(source.id)"
                >
                  <Copy class="h-3 w-3" />
                  复制下载地址
                </button>
              </div>
            </div>
          </div>
          <p
            v-else
            class="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] text-fg-secondary"
          >
            {{ installPanelHint }}
          </p>
          <div class="mt-3 border-t border-border-subtle pt-3">
            <p class="text-[12px] font-medium text-fg">已经下载好了？</p>
            <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
              在线安装会自动解压 zip，无需电脑安装解压软件。若你手动下载了 zip 且无法解压，可用其他电脑解压后拷贝文件夹过来。
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-[12px] font-medium text-fg-secondary hover:bg-elevated disabled:opacity-50"
                :disabled="widgetBusy"
                @click="pickLocalPackage()"
              >
                <FolderOpen class="h-4 w-4" />
                选择 zip 安装包
              </button>
              <button
                type="button"
                class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-[12px] font-medium text-fg-secondary hover:bg-elevated disabled:opacity-50"
                :disabled="widgetBusy"
                @click="pickLocalFolder()"
              >
                <FolderOpen class="h-4 w-4" />
                选择已解压文件夹
              </button>
            </div>
          </div>
          <button
            type="button"
            class="mt-3 w-full cursor-pointer rounded-xl bg-accent/10 py-2.5 text-[12px] font-semibold text-accent hover:bg-accent/15 disabled:opacity-50"
            :disabled="widgetBusy || !downloadSources.length"
            @click="installFromSelectedSource()"
          >
            使用所选来源安装
          </button>
        </div>
      </div>
    </div>

    <p
      v-if="!gameBarInstalled"
      class="mt-2 text-[11px] text-warning"
      :class="showStepNumber ? 'sm:pl-10.5' : ''"
    >
      请先完成第 1 步
    </p>
  </div>
</template>

<style scoped>
.install-panel-shell {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  pointer-events: none;
  transition:
    grid-template-rows 0.2s cubic-bezier(0.2, 0, 0, 1),
    opacity 0.15s ease-out;
}

.install-panel-shell--open {
  grid-template-rows: 1fr;
  opacity: 1;
  pointer-events: auto;
}

.install-panel-shell__inner {
  min-height: 0;
  overflow: hidden;
}
</style>
