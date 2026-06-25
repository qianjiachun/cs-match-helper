<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { Check, Copy, Loader2, MessageCircle, RefreshCw } from 'lucide-vue-next';
import type { useComments } from '../../composables/useComments';
import { useCopyFeedback } from '../../composables/useCopyFeedback';
import CommentListItem from '../comments/CommentListItem.vue';
import SettingsCard from './SettingsCard.vue';

const SKELETON_DELAY_MS = 220;

const props = defineProps<{
  comments: ReturnType<typeof useComments>;
  visible?: boolean;
}>();

const { copyText } = useCopyFeedback();
const copiedSteamId = ref<string | null>(null);
const skeletonVisible = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;

const showSkeleton = computed(
  () =>
    props.comments.historyLoading.value &&
    props.comments.historyList.value.length === 0 &&
    skeletonVisible.value,
);

const showEmpty = computed(
  () =>
    props.comments.historyFetched.value &&
    !props.comments.historyLoading.value &&
    !props.comments.historyError.value &&
    props.comments.historyList.value.length === 0,
);

const showList = computed(
  () =>
    !props.comments.historyError.value &&
    props.comments.historyList.value.length > 0,
);

const showPending = computed(
  () =>
    !showSkeleton.value &&
    !props.comments.historyError.value &&
    !showEmpty.value &&
    !showList.value,
);

watch(
  () => props.comments.historyLoading.value,
  (loading) => {
    if (skeletonTimer) {
      clearTimeout(skeletonTimer);
      skeletonTimer = null;
    }
    if (!loading) {
      skeletonVisible.value = false;
      return;
    }
    if (props.comments.historyList.value.length > 0) return;

    skeletonTimer = setTimeout(() => {
      if (props.comments.historyLoading.value && props.comments.historyList.value.length === 0) {
        skeletonVisible.value = true;
      }
    }, SKELETON_DELAY_MS);
  },
);

watch(
  () => props.visible,
  (v) => {
    if (v) void props.comments.loadHistory(true);
  },
  { immediate: true },
);

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
  if (skeletonTimer) clearTimeout(skeletonTimer);
});

function refreshHistory() {
  skeletonVisible.value = false;
  void props.comments.loadHistory(true);
}

async function copySteamId(steamid: string) {
  const ok = await copyText(steamid, { showToast: false });
  if (!ok) return;
  copiedSteamId.value = steamid;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    if (copiedSteamId.value === steamid) copiedSteamId.value = null;
  }, 1600);
}
</script>

<template>
  <SettingsCard
    title="我的评论"
    description="查看和管理你发表过的所有评论"
    :icon="MessageCircle"
  >
    <Transition name="history-alert">
      <p
        v-if="comments.submitError.value"
        class="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-600"
        role="alert"
      >
        {{ comments.submitError.value }}
      </p>
    </Transition>

    <Transition name="history-state" mode="out-in">
      <div
        v-if="showSkeleton"
        key="skeleton"
        class="space-y-3"
        aria-busy="true"
        aria-label="评论加载中"
      >
        <div
          v-for="i in 3"
          :key="i"
          class="history-skeleton-card overflow-hidden rounded-2xl border border-border bg-elevated/40"
          :style="{ '--skeleton-delay': `${(i - 1) * 80}ms` }"
        >
          <div class="border-b border-border-subtle px-4 py-2.5">
            <div class="h-3 w-36 rounded-md bg-border" />
          </div>
          <div class="space-y-2 px-4 py-3.5">
            <div class="h-3 w-full rounded-md bg-border" />
            <div class="h-3 w-4/5 rounded-md bg-border" />
            <div class="mt-3 h-3 w-24 rounded-md bg-border" />
          </div>
        </div>
      </div>

      <div
        v-else-if="comments.historyError.value"
        key="error"
        class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-center"
        role="alert"
      >
        <p class="text-[13px] text-rose-600">{{ comments.historyError.value }}</p>
        <button
          type="button"
          class="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          @click="refreshHistory"
        >
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
          重试
        </button>
      </div>

      <div
        v-else-if="showEmpty"
        key="empty"
        class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-elevated/30 px-6 py-12 text-center"
      >
        <div
          class="history-empty-icon mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent"
          aria-hidden="true"
        >
          <MessageCircle class="h-5 w-5" />
        </div>
        <p class="text-[14px] font-medium text-fg">还没有发表过评论</p>
        <p class="mt-1.5 max-w-xs text-[12px] leading-relaxed text-fg-muted">
          在对局详情中点击玩家旁的评论按钮，即可写下你的评价
        </p>
      </div>

      <div v-else-if="showList" key="list" class="space-y-3">
        <TransitionGroup name="history-item" tag="div" class="space-y-3">
          <article
            v-for="(item, index) in comments.historyList.value"
            :key="item.id"
            class="group/history overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow duration-200 hover:shadow-md"
            :style="{ '--item-delay': `${Math.min(index, 8) * 45}ms` }"
          >
            <header
              class="flex items-center justify-between gap-2 border-b border-border-subtle bg-elevated/50 px-3.5 py-2"
            >
              <div class="flex min-w-0 items-center gap-2">
                <span
                  class="shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent"
                >
                  玩家
                </span>
                <span class="truncate font-mono text-[11px] text-fg-secondary" :title="item.steamid">
                  {{ item.steamid }}
                </span>
              </div>
              <button
                type="button"
                class="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-fg-muted opacity-0 transition-[opacity,color,background-color] duration-200 hover:bg-base hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 group-hover/history:opacity-100"
                :aria-label="`复制 SteamID ${item.steamid}`"
                @click="copySteamId(item.steamid)"
              >
                <Check
                  v-if="copiedSteamId === item.steamid"
                  class="h-3 w-3 text-emerald-500"
                  aria-hidden="true"
                />
                <Copy v-else class="h-3 w-3" aria-hidden="true" />
                <span>{{ copiedSteamId === item.steamid ? '已复制' : '复制' }}</span>
              </button>
            </header>

            <div class="p-1.5">
              <CommentListItem
                :comment="item"
                :self-color="comments.selfCommentColor.value"
                :submitting="comments.submitting.value"
                :show-like="false"
                embedded
                @save-edit="(text) => comments.editComment(item.id, text)"
              />
            </div>
          </article>
        </TransitionGroup>

        <button
          v-if="comments.historyMore.value"
          type="button"
          class="w-full cursor-pointer rounded-xl border border-border bg-elevated px-3 py-2.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="comments.historyLoadingMore.value"
          @click="comments.loadHistory(false)"
        >
          <span v-if="comments.historyLoadingMore.value" class="inline-flex items-center justify-center gap-1.5">
            <Loader2 class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            加载中…
          </span>
          <span v-else>加载更多</span>
        </button>
      </div>

      <div v-else-if="showPending" key="pending" class="history-pending" aria-busy="true" aria-label="加载中" />
    </Transition>
  </SettingsCard>
</template>

<style scoped>
.history-state-enter-active,
.history-state-leave-active {
  transition:
    opacity 0.22s cubic-bezier(0.32, 0.72, 0, 1),
    transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
}

.history-state-enter-from,
.history-state-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.history-alert-enter-active,
.history-alert-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    max-height 0.2s ease,
    margin 0.2s ease;
}

.history-alert-enter-from,
.history-alert-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.history-skeleton-card {
  animation: history-skeleton-in 0.32s cubic-bezier(0.32, 0.72, 0, 1) backwards;
  animation-delay: var(--skeleton-delay, 0ms);
}

.history-skeleton-card > div > div {
  animation: history-skeleton-pulse 1.4s ease-in-out infinite;
  animation-delay: var(--skeleton-delay, 0ms);
}

@keyframes history-skeleton-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes history-skeleton-pulse {
  0%,
  100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

.history-empty-icon {
  animation: history-empty-pop 0.4s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes history-empty-pop {
  from {
    opacity: 0;
    transform: scale(0.88);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.history-item-enter-active {
  transition:
    opacity 0.28s cubic-bezier(0.32, 0.72, 0, 1),
    transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  transition-delay: var(--item-delay, 0ms);
}

.history-item-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.history-item-enter-from,
.history-item-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.history-item-move {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}

.history-pending {
  min-height: 132px;
}

@media (prefers-reduced-motion: reduce) {
  .history-state-enter-active,
  .history-state-leave-active,
  .history-alert-enter-active,
  .history-alert-leave-active,
  .history-item-enter-active,
  .history-item-leave-active,
  .history-item-move {
    transition-duration: 0.01ms;
  }

  .history-skeleton-card,
  .history-skeleton-card > div > div,
  .history-empty-icon {
    animation: none;
  }
}
</style>
