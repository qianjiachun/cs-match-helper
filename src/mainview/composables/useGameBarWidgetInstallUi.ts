import type {
  GameBarWidgetDownloadSource,
  GameBarWidgetUpdateCheck,
} from '@core/gamebar-widget/types';
import { computed, ref, type Ref } from 'vue';
import type { ToastVariant } from './useCopyFeedback';
import type { useGameBarWidget } from './useGameBarWidget';

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
      label: '国内 CDN',
      hint: '推荐，国内下载更快',
      url: cdnUrl,
    });
  }
  if (updateCheck.githubDownloadUrl) {
    items.push({
      id: 'github',
      label: 'GitHub 发布页',
      hint: '官方源，适合海外或 CDN 不可用时',
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
    if (widgetDetecting.value) return '正在扫描小组件';
    if (widgetNeedsUpdate.value) return '小组件有可用更新';
    if (widgetReady.value) return '小组件已安装';
    if (!widgetStatus.value?.installed) return '小组件未安装';
    if (!widgetStatus.value?.loopbackConfigured) return '小组件连接未就绪';
    return '小组件未安装';
  });

  const widgetStep2Badge = computed(() => {
    if (widgetDetecting.value) return '检测中';
    if (widgetNeedsUpdate.value) return '可更新';
    if (widgetReady.value) return '已就绪';
    if (!widgetStatus.value?.installed) return '未安装';
    return '待修复';
  });

  const widgetInstallCtaLabel = computed(() => {
    if (!widgetStatus.value?.installed) return '安装小组件';
    if (widgetNeedsUpdate.value) return '更新小组件';
    return '重新安装小组件';
  });

  const installPanelHint = computed(() => {
    if (downloadSources.value.length) return null;
    if (widgetUpdate.value?.error) {
      const base = '在线版本信息暂时获取失败，可稍后重试，或直接选择本地安装包';
      return `${base}（${widgetUpdate.value.error}）`;
    }
    return '暂时还没有可用的下载地址，请稍候或选择本地安装包';
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
      return '正在安装，请保持安装窗口开启；若出现系统提示也请耐心等待，通常几分钟内可完成。';
    }
    if (widgetBusy.value) return '正在安装，请稍候…';
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
      return '正在扫描 Game Bar 与小组件状态';
    }
    if (!widgetStatus.value) return '尚未检测，请点击「重新检测」';
    if (!widgetStatus.value.gameBarInstalled && !options?.gameBarInstalledAssumed) {
      return '请先完成第 1 步：安装 Game Bar';
    }
    if (!widgetStatus.value.installed) {
      return '点击下方「安装小组件」完成安装，装好后点「重新检测」';
    }
    if (!widgetStatus.value.loopbackConfigured) {
      return '已检测到小组件，但本机连接未就绪，请重新安装';
    }
    const version = widgetStatus.value.installedVersion;
    if (widgetNeedsUpdate.value) {
      const latest = widgetUpdate.value?.latestVersion;
      if (version && latest) return `已安装 v${version}，可更新至 v${latest}`;
      if (latest) return `已安装，可更新至 v${latest}`;
      return version ? `已安装 v${version}，发现新版本，建议更新` : '已安装，发现新版本，建议更新';
    }
    return version ? `已安装 v${version}，本机连接正常` : '已安装，本机连接正常';
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
      toast('检测到小组件有更新', 'warning');
      return;
    }
    toast(
      widgetReady.value ? '小组件已就绪' : '尚未检测到小组件',
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
    toast(ok ? `已复制 ${label} 下载链接` : '暂时无法获取下载链接', ok ? 'success' : 'error');
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
    toast('已复制问题信息，方便你反馈或自查');
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
