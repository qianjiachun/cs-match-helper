<script setup lang="ts">
import { ExternalLink, X } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted } from 'vue';
import { formatAppVersion } from '../composables/useUpdateCheck';
import { openExternalUrl } from '../native';

const props = defineProps<{
  open: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const formattedCurrentVersion = computed(() => formatAppVersion(props.currentVersion));
const formattedLatestVersion = computed(() => formatAppVersion(props.latestVersion));

const publishedLabel = computed(() => {
  if (!props.publishedAt) return '';
  const date = new Date(props.publishedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('close');
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close');
  }
}

function openReleasePage() {
  if (!props.releaseUrl) return;
  void openExternalUrl(props.releaseUrl);
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
        class="fixed inset-0 z-200 flex items-center justify-center bg-fg/25 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click="onBackdropClick"
      >
        <div
          class="flex max-h-[min(80vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-dialog-title"
        >
          <div class="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
            <div class="min-w-0">
              <h2 id="update-dialog-title" class="text-[16px] font-semibold text-fg">
                发现新版本 {{ formattedLatestVersion }}
              </h2>
              <p class="mt-1 text-[12px] text-fg-muted">
                当前版本 {{ formattedCurrentVersion }}
                <template v-if="publishedLabel"> · 发布于 {{ publishedLabel }}</template>
              </p>
            </div>
            <button
              type="button"
              class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg"
              aria-label="关闭"
              @click="emit('close')"
            >
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p class="mb-2 text-[12px] font-medium text-fg-secondary">更新内容</p>
            <div
              v-if="releaseNotes.trim()"
              class="whitespace-pre-wrap rounded-xl border border-border-subtle bg-elevated/60 px-4 py-3 text-[13px] leading-6 text-fg-secondary"
            >
              {{ releaseNotes }}
            </div>
            <p v-else class="text-[13px] text-fg-muted">暂无详细更新说明，可前往 Release 页面查看。</p>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-4">
            <button
              type="button"
              class="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="emit('close')"
            >
              稍后
            </button>
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
              :disabled="!releaseUrl"
              @click="openReleasePage"
            >
              前往下载
              <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
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
