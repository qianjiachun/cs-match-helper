<script setup lang="ts">
import { AlertCircle, ChevronDown, ExternalLink, Loader2, RefreshCw } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import { formatChangelogDate, normalizeVersion } from '@core/update/changelog';
import { useChangelog } from '../../composables/useChangelog';
import { formatAppVersion, useUpdateCheck } from '../../composables/useUpdateCheck';
import { openExternalUrl } from '../../native';
import ReleaseNotesContent from '../ReleaseNotesContent.vue';

const { formattedVersion, ensureVersion } = useUpdateCheck();
const {
  releases,
  listLoading,
  listError,
  loadList,
  loadDetail,
  getDetailState,
} = useChangelog();

const currentVersionNorm = computed(() => normalizeVersion(formattedVersion.value.replace(/^v/i, '')));
const expanded = ref<Record<string, boolean>>({});
let didInitExpand = false;

function isCurrentVersion(tagName: string): boolean {
  if (!currentVersionNorm.value) return false;
  return normalizeVersion(tagName) === currentVersionNorm.value;
}

function findCurrentReleaseTag(): string | undefined {
  return releases.value.find((entry) => isCurrentVersion(entry.tagName))?.tagName;
}

function initExpandedForCurrent() {
  const currentTag = findCurrentReleaseTag();
  if (!currentTag) return;
  if (expanded.value[currentTag]) return;
  expanded.value = { ...expanded.value, [currentTag]: true };
  void loadDetail(currentTag);
}

watch(
  [releases, currentVersionNorm],
  () => {
    if (didInitExpand || !releases.value.length) return;
    initExpandedForCurrent();
    if (findCurrentReleaseTag()) didInitExpand = true;
  },
  { immediate: true },
);

async function toggle(tagName: string) {
  const next = !expanded.value[tagName];
  expanded.value = { ...expanded.value, [tagName]: next };
  if (next) {
    await loadDetail(tagName);
  }
}

function detailError(tagName: string): string {
  const state = getDetailState(tagName);
  return state.status === 'error' ? state.message : '';
}

function detailBody(tagName: string): string {
  const state = getDetailState(tagName);
  return state.status === 'ready' ? state.body : '';
}

async function retryDetail(tagName: string) {
  await loadDetail(tagName, { force: true });
}

onMounted(() => {
  void ensureVersion();
  void loadList();
});

function openRelease(url?: string) {
  if (!url) return;
  void openExternalUrl(url);
}
</script>

<template>
  <div class="space-y-3">
    <!-- 列表加载 -->
    <div v-if="listLoading" class="space-y-3" role="status" aria-label="正在加载版本列表">
      <div
        v-for="index in 4"
        :key="`changelog-skeleton-${index}`"
        class="overflow-hidden rounded-2xl border border-border bg-surface p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="h-4 w-20 animate-pulse rounded-md bg-elevated" />
            <div class="h-3 w-28 animate-pulse rounded-md bg-elevated/80" />
          </div>
          <div class="flex gap-1">
            <div class="h-8 w-8 animate-pulse rounded-lg bg-elevated/70" />
            <div class="h-8 w-8 animate-pulse rounded-lg bg-elevated/70" />
          </div>
        </div>
      </div>
      <p class="flex items-center justify-center gap-2 py-2 text-[12px] text-fg-muted">
        <Loader2 class="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />
        正在从 GitHub 获取版本列表…
      </p>
    </div>

    <!-- 列表错误 -->
    <div
      v-else-if="listError"
      class="rounded-2xl border border-warning/25 bg-warning/8 px-4 py-5 text-center"
      role="alert"
    >
      <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-warning/12 text-warning">
        <AlertCircle class="h-5 w-5" aria-hidden="true" />
      </div>
      <p class="mt-3 text-[13px] font-medium text-fg">无法加载更新日志</p>
      <p class="mt-1 text-[12px] leading-relaxed text-fg-muted">{{ listError }}</p>
      <button
        type="button"
        class="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
        @click="loadList()"
      >
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
        重试
      </button>
    </div>

    <!-- 空列表 -->
    <div
      v-else-if="!releases.length"
      class="rounded-2xl border border-dashed border-border bg-elevated/40 px-4 py-10 text-center"
    >
      <p class="text-[13px] text-fg-muted">暂无公开发布记录</p>
    </div>

    <!-- 版本列表 -->
    <article
      v-for="entry in releases"
      v-else
      :key="entry.tagName"
      class="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-colors duration-200"
    >
      <header class="flex items-start gap-3 px-4 py-4">
        <button
          type="button"
          class="min-w-0 flex-1 cursor-pointer rounded-lg text-left transition-colors duration-200 hover:opacity-90"
          :aria-expanded="expanded[entry.tagName]"
          @click="toggle(entry.tagName)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-[15px] font-bold tracking-tight text-fg">
              {{ formatAppVersion(entry.tagName) }}
            </h3>
            <span
              v-if="isCurrentVersion(entry.tagName)"
              class="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent"
            >
              当前版本
            </span>
          </div>
          <p v-if="entry.publishedAt" class="mt-1 text-[12px] text-fg-muted">
            {{ formatChangelogDate(entry.publishedAt) }}
          </p>
        </button>

        <div class="flex shrink-0 items-center gap-1">
          <button
            v-if="entry.htmlUrl"
            type="button"
            class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg"
            aria-label="在 GitHub 查看发布"
            @click="openRelease(entry.htmlUrl)"
          >
            <ExternalLink class="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg"
            :aria-label="expanded[entry.tagName] ? '收起' : '展开'"
            @click="toggle(entry.tagName)"
          >
            <ChevronDown
              class="h-4 w-4 transition-transform duration-200"
              :class="expanded[entry.tagName] ? 'rotate-180' : ''"
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      <div
        v-if="expanded[entry.tagName]"
        class="border-t border-border-subtle px-4 pb-4 pt-3"
      >
        <div
          v-if="getDetailState(entry.tagName).status === 'loading'"
          class="space-y-2.5"
          role="status"
          aria-label="正在加载更新详情"
        >
          <div
            v-for="line in 3"
            :key="`detail-skeleton-${entry.tagName}-${line}`"
            class="h-11 animate-pulse rounded-xl bg-elevated"
            :class="line === 3 ? 'w-4/5' : 'w-full'"
          />
          <p class="flex items-center gap-2 pt-1 text-[12px] text-fg-muted">
            <Loader2 class="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />
            正在加载更新详情…
          </p>
        </div>

        <div
          v-else-if="getDetailState(entry.tagName).status === 'error'"
          class="rounded-xl border border-warning/20 bg-warning/6 px-3.5 py-3"
          role="alert"
        >
          <p class="text-[12px] text-fg-secondary">
            {{ detailError(entry.tagName) }}
          </p>
          <button
            type="button"
            class="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-accent transition-colors duration-200 hover:text-accent-hover"
            @click="retryDetail(entry.tagName)"
          >
            <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
            重试
          </button>
        </div>

        <template v-else-if="getDetailState(entry.tagName).status === 'ready'">
          <ReleaseNotesContent
            v-if="detailBody(entry.tagName)"
            :content="detailBody(entry.tagName)"
          />
          <p v-else class="rounded-xl border border-dashed border-border bg-elevated/40 px-4 py-6 text-center text-[13px] text-fg-muted">
            该版本暂无详细说明
          </p>
        </template>
      </div>
    </article>
  </div>
</template>
