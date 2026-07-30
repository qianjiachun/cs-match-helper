import type {
  GameBarWidgetDownloadSource,
  GameBarWidgetUpdateCheck,
} from '@core/gamebar-widget/types';
import { computed, ref, type Ref } from 'vue';
import type { ToastVariant } from './useCopyFeedback';
import type { useGameBarWidget } from './useGameBarWidget';
import { localize as l } from '../i18n';

type GameBarWidgetApi = ReturnType<typeof useGameBarWidget>;

export function buildDownloadSources(updateCheck: GameBarWidgetUpdateCheck | null) {
  if (!updateCheck) return [];
  const items: Array<{
    id: GameBarWidgetDownloadSource;
    label: string;
    hint: string;
    url: string | null;
  }> = [];
  const cdnUrl = updateCheck.cdnDownloadUrl ?? updateCheck.downloadUrl;
  if (cdnUrl) {
    items.push({
      id: 'cdn',
      label: l('国内 CDN', 'Mainland China CDN'),
      hint: l('推荐，国内下载更快', 'Recommended for faster downloads in mainland China'),
      url: cdnUrl,
    });
  }
  if (updateCheck.githubDownloadUrl) {
    items.push({
      id: 'github',
      label: l('GitHub 发布页', 'GitHub release'),
      hint: l('官方源，适合海外或 CDN 不可用时', 'Official source for other regions or when the CDN is unavailable'),
      url: updateCheck.githubDownloadUrl,
    });
  }
  return items;
}

export function useGameBarWidgetInstallUi(
  widget: GameBarWidgetApi,
  options?: {
    defaultInstallPanelOpen?: boolean;
    gameBarInstalledAssumed?: boolean;
    actionsDisabled?: Ref<boolean>;
    onToast?: (message: string, variant?: ToastVariant) => void;
  },
) {
  const showInstallPanel = ref(options?.defaultInstallPanelOpen ?? false);
  const selectedInstallSource = ref<GameBarWidgetDownloadSource>('cdn');

  const widgetStatus = widget.status;
  const widgetUpdate = widget.updateCheck;
  const widgetBusy = widget.busy;
  const widgetStatusRefreshing = widget.statusRefreshing;
  const widgetDetecting = widget.isDetecting;
  const widgetError = widget.error;
  const widgetPhase = widget.phase;
  const widgetProgress = widget.progress;
  const widgetLastMessage = widget.lastMessage;

  const gameBarInstalled = computed(
    () =>
      options?.gameBarInstalledAssumed === true ||
      Boolean(widgetStatus.value?.gameBarInstalled),
  );

  const downloadSources = computed(() => buildDownloadSources(widgetUpdate.value));

  const widgetReady = computed(
    () =>
      Boolean(widgetStatus.value?.gameBarInstalled) &&
      Boolean(widgetStatus.value?.installed) &&
      Boolean(widgetStatus.value?.loopbackConfigured),
  );

  const widgetNeedsUpdate = computed(
    () => Boolean(widgetStatus.value?.installed) && Boolean(widgetUpdate.value?.hasUpdate),
  );

  const widgetSetupStep = computed(() => {
    if (!widgetStatus.value?.gameBarInstalled && !options?.gameBarInstalledAssumed) return 1;
    if (!widgetReady.value || widgetNeedsUpdate.value) return 2;
    return 3;
  });

  const widgetStep2Title = computed(() => {
    if (widgetDetecting.value) return l('正在扫描小组件', 'Detecting Widget');
    if (widgetNeedsUpdate.value) return l('小组件有可用更新', 'Widget update available');
    if (widgetReady.value) return l('小组件已安装', 'Widget installed');
    if (!widgetStatus.value?.installed) return l('小组件未安装', 'Widget not installed');
    if (!widgetStatus.value?.loopbackConfigured) return l('小组件连接未就绪', 'Widget connection not ready');
    return l('小组件未安装', 'Widget not installed');
  });

  const widgetStep2Badge = computed(() => {
    if (widgetDetecting.value) return l('检测中', 'Detecting');
    if (widgetNeedsUpdate.value) return l('可更新', 'Update');
    if (widgetReady.value) return l('已就绪', 'Ready');
    if (!widgetStatus.value?.installed) return l('未安装', 'Not installed');
    return l('待修复', 'Repair needed');
  });

  const widgetInstallCtaLabel = computed(() => {
    if (!widgetStatus.value?.installed) return l('安装小组件', 'Install Widget');
    if (widgetNeedsUpdate.value) return l('更新小组件', 'Update Widget');
    return l('重新安装小组件', 'Reinstall Widget');
  });

  const installPanelHint = computed(() => {
    if (downloadSources.value.length) return null;
    if (widgetUpdate.value?.error) {
      const base = l('在线版本信息暂时获取失败，可稍后重试，或直接选择本地安装包', 'Could not load online version details. Retry later or select a local package.');
      return l(
        `${base}（${widgetUpdate.value.error}）`,
        `${base} (${widgetUpdate.value.error})`,
      );
    }
    return l('暂时还没有可用的下载地址，请稍候或选择本地安装包', 'No download URL is available yet. Wait or select a local package.');
  });

  const showInstallWaitingHint = computed(
    () =>
      widgetBusy.value &&
      (widgetPhase.value === 'installing' || widgetProgress.value?.phase === 'installing'),
  );

  const widgetProgressLabel = computed(() => {
    if (widgetBusy.value && widgetProgress.value?.message) return widgetProgress.value.message;
    if (widgetBusy.value && widgetProgress.value) {
      return widget.formatWidgetProgressMessage(widgetProgress.value);
    }
    if (widgetBusy.value && widgetPhase.value === 'installing') {
      return l('正在安装，请保持安装窗口开启；若出现系统提示也请耐心等待，通常几分钟内可完成。', 'Installing. Keep the setup window open; this normally takes a few minutes.');
    }
    if (widgetBusy.value) return l('正在安装，请稍候…', 'Installing…');
    if (widgetPhase.value === 'complete' && widgetLastMessage.value) return widgetLastMessage.value;
    return null;
  });

  const showInstallFailure = computed(
    () => Boolean(widgetError.value) && !widgetBusy.value && widgetPhase.value === 'error',
  );

  const showWidgetActivity = computed(
    () => widgetBusy.value || Boolean(widgetProgressLabel.value),
  );

  const widgetDetectHint = computed(() => {
    if (widgetDetecting.value) {
      return l('正在扫描 Game Bar 与小组件状态', 'Checking Game Bar and Widget status');
    }
    if (!widgetStatus.value) return l('尚未检测，请点击「重新检测」', 'Not checked yet. Select “Detect again”.');
    if (!widgetStatus.value.gameBarInstalled && !options?.gameBarInstalledAssumed) {
      return l('请先完成第 1 步：安装 Game Bar', 'Complete step 1: install Game Bar');
    }
    if (!widgetStatus.value.installed) {
      return l('点击下方「安装小组件」完成安装，装好后点「重新检测」', 'Select “Install Widget”, then detect it again after setup.');
    }
    if (!widgetStatus.value.loopbackConfigured) {
      return l('已检测到小组件，但本机连接未就绪，请重新安装', 'The Widget is installed but its local connection is unavailable. Reinstall it.');
    }
    const version = widgetStatus.value.installedVersion;
    if (widgetNeedsUpdate.value) {
      const latest = widgetUpdate.value?.latestVersion;
      if (version && latest) return l(`已安装 v${version}，可更新至 v${latest}`, `v${version} installed; v${latest} is available`);
      if (latest) return l(`已安装，可更新至 v${latest}`, `Installed; v${latest} is available`);
      return version ? l(`已安装 v${version}，发现新版本，建议更新`, `v${version} installed; an update is available`) : l('已安装，发现新版本，建议更新', 'Installed; an update is available');
    }
    return version ? l(`已安装 v${version}，本机连接正常`, `v${version} installed and connected`) : l('已安装，本机连接正常', 'Installed and connected');
  });

  const installActionsDisabled = computed(
    () => Boolean(options?.actionsDisabled?.value) || widgetBusy.value,
  );

  function toast(message: string, variant: ToastVariant = 'success') {
    options?.onToast?.(message, variant);
  }

  async function redetectWidget() {
    await Promise.all([widget.refreshStatus(), widget.checkUpdate({ silent: true })]);
    if (widgetNeedsUpdate.value) {
      toast(l('检测到小组件有更新', 'A Widget update is available'), 'warning');
      return;
    }
    toast(
      widgetReady.value ? l('小组件已就绪', 'Widget is ready') : l('尚未检测到小组件', 'Widget not detected'),
      widgetReady.value ? 'success' : 'warning',
    );
  }

  function ensureSelectedSource() {
    if (
      downloadSources.value.length &&
      !downloadSources.value.some((s) => s.id === selectedInstallSource.value)
    ) {
      selectedInstallSource.value = downloadSources.value[0].id;
    }
  }

  function toggleInstallPanel() {
    if (widgetBusy.value) return;
    if (!showInstallPanel.value && !gameBarInstalled.value) return;
    if (!showInstallPanel.value) ensureSelectedSource();
    showInstallPanel.value = !showInstallPanel.value;
  }

  function openInstallPanel() {
    if (!gameBarInstalled.value || showInstallPanel.value) return;
    ensureSelectedSource();
    showInstallPanel.value = true;
  }

  function onInstallCtaClick() {
    if (showInstallPanel.value || !showInstallFailure.value) {
      toggleInstallPanel();
      return;
    }
    openInstallPanel();
  }

  async function installFromSelectedSource() {
    const success = await widget.installOrUpdate(selectedInstallSource.value);
    if (success) showInstallPanel.value = false;
    if (success) await widget.refreshStatus();
  }

  async function installFromSource(source: GameBarWidgetDownloadSource) {
    selectedInstallSource.value = source;
    const success = await widget.installOrUpdate(source);
    if (success) showInstallPanel.value = false;
    if (success) await widget.refreshStatus();
  }

  async function copySourceUrl(source: GameBarWidgetDownloadSource) {
    const ok = await widget.copyDownloadUrl(source);
    const label = source === 'cdn' ? 'CDN' : 'GitHub';
    toast(ok ? l(`已复制 ${label} 下载链接`, `${label} download URL copied`) : l('暂时无法获取下载链接', 'No download URL is available'), ok ? 'success' : 'error');
  }

  async function pickLocalPackage() {
    const ok = await widget.pickAndInstallFromLocal();
    if (ok) {
      showInstallPanel.value = false;
      await widget.refreshStatus();
    }
  }

  async function pickLocalFolder() {
    const ok = await widget.pickAndInstallFromLocalFolder();
    if (ok) {
      showInstallPanel.value = false;
      await widget.refreshStatus();
    }
  }

  async function copyDiagnostics() {
    await widget.copyDiagnostics();
    toast(l('已复制问题信息，方便你反馈或自查', 'Diagnostics copied'));
  }

  return {
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
    widgetNeedsUpdate,
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
  };
}
