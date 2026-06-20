<script setup lang="ts">
import { ArrowRight, Download, FileText, Sparkles, X } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted } from 'vue';
import { formatAppVersion } from '../composables/useUpdateCheck';
import { openExternalUrl } from '../native';
import ReleaseNotesContent from './ReleaseNotesContent.vue';

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
        class="fixed inset-0 z-200 flex items-center justify-center bg-fg/28 p-4 backdrop-blur-[3px]"
        role="presentation"
        @click="onBackdropClick"
      >
        <div
          class="flex max-h-[min(82vh,600px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-fg/8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-dialog-title"
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
                  <Sparkles class="h-5 w-5" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <p class="text-[11px] font-semibold tracking-wide text-accent">新版本可用</p>
                  <h2 id="update-dialog-title" class="mt-0.5 text-[17px] font-semibold tracking-tight text-fg">
                    发现新版本 {{ formattedLatestVersion }}
                  </h2>
                  <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span
                      class="inline-flex items-center rounded-full border border-border bg-elevated/80 px-2.5 py-0.5 text-[11px] font-medium text-fg-muted"
                    >
                      当前 {{ formattedCurrentVersion }}
                    </span>
                    <ArrowRight class="h-3.5 w-3.5 shrink-0 text-fg-muted/80" aria-hidden="true" />
                    <span
                      class="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent"
                    >
                      {{ formattedLatestVersion }}
                    </span>
                  </div>
                  <p v-if="publishedLabel" class="mt-2 text-[11px] text-fg-muted">
                    发布于 {{ publishedLabel }}
                  </p>
                </div>
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
          </header>

          <div class="update-dialog-scroll relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div class="mb-3 flex items-center gap-2">
              <span
                class="inline-flex h-6 w-6 items-center justify-center rounded-md bg-elevated text-fg-muted"
              >
                <FileText class="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <p class="text-[12px] font-semibold text-fg">更新内容</p>
            </div>
            <ReleaseNotesContent v-if="releaseNotes.trim()" :content="releaseNotes" />
            <div
              v-else
              class="rounded-xl border border-dashed border-border bg-elevated/50 px-4 py-8 text-center"
            >
              <p class="text-[13px] text-fg-muted">暂无详细更新说明</p>
              <p class="mt-1 text-[12px] text-fg-muted/80">可前往 Release 页面查看完整 changelog</p>
            </div>
          </div>

          <footer class="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle bg-elevated/35 px-5 py-4">
            <button
              type="button"
              class="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="emit('close')"
            >
              稍后
            </button>
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-accent/20 transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!releaseUrl"
              @click="openReleasePage"
            >
              <Download class="h-3.5 w-3.5" aria-hidden="true" />
              前往下载
            </button>
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

@media (prefers-reduced-motion: reduce) {
  .update-dialog-enter-active,
  .update-dialog-leave-active,
  .update-dialog-enter-active > div,
  .update-dialog-leave-active > div {
    transition: none;
  }

  .update-dialog-enter-from > div,
  .update-dialog-leave-to > div {
    transform: none;
  }
}
</style>
