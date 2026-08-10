import {
  isGameBarWidgetReady,
  type GameBarWidgetDownloadSource,
  type GameBarWidgetUpdateCheck,
} from '@core/gamebar-widget/types';
import { confirm } from '@tauri-apps/plugin-dialog';
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

export function formatBlockingPackageLabel(packageFullName: string) {
  const identity = packageFullName.split('_')[0] || packageFullName;
  const normalized = identity.toLowerCase();
  if (normalized.includes('armourycrate')) return 'Armoury Crate';
  if (normalized.includes('desktopappinstaller')) return l('应用安装程序', 'App Installer');
  if (normalized.includes('screensketch')) return l('截图工具', 'Snipping Tool');
  if (normalized.includes('widgetsplatformruntime')) return l('Windows 小组件平台', 'Windows Widgets Platform');
  if (normalized.includes('webexperience')) return l('Windows Web 体验', 'Windows Web Experience');
  if (normalized.includes('intelarcsoftware')) return 'Intel Arc Software';
  return identity;
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
  const uninstalling = ref(false);

  const widgetStatus = widget.status;
  const widgetUpdate = widget.updateCheck;
  const widgetBusy = widget.busy;
  const widgetConnectionRepairing = widget.connectionRepairing;
  const widgetStatusRefreshing = widget.statusRefreshing;
  const widgetDetecting = widget.isDetecting;
  const widgetError = widget.error;
  const widgetPhase = widget.phase;
  const widgetProgress = widget.progress;
  const widgetLastMessage = widget.lastMessage;
  const widgetIssueCode = widget.installIssueCode;
  const widgetRequiredAction = widget.installRequiredAction;
  const blockingPackageLabels = computed(() => [
    ...new Set(widget.installBlockingPackages.value.map(formatBlockingPackageLabel)),
  ]);

  const trust = computed(() => widgetStatus.value?.trust ?? null);
  const smartAppControlOn = computed(() => trust.value?.smartAppControlState === 'on');
  const smartAppControlEvaluation = computed(() => trust.value?.smartAppControlState === 'evaluation');
  const codeIntegrityBlocked = computed(() => trust.value?.runtimeState === 'blockedByCodeIntegrity');

  const gameBarInstalled = computed(
    () =>
      options?.gameBarInstalledAssumed === true ||
      Boolean(widgetStatus.value?.gameBarInstalled),
  );

  const downloadSources = computed(() => buildDownloadSources(widgetUpdate.value));

  const widgetReady = computed(() =>
    isGameBarWidgetReady(widgetStatus.value, widget.connectionStatus.value),
  );

  const loopbackNeedsRepair = computed(
    () =>
      Boolean(widgetStatus.value?.installed) &&
      widgetStatus.value?.loopbackState === 'missing' &&
      widget.connectionStatus.value?.lastConnectedAt == null,
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
    if (smartAppControlOn.value) return l('智能应用控制阻止安装', 'Smart App Control blocks setup');
    if (codeIntegrityBlocked.value) return l('小组件被代码完整性阻止', 'Widget blocked by Code Integrity');
    if (widgetNeedsUpdate.value) return l('小组件有可用更新', 'Widget update available');
    if (widgetReady.value) return l('小组件已安装', 'Widget installed');
    if (!widgetStatus.value?.installed) return l('小组件未安装', 'Widget not installed');
    if (loopbackNeedsRepair.value) return l('小组件已安装', 'Widget installed');
    return l('小组件需要修复', 'Widget needs repair');
  });

  const widgetStep2Badge = computed(() => {
    if (widgetDetecting.value) return l('检测中', 'Detecting');
    if (smartAppControlOn.value) return l('需关闭 SAC', 'SAC must be off');
    if (codeIntegrityBlocked.value) return l('已阻止', 'Blocked');
    if (widgetNeedsUpdate.value) return l('可更新', 'Update');
    if (widgetReady.value) return l('已就绪', 'Ready');
    if (!widgetStatus.value?.installed) return l('未安装', 'Not installed');
    if (loopbackNeedsRepair.value) return l('待自动修复', 'Auto-repair pending');
    return l('已安装', 'Installed');
  });

  const widgetInstallCtaLabel = computed(() => {
    if (!widgetStatus.value?.installed) return l('安装小组件', 'Install Widget');
    if (widgetNeedsUpdate.value) return l('更新小组件', 'Update Widget');
    if (loopbackNeedsRepair.value) return l('修复连接', 'Repair connection');
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

  const installIssueGuidance = computed(() => {
    switch (widgetIssueCode.value) {
      case 'certificateTrustFailed':
        return l('证书未能在 LocalMachine\\TrustedPeople 建立信任（0x800B010A）。安装器没有删除旧 Widget；若重试仍失败，设备可能受企业证书策略限制。', 'The certificate could not establish trust in LocalMachine\\TrustedPeople (0x800B010A). The installer kept the old Widget; repeated failure usually indicates an enterprise certificate policy.');
      case 'packageValidationFailed':
        return l('CER、MSIX、catalog 或文件哈希不一致。请重新下载完整 ZIP，不要混用旧文件。', 'The CER, MSIX, catalog, or file hashes do not match. Download the complete ZIP again and do not mix files from older releases.');
      case 'enterprisePolicyBlocked':
      case 'codeIntegrityBlocked':
        return l('企业代码完整性策略不允许此自签发布者。程序不会修改或绕过该策略，请联系系统管理员。', 'Enterprise Code Integrity does not allow this self-signed publisher. The app will not modify or bypass that policy; contact your administrator.');
      case 'smartAppControlOn':
        return l('请先手动关闭 Smart App Control，再返回重新检测。', 'Turn off Smart App Control manually, then return and detect again.');
      case 'dependencyInUse':
        return l('Windows 检测到共享运行库仍被其他应用占用，自动关闭重试也未能释放。请关闭下列应用后重试；若仍失败，请重启电脑并优先安装小组件。', 'Other apps are still using the shared runtime after the automatic retry. Close the apps below and retry. If it still fails, restart Windows and install the Widget before opening other apps.');
      case 'installDiagnosticsUnavailable':
        return l('安装诊断目录不可用。原始错误已尽量保留在安装包装日志中，请检查日志路径后重试。', 'The setup diagnostics directory is unavailable. The original error was preserved in the wrapper log when possible; check that log path and retry.');
      case 'loopbackRepairFailed':
        return l('本机连接自动修复未能通过复核。请先重试；持续失败时再重新安装小组件。', 'Automatic local connection repair could not be verified. Retry first; reinstall only if it keeps failing.');
      default:
        return null;
    }
  });

  const showInstallWaitingHint = computed(
    () =>
      widgetBusy.value &&
      (widgetPhase.value === 'installing' || widgetProgress.value?.phase === 'installing'),
  );

  const widgetProgressLabel = computed(() => {
    if (widgetConnectionRepairing.value) {
      return l('正在请求管理员权限并自动修复本机连接…', 'Requesting administrator access and repairing the local connection…');
    }
    if (widgetBusy.value && widgetProgress.value?.message) return widgetProgress.value.message;
    if (widgetBusy.value && widgetProgress.value) {
      return widget.formatWidgetProgressMessage(widgetProgress.value);
    }
    if (widgetBusy.value && widgetPhase.value === 'uninstalling') {
      return l('正在卸载小组件并清理信任配置…', 'Uninstalling the Widget and removing its trust configuration…');
    }
    if (widgetBusy.value && widgetPhase.value === 'installing') {
      return l('正在安装，请保持安装窗口开启；若出现系统提示也请耐心等待，通常几分钟内可完成。', 'Installing. Keep the setup window open; this normally takes a few minutes.');
    }
    if (widgetBusy.value) return l('正在处理，请稍候…', 'Working…');
    if (widgetPhase.value === 'complete' && widgetLastMessage.value) return widgetLastMessage.value;
    return null;
  });

  const showInstallFailure = computed(
    () => Boolean(widgetError.value) && !widgetBusy.value && widgetPhase.value === 'error',
  );

  const showWidgetActivity = computed(
    () => widgetBusy.value || widgetConnectionRepairing.value || Boolean(widgetProgressLabel.value),
  );

  const widgetDetectHint = computed(() => {
    if (widgetDetecting.value) {
      return l('正在扫描 Game Bar 与小组件状态', 'Checking Game Bar and Widget status');
    }
    if (!widgetStatus.value) return l('尚未检测，请点击「重新检测」', 'Not checked yet. Select “Detect again”.');
    if (!widgetStatus.value.gameBarInstalled && !options?.gameBarInstalledAssumed) {
      return l('请先完成第 1 步：安装 Game Bar', 'Complete step 1: install Game Bar');
    }
    if (smartAppControlOn.value) {
      return widgetStatus.value.installed
        ? l('智能应用控制已开启，现有自签小组件也可能无法启动。使用期间必须保持关闭。', 'Smart App Control is on and may block the installed self-signed Widget. It must remain off while in use.')
        : l('智能应用控制已开启，自签小组件无法安装。请在 Windows 安全中心手动关闭，返回后重新检测。', 'Smart App Control is on, so this self-signed Widget cannot be installed. Turn it off manually in Windows Security, then detect again.');
    }
    if (!widgetStatus.value.installed) {
      return l('点击下方「安装小组件」完成安装', 'Select “Install Widget” to complete setup.');
    }
    const version = widgetStatus.value.installedVersion;
    if (codeIntegrityBlocked.value) {
      return trust.value?.wdacState === 'enforced'
        ? l('企业代码完整性策略已阻止小组件，需要系统管理员允许此发布者。', 'An enforced enterprise Code Integrity policy blocked the Widget. Ask your administrator to allow this publisher.')
        : l('Windows 代码完整性已阻止小组件，请复制诊断信息查看事件详情。', 'Windows Code Integrity blocked the Widget. Copy diagnostics for event details.');
    }
    if (!trust.value?.trustedPeople || trust.value.msixStatus !== 'Valid' || trust.value.catalogStatus !== 'Valid') {
      return l('小组件已安装，但签名或证书信任未就绪，请重新安装。', 'The Widget is installed, but its signature or certificate trust is not ready. Reinstall it.');
    }
    if (loopbackNeedsRepair.value) {
      return l('小组件已安装；开始记录时会自动修复本机连接，也可以现在点击「修复连接」。', 'The Widget is installed. Local connection repair runs automatically when recording starts, or select “Repair connection” now.');
    }
    if (widgetStatus.value.loopbackState === 'unknown') {
      return l('小组件已安装，暂时无法读取本机连接配置；程序不会因此误判为安装失败。', 'The Widget is installed, but the local connection setting could not be read. This is not treated as an installation failure.');
    }
    if (widgetNeedsUpdate.value) {
      const latest = widgetUpdate.value?.latestVersion;
      if (version && latest) return l(`已安装 v${version}，可更新至 v${latest}`, `v${version} installed; v${latest} is available`);
      if (latest) return l(`已安装，可更新至 v${latest}`, `Installed; v${latest} is available`);
      return version ? l(`已安装 v${version}，发现新版本，建议更新`, `v${version} installed; an update is available`) : l('已安装，发现新版本，建议更新', 'Installed; an update is available');
    }
    return version ? l(`已安装 v${version}，本机连接正常`, `v${version} installed and connected`) : l('已安装，本机连接正常', 'Installed and connected');
  });

  const installActionsDisabled = computed(
    () =>
      Boolean(options?.actionsDisabled?.value) ||
      widgetBusy.value ||
      widget.connectionRepairing.value ||
      smartAppControlOn.value,
  );

  function toast(message: string, variant: ToastVariant = 'success') {
    options?.onToast?.(message, variant);
  }

  async function redetectWidget() {
    await Promise.all([widget.refreshStatus(), widget.checkUpdate({ silent: true })]);
    if (smartAppControlOn.value) {
      toast(l('智能应用控制仍处于开启状态', 'Smart App Control is still on'), 'warning');
      return;
    }
    if (widgetNeedsUpdate.value) {
      toast(l('检测到小组件有更新', 'A Widget update is available'), 'warning');
      return;
    }
    const message = widgetReady.value
      ? l('小组件已就绪', 'Widget is ready')
      : l('尚未检测到可用的小组件', 'No usable Widget was detected');
    toast(message, widgetReady.value ? 'success' : 'warning');
  }

  async function openSmartAppControlSettings() {
    await widget.openSmartAppControl();
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

  async function onInstallCtaClick() {
    if (loopbackNeedsRepair.value && !widgetNeedsUpdate.value) {
      const repaired = await widget.repairConnection();
      toast(
        repaired
          ? l('小组件连接已自动修复', 'Widget connection repaired automatically')
          : l('自动修复未完成，请查看当前提示', 'Automatic repair did not complete. Review the current guidance.'),
        repaired ? 'success' : 'warning',
      );
      return;
    }
    if (showInstallPanel.value || !showInstallFailure.value) {
      toggleInstallPanel();
      return;
    }
    openInstallPanel();
  }

  async function installFromSelectedSource() {
    const success = await widget.installOrUpdate(selectedInstallSource.value);
    if (success) showInstallPanel.value = false;
  }

  async function installFromSource(source: GameBarWidgetDownloadSource) {
    selectedInstallSource.value = source;
    const success = await widget.installOrUpdate(source);
    if (success) showInstallPanel.value = false;
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
    }
  }

  async function pickLocalFolder() {
    const ok = await widget.pickAndInstallFromLocalFolder();
    if (ok) {
      showInstallPanel.value = false;
    }
  }

  async function uninstallWidget() {
    const approved = await confirm(
      l(
        '将卸载小组件，并清理本机连接、运行诊断记录以及 LocalMachine\\TrustedPeople 中对应的固定证书。',
        'This removes the Widget, its local connection, runtime diagnostic data, and the matching certificate from LocalMachine\\TrustedPeople.',
      ),
      {
        title: l('卸载 CS 匹配助手小组件？', 'Uninstall CS Match Helper Widget?'),
        kind: 'warning',
      },
    );
    if (!approved) return;

    uninstalling.value = true;
    try {
      const success = await widget.uninstall();
      if (success) {
        showInstallPanel.value = false;
        await widget.checkUpdate({ silent: true });
        toast(l('小组件及其信任配置已清理', 'Widget and its trust configuration were removed'));
      } else {
        toast(l('小组件卸载失败，请查看当前提示', 'Could not uninstall the Widget. Review the current guidance.'), 'error');
      }
    } finally {
      uninstalling.value = false;
    }
  }

  async function copyDiagnostics() {
    await widget.copyDiagnostics();
    toast(l('已复制问题信息，方便你反馈或自查', 'Diagnostics copied'));
  }

  return {
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
  };
}
