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
  ShieldAlert,
  Trash2,
} from 'lucide-vue-next';
import { useGameBarWidgetInstallUi } from '../../composables/useGameBarWidgetInstallUi';
import { showToast } from '../../composables/useCopyFeedback';
import { openExternalUrl } from '../../native';
import type { useGameBarWidget } from '../../composables/useGameBarWidget';
import { localize as l } from '../../i18n';

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
  uninstalling,
  widgetStatus,
  widgetBusy,
  widgetConnectionRepairing,
  widgetStatusRefreshing,
  widgetDetecting,
  widgetError,
  widgetIssueCode,
  widgetRequiredAction,
  blockingPackageLabels,
  trust,
  smartAppControlOn,
  smartAppControlEvaluation,
  codeIntegrityBlocked,
  gameBarInstalled,
  downloadSources,
  widgetReady,
  widgetNeedsUpdate,
  widgetSetupStep,
  widgetStep2Title,
  widgetStep2Badge,
  widgetInstallCtaLabel,
  installPanelHint,
  installIssueGuidance,
  showInstallWaitingHint,
  widgetProgressLabel,
  showInstallFailure,
  showWidgetActivity,
  widgetDetectHint,
  installActionsDisabled,
  redetectWidget,
  openSmartAppControlSettings,
  onInstallCtaClick,
  installFromSelectedSource,
  installFromSource,
  copySourceUrl,
  pickLocalPackage,
  pickLocalFolder,
  uninstallWidget,
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
        : smartAppControlOn || codeIntegrityBlocked
          ? 'border-danger/30 bg-danger/5'
          : widgetNeedsUpdate
          ? 'border-warning/30 bg-warning/5'
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
              : smartAppControlOn || codeIntegrityBlocked
                ? 'bg-danger/12 text-danger'
                : widgetNeedsUpdate
                ? 'bg-warning/15 text-amber-700'
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
            : smartAppControlOn || codeIntegrityBlocked
              ? 'bg-danger/12 text-danger'
              : widgetNeedsUpdate
              ? 'bg-warning/12 text-amber-700'
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

    <div
      v-if="smartAppControlOn"
      class="mt-3 border-l-2 border-danger bg-danger/5 px-3 py-2.5 text-[11px] leading-relaxed text-danger"
      :class="showStepNumber ? 'sm:ml-10.5' : ''"
    >
      <p class="text-pretty font-semibold">{{ l('智能应用控制已开启，安装已停止', 'Smart App Control is on; setup has stopped') }}</p>
      <p class="mt-1 text-pretty">
        {{ l('程序不会自动关闭安全功能。请在 Windows 安全中心手动关闭，返回后点击「重新检测」。', 'The app will not disable security controls. Turn it off manually in Windows Security, then select “Detect again”.') }}
      </p>
      <button
        type="button"
        class="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-danger px-3 text-[12px] font-medium text-white transition-[background-color,transform] duration-200 hover:bg-danger/90 active:scale-[0.96]"
        @click="openSmartAppControlSettings()"
      >
        <ShieldAlert class="h-4 w-4" aria-hidden="true" />
        {{ l('打开 Windows 安全中心', 'Open Windows Security') }}
      </button>
    </div>

    <p
      v-else-if="smartAppControlEvaluation"
      class="mt-3 border-l-2 border-warning bg-warning/5 px-3 py-2.5 text-pretty text-[11px] leading-relaxed text-amber-900"
      :class="showStepNumber ? 'sm:ml-10.5' : ''"
    >
      {{ l('智能应用控制处于评估模式。可以继续安装，但 Windows 后续仍可能阻止自签小组件。', 'Smart App Control is in evaluation mode. You can continue, but Windows may still block this self-signed Widget later.') }}
    </p>

    <div
      v-if="codeIntegrityBlocked"
      class="mt-3 border-l-2 border-danger bg-danger/5 px-3 py-2.5 text-[11px] leading-relaxed text-danger"
      :class="showStepNumber ? 'sm:ml-10.5' : ''"
    >
      <p class="text-pretty font-semibold">
        {{ trust?.wdacState === 'enforced' ? l('企业代码完整性策略已阻止小组件', 'Enterprise Code Integrity blocked the Widget') : l('Windows 代码完整性已阻止小组件', 'Windows Code Integrity blocked the Widget') }}
      </p>
      <p class="mt-1 text-pretty">
        {{ trust?.wdacState === 'enforced' ? l('该策略不能由本程序绕过，请联系系统管理员允许发布者 CN=CSMatchHelperDev。', 'This policy cannot be bypassed by the app. Ask your administrator to allow publisher CN=CSMatchHelperDev.') : l('请确认 Smart App Control 已关闭后重试，并复制诊断信息查看拦截事件。', 'Confirm Smart App Control is off, retry, and copy diagnostics for the blocking event.') }}
      </p>
    </div>

    <div class="mt-3 flex flex-wrap gap-2" :class="showStepNumber ? 'sm:pl-10.5' : ''">
      <button
        type="button"
        class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-medium text-white transition-[background-color,transform] duration-200 hover:bg-accent-hover active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="installActionsDisabled || !gameBarInstalled"
        @click="onInstallCtaClick()"
      >
        <Loader2
          v-if="(widgetBusy || widgetConnectionRepairing) && !uninstalling"
          class="h-4 w-4 animate-spin"
          aria-hidden="true"
        />
        <Download v-else-if="!uninstalling" class="h-4 w-4" aria-hidden="true" />
        {{ widgetInstallCtaLabel }}
        <ChevronDown
          v-if="!widgetBusy && !widgetConnectionRepairing"
          class="h-4 w-4 transition-transform duration-200 ease-out"
          :class="showInstallPanel ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
      <button
        v-if="showRedetect"
        type="button"
        class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-[13px] font-medium text-fg-secondary transition-[background-color,border-color,transform] duration-200 hover:bg-elevated active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="widgetStatusRefreshing || widgetBusy || widgetConnectionRepairing || !gameBarInstalled"
        @click="redetectWidget()"
      >
        <RefreshCw
          class="h-4 w-4"
          :class="widgetStatusRefreshing ? 'animate-spin' : ''"
          aria-hidden="true"
        />
        {{ l('重新检测', 'Detect again') }}
      </button>
      <button
        v-if="widgetStatus?.installed"
        type="button"
        class="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-fg-secondary shadow-sm transition-[background-color,border-color,color,transform] duration-200 hover:border-danger/30 hover:bg-danger/8 hover:text-danger active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="actionsDisabled || widgetBusy || widgetConnectionRepairing"
        :aria-label="l('卸载小组件', 'Uninstall Widget')"
        :title="l('卸载小组件', 'Uninstall Widget')"
        @click="uninstallWidget()"
      >
        <Loader2 v-if="uninstalling" class="h-4 w-4 animate-spin" aria-hidden="true" />
        <Trash2 v-else class="h-4 w-4" aria-hidden="true" />
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
        <p class="font-semibold">{{ l('安装进行中，请稍候', 'Installation in progress') }}</p>
        <p class="mt-1">
          {{ l('会弹出安装窗口，完成后会自动关闭。请勿手动关闭。', 'A setup window will open and close automatically when finished. Keep it open.') }}
        </p>
        <p class="mt-1.5">
          {{ l('若中途出现系统提示（例如「资源正在使用」），属于正常现象，耐心等待几分钟即可。', 'Windows may briefly report that a resource is in use. Wait a few minutes while setup retries.') }}
        </p>
      </div>
    </div>

    <div
      v-if="showInstallFailure"
      class="mt-3 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[11px] leading-relaxed text-danger"
      :class="showStepNumber ? 'sm:ml-10.5' : ''"
    >
      <p class="font-medium">{{ l('安装失败', 'Installation failed') }}</p>
      <p v-if="installIssueGuidance" class="mt-1 text-pretty font-medium">{{ installIssueGuidance }}</p>
      <ul
        v-if="blockingPackageLabels.length"
        class="mt-2 list-disc space-y-1 pl-4 text-fg-secondary"
      >
        <li v-for="packageLabel in blockingPackageLabels" :key="packageLabel">
          {{ packageLabel }}
        </li>
      </ul>
      <p class="mt-1 whitespace-pre-wrap">{{ widgetError }}</p>
      <p v-if="widgetIssueCode" class="mt-1 font-mono text-[10px] text-fg-muted">
        {{ widgetIssueCode }} · {{ widgetRequiredAction || '-' }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 text-[11px] font-medium text-fg-secondary underline-offset-2 hover:underline"
          @click="copyDiagnostics()"
        >
          {{ l('复制问题信息', 'Copy diagnostics') }}
        </button>
        <button
          type="button"
          class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 text-[11px] font-medium text-fg-secondary underline-offset-2 hover:underline"
          @click="openWidgetFeedback()"
        >
          {{ l('去反馈', 'Report issue') }}
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
          <p class="mb-3 text-[12px] font-medium text-fg">{{ l('选择下载方式', 'Choose download source') }}</p>
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
                  class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 text-[11px] font-medium text-white transition-[background-color,transform] duration-200 hover:bg-accent-hover active:scale-[0.96] disabled:opacity-50"
                  :disabled="widgetBusy || !source.url"
                  @click.stop="installFromSource(source.id)"
                >
                  {{ l('从此源安装', 'Install from this source') }}
                </button>
                <button
                  type="button"
                  class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-base px-3 text-[11px] font-medium text-fg-secondary transition-[background-color,border-color,transform] duration-200 hover:bg-elevated active:scale-[0.96] disabled:opacity-50"
                  :disabled="widgetBusy"
                  @click.stop="copySourceUrl(source.id)"
                >
                  <Copy class="h-3 w-3" />
                  {{ l('复制下载地址', 'Copy download URL') }}
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
            <p class="text-[12px] font-medium text-fg">{{ l('已经下载好了？', 'Already downloaded it?') }}</p>
            <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
              {{ l('在线安装会自动解压 zip，无需电脑安装解压软件。若你手动下载了 zip 且无法解压，可用其他电脑解压后拷贝文件夹过来。', 'Online setup extracts the zip automatically. You can also select a downloaded zip or an extracted folder.') }}
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-[12px] font-medium text-fg-secondary transition-[background-color,border-color,transform] duration-200 hover:bg-elevated active:scale-[0.96] disabled:opacity-50"
                :disabled="widgetBusy"
                @click="pickLocalPackage()"
              >
                <FolderOpen class="h-4 w-4" />
                {{ l('选择 zip 安装包', 'Select zip package') }}
              </button>
              <button
                type="button"
                class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-[12px] font-medium text-fg-secondary transition-[background-color,border-color,transform] duration-200 hover:bg-elevated active:scale-[0.96] disabled:opacity-50"
                :disabled="widgetBusy"
                @click="pickLocalFolder()"
              >
                <FolderOpen class="h-4 w-4" />
                {{ l('选择已解压文件夹', 'Select extracted folder') }}
              </button>
            </div>
          </div>
          <button
            type="button"
            class="mt-3 min-h-10 w-full cursor-pointer rounded-xl bg-accent/10 px-3 text-[12px] font-semibold text-accent transition-[background-color,transform] duration-200 hover:bg-accent/15 active:scale-[0.96] disabled:opacity-50"
            :disabled="widgetBusy || !downloadSources.length"
            @click="installFromSelectedSource()"
          >
            {{ l('使用所选来源安装', 'Install from selected source') }}
          </button>
        </div>
      </div>
    </div>

    <p
      v-if="!gameBarInstalled"
      class="mt-2 text-[11px] text-warning"
      :class="showStepNumber ? 'sm:pl-10.5' : ''"
    >
      {{ l('请先完成第 1 步', 'Complete step 1 first') }}
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
