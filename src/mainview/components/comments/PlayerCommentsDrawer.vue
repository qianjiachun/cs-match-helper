<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Copy, Check, Loader2, MessageSquare, RefreshCw, Send, X, Clock, Flame } from 'lucide-vue-next';
import { animate } from 'animejs/animation';
import { createTimeline } from 'animejs/timeline';
import type { useComments } from '../../composables/useComments';
import { useCopyFeedback } from '../../composables/useCopyFeedback';
import PlayerAvatar from '../PlayerAvatar.vue';
import CommentListItem from './CommentListItem.vue';
import CommentEmojiPicker from './CommentEmojiPicker.vue';

const props = defineProps<{
  comments: ReturnType<typeof useComments>;
}>();

const { copyText } = useCopyFeedback();

const draft = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const steamIdCopyWrapRef = ref<HTMLElement | null>(null);
const steamIdCopyIconRef = ref<HTMLElement | null>(null);
const copyCheckTemplateRef = ref<HTMLElement | null>(null);
const copyJustSucceeded = ref(false);
const copyIconHighlighted = ref(false);

let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

const canSubmit = computed(() => {
  const text = draft.value.trim();
  return text.length > 0 && text.length <= 200 && !props.comments.submitting.value;
});

const showLoading = computed(() => {
  const c = props.comments;
  if (c.listError.value || c.list.value.length > 0) return false;
  return c.listLoading.value || c.listRefreshing.value || !c.listFetched.value;
});

const showEmptyState = computed(() => {
  const c = props.comments;
  return (
    c.listFetched.value &&
    !c.listLoading.value &&
    !c.listRefreshing.value &&
    c.list.value.length === 0 &&
    !c.listError.value
  );
});

const TEXTAREA_MIN_HEIGHT = 26;
const TEXTAREA_MAX_HEIGHT = 132;

const charCountTone = computed(() => {
  const len = draft.value.length;
  if (len > 200) return 'font-medium text-rose-500';
  if (len >= 180) return 'font-medium text-amber-600';
  return 'text-slate-400';
});

function resizeTextarea() {
  const el = textareaRef.value;
  if (!el) return;

  const previousHeight = el.offsetHeight;
  el.style.height = 'auto';
  const nextHeight = Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT);

  if (previousHeight === nextHeight) {
    el.style.height = `${nextHeight}px`;
    return;
  }

  el.style.height = `${previousHeight}px`;
  requestAnimationFrame(() => {
    el.style.height = `${nextHeight}px`;
  });
}

watch(draft, () => {
  void nextTick(resizeTextarea);
});

onMounted(() => {
  resizeTextarea();
});

async function onSubmit() {
  if (!canSubmit.value) return;
  const ok = await props.comments.submitComment(draft.value);
  if (ok) {
    draft.value = '';
    await nextTick(resizeTextarea);
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void onSubmit();
  }
}

function insertEmoji(emoji: string) {
  const el = textareaRef.value;
  if (!el) {
    const next = `${draft.value}${emoji}`;
    if (next.length <= 200) draft.value = next;
    return;
  }

  const start = el.selectionStart ?? draft.value.length;
  const end = el.selectionEnd ?? start;
  const next = `${draft.value.slice(0, start)}${emoji}${draft.value.slice(end)}`;
  if (next.length > 200) return;

  draft.value = next;
  void nextTick(() => {
    el.focus();
    const pos = start + emoji.length;
    el.setSelectionRange(pos, pos);
    resizeTextarea();
  });
}

function onBackdropClick() {
  props.comments.closeDrawer();
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function playCopyIconPop() {
  const el = steamIdCopyIconRef.value;
  if (!el || prefersReducedMotion()) return;

  animate(el, {
    scale: [1, 1.15, 1],
    duration: 320,
    ease: 'outCubic',
  });
}

function flashCopyIcon() {
  copyIconHighlighted.value = true;
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = setTimeout(() => {
    copyIconHighlighted.value = false;
  }, 900);
}

function showCopySuccessFallback() {
  copyJustSucceeded.value = true;
  copyIconHighlighted.value = true;
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = setTimeout(() => {
    copyJustSucceeded.value = false;
    copyIconHighlighted.value = false;
  }, 1500);
}

function playCopySuccessAnimation() {
  const wrap = steamIdCopyWrapRef.value;
  const source = copyCheckTemplateRef.value?.querySelector('svg');
  if (!wrap || !source) return;

  if (prefersReducedMotion()) {
    showCopySuccessFallback();
    return;
  }

  const ghost = document.createElement('span');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.className =
    'copy-steamid-ghost pointer-events-none absolute left-1/2 bottom-0 z-10 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-600 shadow-sm ring-1 ring-emerald-100';
  ghost.innerHTML =
    '<span class="inline-flex h-3 w-3 items-center justify-center" aria-hidden="true"></span><span>已复制</span>';
  const iconSlot = ghost.querySelector('span');
  if (iconSlot) {
    iconSlot.appendChild(source.cloneNode(true));
  }
  wrap.appendChild(ghost);

  createTimeline()
    .add(ghost, {
      opacity: [0, 0.98],
      scale: [0.82, 1],
      duration: 160,
      ease: 'outCubic',
    })
    .add(ghost, {
      opacity: [0.98, 0],
      translateY: [0, -30],
      scale: [1, 0.88],
      duration: 760,
      ease: 'outQuart',
    })
    .then(() => {
      ghost.remove();
    });

  playCopyIconPop();
  flashCopyIcon();
}

async function onCopySteamId() {
  const player = props.comments.activePlayer.value;
  if (!player) return;

  const ok = await copyText(player.steamId, { showToast: false });
  if (ok) {
    playCopySuccessAnimation();
  }
}

function onRetry() {
  void props.comments.loadComments(true);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="comment-drawer">
      <div
        v-if="comments.drawerOpen.value && comments.activePlayer.value"
        class="fixed inset-0 z-50 flex justify-end"
      >
        <button
          type="button"
          class="comment-drawer-backdrop absolute inset-0 m-0 cursor-pointer border-0 p-0 appearance-none"
          aria-label="关闭评论"
          @click="onBackdropClick"
        />

        <aside
          class="comment-drawer-panel relative flex h-full w-full max-w-[460px] flex-col border-l border-slate-200/80 bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          :aria-label="`${comments.activePlayer.value.nickname} 的评论`"
        >
          <!-- 玩家头部 -->
          <header class="relative z-10 shrink-0 border-b border-slate-100 bg-linear-to-b from-slate-50 to-white pt-5">
            <div class="relative px-5">
              <button
                type="button"
                class="absolute right-2 top-0 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                aria-label="关闭"
                @click="comments.closeDrawer()"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>

              <div class="flex items-center gap-3 pr-9">
                <PlayerAvatar
                  :src="comments.activePlayer.value.avatar"
                  :alt="comments.activePlayer.value.nickname"
                  size="lg"
                  shape="rounded"
                  class="shrink-0 ring-2 ring-white shadow-sm"
                />
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2 class="truncate text-[15px] font-semibold leading-5 tracking-tight text-slate-900">
                    {{ comments.activePlayer.value.nickname }}
                  </h2>
                  <button
                    type="button"
                    class="group/copy relative inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 self-start overflow-visible rounded-md border border-transparent py-px font-mono text-[12px] leading-4 tracking-tight text-slate-500 transition-colors duration-200 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                    title="点击复制 Steam ID"
                    @click="onCopySteamId"
                  >
                    <span class="truncate tabular-nums">{{ comments.activePlayer.value.steamId }}</span>
                    <span ref="steamIdCopyWrapRef" class="relative inline-flex shrink-0 overflow-visible">
                      <span ref="steamIdCopyIconRef" class="inline-flex origin-center">
                        <Copy
                          class="h-3.5 w-3.5 opacity-45 transition-[opacity,color] duration-200 group-hover/copy:opacity-80"
                          :class="copyIconHighlighted ? 'text-emerald-500 opacity-100' : ''"
                          aria-hidden="true"
                        />
                      </span>
                      <span
                        v-if="copyJustSucceeded"
                        class="pointer-events-none absolute left-1/2 bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-100"
                        role="status"
                      >
                        已复制
                      </span>
                    </span>
                    <span ref="copyCheckTemplateRef" class="sr-only" aria-hidden="true">
                      <Check class="h-3 w-3" />
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 排序与数量控制条 -->
            <div class="mt-4 flex items-center justify-between px-5 pb-3">
              <div class="flex items-center gap-1 rounded-lg bg-slate-100/80 p-0.5">
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  :class="comments.listSort.value === 'time' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                  :disabled="comments.listLoading.value"
                  @click="comments.changeSort('time')"
                >
                  <Clock class="h-3.5 w-3.5" :class="comments.listSort.value === 'time' ? 'text-blue-500' : ''" aria-hidden="true" />
                  最新
                </button>
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                  :class="comments.listSort.value === 'hot' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                  :disabled="comments.listLoading.value"
                  @click="comments.changeSort('hot')"
                >
                  <Flame class="h-3.5 w-3.5" :class="comments.listSort.value === 'hot' ? 'text-orange-500' : ''" aria-hidden="true" />
                  最热
                </button>
              </div>
              <span class="text-[12px] font-medium text-slate-500">
                <span class="text-slate-800 tabular-nums">{{ comments.activeCount.value }}</span> 条评论
              </span>
            </div>
          </header>

          <!-- 评论内容区 -->
          <div class="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 px-5 py-4">
            <div
              v-if="showLoading"
              class="flex flex-col items-center justify-center py-20 text-center"
            >
              <Loader2 class="h-6 w-6 animate-spin text-blue-500" aria-hidden="true" />
              <p class="mt-3 text-[13px] font-medium text-slate-500">正在加载评论…</p>
            </div>

            <div
              v-else-if="comments.listError.value"
              class="flex flex-col items-center justify-center rounded-xl border border-rose-100 bg-rose-50/60 px-5 py-8 text-center"
            >
              <p class="text-[13px] font-medium text-rose-600">{{ comments.listError.value }}</p>
              <button
                type="button"
                class="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-1.5 text-[12px] font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                @click="onRetry"
              >
                <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
                重试
              </button>
            </div>

            <div
              v-else-if="showEmptyState"
              class="flex flex-col items-center justify-center py-20 text-center"
            >
              <div
                class="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-300 shadow-sm"
              >
                <MessageSquare class="h-7 w-7" aria-hidden="true" />
              </div>
              <p class="mt-4 text-[14px] font-semibold text-slate-700">还没有人评价这位玩家</p>
              <p class="mt-1.5 max-w-[240px] text-[12px] leading-relaxed text-slate-500">
                在下方输入框写下你的看法，帮助其他玩家了解这位选手
              </p>
            </div>

            <div v-if="comments.list.value.length > 0" class="space-y-3">
              <CommentListItem
                v-for="item in comments.list.value"
                :key="item.id"
                :comment="item"
                :self-color="comments.selfCommentColor.value"
                :submitting="comments.submitting.value"
                @like="comments.toggleLike(item)"
                @save-edit="(text) => comments.editComment(item.id, text)"
              />
            </div>

            <button
              v-if="comments.listMore.value && !comments.listLoading.value && comments.list.value.length > 0"
              type="button"
              class="mt-4 w-full cursor-pointer rounded-lg px-3 py-2 text-[12px] font-medium text-slate-500 transition-colors duration-200 hover:bg-slate-200/50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="comments.listLoadingMore.value"
              @click="comments.loadComments(false)"
            >
              <span v-if="comments.listLoadingMore.value" class="inline-flex items-center justify-center gap-1.5">
                <Loader2 class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                加载中…
              </span>
              <span v-else>加载更多</span>
            </button>
          </div>

          <!-- 底部 Composer -->
          <footer class="relative z-10 shrink-0 border-t border-slate-100 bg-white px-5 py-4">
            <p
              v-if="comments.submitError.value"
              class="mb-2.5 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-600"
            >
              {{ comments.submitError.value }}
            </p>

            <div
              class="comment-composer relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"
            >
              <textarea
                ref="textareaRef"
                v-model="draft"
                rows="1"
                maxlength="200"
                placeholder="写下你的评论…"
                aria-describedby="comment-composer-meta"
                class="comment-composer-textarea block w-full min-h-[26px] resize-none border-0 bg-transparent px-4 pb-2.5 pt-3.5 text-[14px] leading-5 text-slate-800 outline-none focus:ring-0"
                @keydown="onKeydown"
                @input="resizeTextarea"
              />

              <div
                id="comment-composer-meta"
                class="flex items-center gap-1.5 border-t border-slate-100/90 px-2 py-2"
              >
                <CommentEmojiPicker @pick="insertEmoji" />

                <div class="min-w-0 flex-1">
                  <p class="truncate text-[11px] leading-none text-slate-400">
                    <span class="inline-flex items-center gap-1">
                      <kbd
                        class="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500"
                      >
                        Ctrl
                      </kbd>
                      <span aria-hidden="true">+</span>
                      <kbd
                        class="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500"
                      >
                        Enter
                      </kbd>
                      <span class="ml-0.5">发送</span>
                    </span>
                  </p>
                </div>

                <span
                  class="shrink-0 tabular-nums text-[12px] leading-none"
                  :class="charCountTone"
                  aria-live="polite"
                >
                  {{ draft.length }}/200
                </span>

                <button
                  type="button"
                  class="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-colors duration-200 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  :disabled="!canSubmit"
                  title="发送评论 (Ctrl+Enter)"
                  aria-label="发送评论"
                  @click="onSubmit"
                >
                  <Loader2 v-if="comments.submitting.value" class="h-4 w-4 animate-spin" aria-hidden="true" />
                  <Send v-else class="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.comment-drawer-backdrop {
  background-color: rgb(15 23 42 / 0.32);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.comment-drawer-enter-active .comment-drawer-backdrop,
.comment-drawer-leave-active .comment-drawer-backdrop {
  transition:
    background-color 0.25s ease,
    backdrop-filter 0.25s ease,
    -webkit-backdrop-filter 0.25s ease;
}

.comment-drawer-enter-from .comment-drawer-backdrop,
.comment-drawer-leave-to .comment-drawer-backdrop {
  background-color: rgb(15 23 42 / 0);
  backdrop-filter: blur(0);
  -webkit-backdrop-filter: blur(0);
}

.comment-drawer-enter-active .comment-drawer-panel,
.comment-drawer-leave-active .comment-drawer-panel {
  will-change: transform;
}

.comment-drawer-enter-active .comment-drawer-panel {
  animation: comment-drawer-panel-in 0.25s cubic-bezier(0.32, 0.72, 0, 1) both;
}

.comment-drawer-leave-active .comment-drawer-panel {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}

.comment-drawer-leave-to .comment-drawer-panel {
  transform: translateX(100%);
}

@keyframes comment-drawer-panel-in {
  from {
    transform: translateX(100%);
  }

  to {
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .comment-drawer-enter-active .comment-drawer-backdrop,
  .comment-drawer-leave-active .comment-drawer-backdrop,
  .comment-drawer-enter-active .comment-drawer-panel,
  .comment-drawer-leave-active .comment-drawer-panel {
    transition-duration: 0.01ms;
  }

  .comment-drawer-enter-active .comment-drawer-panel {
    animation: none;
    transform: translateX(0);
  }

  .comment-composer-textarea {
    transition: none;
  }
}

.comment-composer-textarea {
  overflow: hidden;
  scrollbar-width: none;
  transition: height 0.2s ease-out;
}

.comment-composer-textarea::-webkit-scrollbar {
  display: none;
}

.copy-steamid-ghost {
  will-change: transform, opacity;
}

.copy-steamid-ghost :deep(svg) {
  width: 12px;
  height: 12px;
  stroke: currentColor;
}

@media (prefers-reduced-motion: reduce) {
  .copy-steamid-ghost {
    display: none;
  }
}
</style>
