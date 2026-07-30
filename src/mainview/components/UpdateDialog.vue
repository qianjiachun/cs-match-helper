<script setup lang="ts">
import type { UpdatePhase } from '@core/update/types';
import {
  AlertCircle,
  ArrowRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-vue-next';
import { computed, onMounted, onUnmounted } from 'vue';
import { formatAppVersion, formatBytes } from '../composables/useUpdateCheck';
import { showToast } from '../composables/useCopyFeedback';
import { openExternalUrl } from '../native';
import ReleaseNotesContent from './ReleaseNotesContent.vue';
import { currentLocale, localize as l } from '../i18n';

const props = defineProps<{
  open: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseUrl: string;
  downloadUrl?: string;
  publishedAt?: string;
  phase: UpdatePhase;
  progressPercent: number;
  downloadedBytes: number;
  totalBytes: number;
  downloadError: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  retry: [];
}>();

const formattedCurrentVersion = computed(() => formatAppVersion(props.currentVersion));
const formattedLatestVersion = computed(() => formatAppVersion(props.latestVersion));

const publishedLabel = computed(() => {
  if (!props.publishedAt) return '';
  const date = new Date(props.publishedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(currentLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

/** 不向用户展示 CDN / Lunaris 等内部来源信息 */
const displayDownloadError = computed(() => {
  const raw = props.downloadError?.trim();
  if (!raw) return l('自动下载失败，可使用 GitHub 手动下载', 'Automatic download failed. Download it from GitHub instead.');
  const sanitized = raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/lunaris/gi, '')
    .replace(/\bCDN\b/gi, '')
    .replace(/（\s*可能尚未同步[^）]*）/g, '')
    .replace(/\(\s*可能尚未同步[^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!sanitized || /^下载更新失败[:：]?\s*HTTP/i.test(sanitized)) {
    return l('自动下载失败，请稍后重试或使用 GitHub 手动下载', 'Automatic download failed. Try again later or download it from GitHub.');
  }
  return sanitized;
});

const statusTitle = computed(() => {
  switch (props.phase) {
    case 'checking':
      return l('正在检查更新…', 'Checking for updates…');
    case 'downloading':
      return l('正在下载更新', 'Downloading update');
    case 'verifying':
      return l('正在校验文件', 'Verifying download');
    case 'installing':
      return l('准备重启并应用更新', 'Preparing to restart and update');
    case 'failed':
      return l('自动更新失败', 'Automatic update failed');
    case 'ready':
      return l('即将开始下载', 'Preparing download');
    default:
      return l(`发现新版本 ${formattedLatestVersion.value}`, `Version ${formattedLatestVersion.value} is available`);
  }
});

const statusDescription = computed(() => {
  switch (props.phase) {
    case 'downloading':
      if (props.totalBytes > 0) {
        return l(`已下载 ${formatBytes(props.downloadedBytes)} / ${formatBytes(props.totalBytes)}`, `Downloaded ${formatBytes(props.downloadedBytes)} / ${formatBytes(props.totalBytes)}`);
      }
      return l(`已下载 ${formatBytes(props.downloadedBytes)}`, `Downloaded ${formatBytes(props.downloadedBytes)}`);
    case 'verifying':
      return l('正在验证文件完整性，请稍候…', 'Verifying file integrity…');
    case 'installing':
      return l('应用将自动关闭并重启到新版本', 'The app will close and restart on the new version.');
    case 'failed':
      return displayDownloadError.value;
    case 'ready':
      return l('正在准备下载，请稍候…', 'Preparing the download…');
    default:
      return l('新版本已就绪，将自动完成下载与安装', 'The update is ready and will install automatically.');
  }
});

const showProgress = computed(
  () =>
    props.phase === 'downloading' ||
    props.phase === 'verifying' ||
    props.phase === 'installing' ||
    props.phase === 'ready',
);

const progressValue = computed(() => {
  if (props.phase === 'installing' || props.phase === 'verifying') return 100;
  return Math.round(props.progressPercent);
});

const canClose = computed(() => !props.busy);

const manualDownloadUrl = computed(
  () => props.downloadUrl?.trim() || props.releaseUrl?.trim() || '',
);

const copyDownloadLabel = computed(() =>
  props.downloadUrl?.trim() ? l('复制下载地址', 'Copy download URL') : l('复制发布页链接', 'Copy release URL'),
);

function onBackdropClick(event: MouseEvent) {
  if (!canClose.value) return;
  if (event.target === event.currentTarget) {
    emit('close');
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && canClose.value) {
    emit('close');
  }
}

function openReleasePage() {
  if (!props.releaseUrl) return;
  void openExternalUrl(props.releaseUrl);
}

async function copyDownloadUrl() {
  const url = manualDownloadUrl.value;
  if (!url) {
    showToast(l('暂时无法获取下载链接', 'No download URL is available'), 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast(
      props.downloadUrl?.trim() ? l('已复制下载链接，可在浏览器中打开', 'Download URL copied') : l('已复制 GitHub 发布页链接', 'GitHub release URL copied'),
    );
  } catch {
    showToast(l('复制失败，请重试', 'Could not copy. Try again.'), 'error');
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="update-dialog">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center bg-fg/28 p-4 backdrop-blur-[3px]"
        role="presentation"
        @click="onBackdropClick"
      >
        <div
          class="flex max-h-[min(82vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-fg/8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-dialog-title"
          :aria-busy="busy"
        >
          <header class="relative shrink-0 overflow-hidden border-b border-border-subtle">
            <div
              class="pointer-events-none absolute inset-0 bg-linear-to-br from-accent/10 via-transparent to-warning/6"
              aria-hidden="true"
            />
            <div class="relative flex items-start justify-between gap-4 px-5 pb-4 pt-5">
              <div class="flex min-w-0 gap-3">
                <div
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent shadow-sm"
                >
                  <Loader2
                    v-if="busy"
                    class="h-5 w-5 animate-spin"
                    aria-hidden="true"
                  />
                  <AlertCircle
                    v-else-if="phase === 'failed'"
                    class="h-5 w-5 text-warning"
                    aria-hidden="true"
                  />
                  <Sparkles v-else class="h-5 w-5" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <p class="text-[11px] font-semibold tracking-wide text-accent">
                    {{ phase === 'failed' ? l('更新未完成', 'Update incomplete') : l('新版本可用', 'Update available') }}
                  </p>
                  <h2 id="update-dialog-title" class="mt-0.5 text-[17px] font-semibold tracking-tight text-fg">
                    {{ statusTitle }}
                  </h2>
                  <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span
                      class="inline-flex items-center rounded-full border border-border bg-elevated/80 px-2.5 py-0.5 text-[11px] font-medium text-fg-muted"
                    >
                      {{ l('当前', 'Current') }} {{ formattedCurrentVersion }}
                    </span>
                    <ArrowRight class="h-3.5 w-3.5 shrink-0 text-fg-muted/80" aria-hidden="true" />
                    <span
                      class="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent"
                    >
                      {{ formattedLatestVersion }}
                    </span>
                  </div>
                  <p v-if="publishedLabel" class="mt-2 text-[11px] text-fg-muted">
                    {{ l('发布于', 'Released') }} {{ publishedLabel }}
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                :aria-label="l('关闭', 'Close')"
                :disabled="!canClose"
                @click="emit('close')"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div
            v-if="showProgress || phase === 'failed'"
            class="shrink-0 border-b border-border-subtle bg-elevated/25 px-5 py-4"
          >
            <div v-if="showProgress" class="space-y-2.5">
              <div class="flex items-center justify-between gap-3 text-[12px]">
                <span class="font-medium text-fg-secondary">{{ statusDescription }}</span>
                <span class="tabular-nums text-fg-muted">{{ progressValue }}%</span>
              </div>
              <div
                class="h-2 overflow-hidden rounded-full bg-elevated"
                role="progressbar"
                :aria-valuenow="progressValue"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="statusTitle"
              >
                <div
                  class="h-full rounded-full bg-linear-to-r from-accent to-accent-hover transition-[width] duration-300 ease-out"
                  :class="{ 'animate-pulse': phase === 'installing' || phase === 'verifying' }"
                  :style="{ width: `${progressValue}%` }"
                />
              </div>
            </div>

            <div
              v-else-if="phase === 'failed'"
              class="rounded-xl border border-warning/25 bg-warning/8 px-3.5 py-3"
            >
              <p class="text-[12px] leading-relaxed text-fg-secondary">
                {{ statusDescription }}
              </p>
              <p class="mt-1.5 text-[11px] text-fg-muted">
                {{ l('已自动切换为 GitHub 手动下载方案，不影响当前版本继续使用。', 'Use the GitHub download instead. You can keep using the current version.') }}
              </p>
            </div>
          </div>

          <div class="update-dialog-scroll relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div class="mb-3 flex items-center gap-2">
              <span
                class="inline-flex h-6 w-6 items-center justify-center rounded-md bg-elevated text-fg-muted"
              >
                <FileText class="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <p class="text-[12px] font-semibold text-fg">{{ l('更新内容', 'What’s new') }}</p>
            </div>
            <ReleaseNotesContent v-if="releaseNotes.trim()" :content="releaseNotes" />
            <div
              v-else
              class="rounded-xl border border-dashed border-border bg-elevated/50 px-4 py-8 text-center"
            >
              <p class="text-[13px] text-fg-muted">{{ l('暂无详细更新说明', 'No detailed release notes') }}</p>
              <p class="mt-1 text-[12px] text-fg-muted/80">{{ l('可前往 Release 页面查看完整 changelog', 'Open the release page for the full changelog.') }}</p>
            </div>
          </div>

          <footer class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-elevated/35 px-5 py-4">
            <button
              v-if="phase === 'failed'"
              type="button"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="emit('retry')"
            >
              <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
              {{ l('重试自动下载', 'Retry download') }}
            </button>
            <button
              v-if="manualDownloadUrl"
              type="button"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="copyDownloadUrl()"
            >
              <Copy class="h-3.5 w-3.5" aria-hidden="true" />
              {{ copyDownloadLabel }}
            </button>
            <button
              v-if="canClose"
              type="button"
              class="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="emit('close')"
            >
              {{ phase === 'failed' ? l('稍后', 'Later') : l('后台继续', 'Continue in background') }}
            </button>
            <button
              v-if="phase === 'failed'"
              type="button"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-accent/20 transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!releaseUrl"
              @click="openReleasePage"
            >
              <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
              {{ l('打开 GitHub 下载', 'Download from GitHub') }}
            </button>
            <div
              v-else-if="busy"
              class="inline-flex items-center gap-1.5 rounded-lg bg-accent/15 px-3.5 py-2.5 text-[13px] font-semibold text-accent"
            >
              <Download class="h-3.5 w-3.5" aria-hidden="true" />
              {{ l('自动更新中…', 'Updating automatically…') }}
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.update-dialog-scroll {
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-fg-muted) 45%, transparent) transparent;
}

.update-dialog-scroll::-webkit-scrollbar {
  width: 6px;
}

.update-dialog-scroll::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-fg-muted) 35%, transparent);
}

.update-dialog-enter-active,
.update-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.update-dialog-enter-active > div,
.update-dialog-leave-active > div {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.update-dialog-enter-from,
.update-dialog-leave-to {
  opacity: 0;
}

.update-dialog-enter-from > div,
.update-dialog-leave-to > div {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
