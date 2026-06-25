<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Loader2, ThumbsUp } from 'lucide-vue-next';
import { animate } from 'animejs/animation';
import { createTimeline } from 'animejs/timeline';
import type { CommentItem } from '@core/comments/types';
import { formatCommentTimeMeta } from '@core/comments/format-time';
import { isCommentEditable } from '@core/comments/edit-policy';
import { resolveCommentAuthorIdentity } from '@core/comments/comment-identity';
import CommentEmojiPicker from './CommentEmojiPicker.vue';
import CommentPixelAvatar from './CommentPixelAvatar.vue';

const props = withDefaults(
  defineProps<{
    comment: CommentItem;
    submitting?: boolean;
    showLike?: boolean;
    embedded?: boolean;
    selfColor?: string | null;
  }>(),
  {
    showLike: true,
    embedded: false,
  },
);

const emit = defineEmits<{
  like: [];
  saveEdit: [text: string];
  cancelEdit: [];
}>();

const editing = ref(false);
const draft = ref('');
const editTextareaRef = ref<HTMLTextAreaElement | null>(null);
const thumbWrapRef = ref<HTMLElement | null>(null);
const thumbRef = ref<HTMLElement | null>(null);
const likesRef = ref<HTMLElement | null>(null);
const prevLikes = ref<number | null>(null);

watch(
  () => props.comment.id,
  () => {
    editing.value = false;
    draft.value = '';
    prevLikes.value = null;
  },
);

const timeMeta = computed(() => formatCommentTimeMeta(props.comment.createTime));

const author = computed(() =>
  resolveCommentAuthorIdentity(props.comment.color, {
    self: props.comment.self,
    selfColor: props.selfColor,
  }),
);

const aliasCode = computed(() => {
  const alias = author.value?.alias;
  if (!alias?.startsWith('用户') || alias.length <= 2) return '';
  return alias.slice(2);
});

const avatarSize = computed(() => (props.embedded ? 24 : 32));

const accentStyle = computed(() =>
  author.value ? ({ '--comment-accent': author.value.color } as Record<string, string>) : undefined,
);

const canEdit = computed(
  () => Boolean(props.comment.self) && isCommentEditable(props.comment.createTime),
);

const EDIT_TEXTAREA_MIN_HEIGHT = 36;
const EDIT_TEXTAREA_MAX_HEIGHT = 96;

function resizeEditTextarea() {
  const el = editTextareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(Math.max(el.scrollHeight, EDIT_TEXTAREA_MIN_HEIGHT), EDIT_TEXTAREA_MAX_HEIGHT)}px`;
}

watch(editing, (value) => {
  if (value) void nextTick(resizeEditTextarea);
});

watch(draft, () => {
  if (editing.value) void nextTick(resizeEditTextarea);
});

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function playMainThumbPop() {
  const el = thumbRef.value;
  if (!el || prefersReducedMotion()) return;

  animate(el, {
    scale: [1, 1.12, 1],
    duration: 360,
    ease: 'outCubic',
  });
}

function playUnlikeAnimation() {
  const el = thumbRef.value;
  if (!el || prefersReducedMotion()) return;

  animate(el, {
    scale: [1, 0.9, 1],
    rotate: [0, -6, 0],
    duration: 320,
    ease: 'outCubic',
  });
}

function playFloatThumbAnimation() {
  const wrap = thumbWrapRef.value;
  const source = thumbRef.value?.querySelector('svg');
  if (!wrap || !source || prefersReducedMotion()) return;

  const ghost = document.createElement('span');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.className =
    'comment-like-ghost pointer-events-none absolute left-1/2 bottom-0 z-10 inline-flex -translate-x-1/2 text-rose-500';
  ghost.appendChild(source.cloneNode(true));
  wrap.appendChild(ghost);

  createTimeline()
    .add(ghost, {
      opacity: [0, 0.95],
      scale: [0.82, 1],
      duration: 160,
      ease: 'outCubic',
    })
    .add(ghost, {
      opacity: [0.95, 0],
      translateY: [0, -34],
      scale: [1, 0.88],
      rotate: [0, 7],
      duration: 760,
      ease: 'outQuart',
    })
    .then(() => {
      ghost.remove();
    });

  playMainThumbPop();
}

function playLikesCountAnimation() {
  const el = likesRef.value;
  if (!el || prefersReducedMotion()) return;

  animate(el, {
    scale: [1, 1.14, 1],
    translateY: [0, -1, 0],
    duration: 380,
    ease: 'outCubic',
  });
}

watch(
  () => props.comment.likes,
  (likes) => {
    if (prevLikes.value === null) {
      prevLikes.value = likes;
      return;
    }
    if (likes === prevLikes.value) return;
    playLikesCountAnimation();
    prevLikes.value = likes;
  },
  { flush: 'post' },
);

function startEdit() {
  draft.value = props.comment.text;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  draft.value = '';
  emit('cancelEdit');
}

function saveEdit() {
  const text = draft.value.trim();
  if (!text || text.length > 200) return;
  emit('saveEdit', text);
  editing.value = false;
}

function insertEmoji(emoji: string) {
  const el = editTextareaRef.value;
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
    resizeEditTextarea();
  });
}

function onLikeClick() {
  if (props.comment.liked) {
    playUnlikeAnimation();
  } else {
    playFloatThumbAnimation();
  }
  emit('like');
}
</script>

<template>
  <article
    class="comment-item group relative flex gap-2.5 transition-colors duration-200"
    :class="
      embedded
        ? 'py-1'
        : [
            'rounded-xl px-3 py-2.5',
            comment.self
              ? 'bg-blue-50/40 hover:bg-blue-50/55'
              : 'bg-slate-50/50 hover:bg-slate-50/80',
          ]
    "
    :style="accentStyle"
  >
    <CommentPixelAvatar
      :color="author?.color ?? comment.color"
      :size="avatarSize"
      class="shrink-0"
    />

    <div class="min-w-0 flex-1">
      <template v-if="!editing">
        <div class="flex items-start justify-between gap-2">
          <header class="min-w-0 flex-1 text-[11px] leading-snug">
            <div class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <h3
                class="comment-item__author min-w-0"
                :class="{ 'comment-item__author--accent': Boolean(author) }"
              >
                <span class="comment-item__author-prefix">用户</span>
                <span v-if="aliasCode" class="comment-item__author-code">
                  {{ aliasCode }}
                </span>
                <span v-else class="comment-item__author-prefix text-slate-600">匿名</span>
              </h3>
              <span
                v-if="comment.self"
                class="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium leading-snug text-blue-600"
              >
                我
              </span>
              <span class="shrink-0 text-slate-300" aria-hidden="true">·</span>
              <time
                v-if="timeMeta.relative || timeMeta.absolute"
                :datetime="timeMeta.iso"
                class="inline-flex min-w-0 items-center gap-1 text-slate-400"
                :title="timeMeta.absolute"
              >
                <span v-if="timeMeta.relative" class="shrink-0">{{ timeMeta.relative }}</span>
                <template v-if="comment.editedAt">
                  <span class="shrink-0 text-slate-300" aria-hidden="true">·</span>
                  <span class="shrink-0">已编辑</span>
                </template>
              </time>
            </div>
          </header>

          <div
            v-if="showLike || canEdit"
            class="comment-item__actions flex shrink-0 items-center gap-0.5"
          >
            <button
              v-if="canEdit"
              type="button"
              class="comment-edit-btn pointer-events-none inline-flex h-6 cursor-pointer items-center rounded-md px-1.5 text-[11px] font-medium text-slate-400 opacity-0 transition-[opacity,color,background-color] duration-200 hover:bg-white/80 hover:text-slate-600 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 group-hover:pointer-events-auto group-hover:opacity-100"
              @click="startEdit"
            >
              编辑
            </button>

            <button
              v-if="showLike"
              type="button"
              class="inline-flex h-6 cursor-pointer items-center gap-0.5 rounded-md px-1.5 text-[11px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              :class="
                comment.liked
                  ? 'bg-rose-50 text-rose-500'
                  : 'text-slate-400 hover:bg-white/80 hover:text-rose-500'
              "
              :aria-label="comment.liked ? '取消点赞' : '点赞'"
              @click="onLikeClick"
            >
              <span ref="thumbWrapRef" class="relative inline-flex overflow-visible">
                <span ref="thumbRef" class="inline-flex origin-bottom">
                  <ThumbsUp
                    class="h-3.5 w-3.5"
                    :class="comment.liked ? 'fill-current' : ''"
                    aria-hidden="true"
                  />
                </span>
              </span>
              <span v-if="comment.likes > 0" ref="likesRef" class="tabular-nums">{{ comment.likes }}</span>
            </button>
          </div>
        </div>

        <p class="mt-1.5 whitespace-pre-wrap wrap-break-word text-[13px] leading-[1.62] text-slate-700">
          {{ comment.text }}
        </p>
      </template>

      <div v-else class="relative overflow-visible">
        <header class="mb-2 flex min-w-0 items-baseline gap-1.5">
          <h3
            class="comment-item__author"
            :class="{ 'comment-item__author--accent': Boolean(author) }"
          >
            <span class="comment-item__author-prefix">用户</span>
            <span v-if="aliasCode" class="comment-item__author-code">
              {{ aliasCode }}
            </span>
          </h3>
          <span
            v-if="comment.self"
            class="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium leading-snug text-blue-600"
          >
            我
          </span>
        </header>

        <textarea
          ref="editTextareaRef"
          v-model="draft"
          rows="1"
          maxlength="200"
          class="comment-edit-textarea w-full resize-none rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-[13px] leading-[1.55] text-slate-700 outline-none transition-[height,border-color,box-shadow] duration-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100/60"
          @input="resizeEditTextarea"
        />
        <div class="mt-1.5 flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-1">
            <CommentEmojiPicker @pick="insertEmoji" />
            <span
              class="text-[11px] leading-none tabular-nums"
              :class="draft.length > 200 ? 'font-medium text-rose-500' : 'text-slate-400'"
            >
              {{ draft.length }}/200
            </span>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="inline-flex h-7 cursor-pointer items-center rounded-lg px-2 text-[11px] font-medium text-slate-500 transition-colors duration-200 hover:bg-white/70 hover:text-slate-700"
              @click="cancelEdit"
            >
              取消
            </button>
            <button
              type="button"
              class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-[11px] font-medium text-white transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="submitting || !draft.trim() || draft.length > 200"
              @click="saveEdit"
            >
              <Loader2 v-if="submitting" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.comment-item__author {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: 0.125rem;
  line-height: 1.35;
}

.comment-item__author-prefix {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: rgb(30 41 59);
}

.comment-item__author-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: rgb(100 116 139);
}

.comment-item__author--accent .comment-item__author-prefix,
.comment-item__author--accent .comment-item__author-code {
  color: var(--comment-accent);
}

.comment-item__actions {
  margin-top: -0.125rem;
}

.comment-edit-btn {
  transition:
    opacity 0.2s ease,
    color 0.2s ease,
    background-color 0.2s ease;
}

.comment-edit-textarea {
  overflow: hidden;
  scrollbar-width: none;
}

.comment-edit-textarea::-webkit-scrollbar {
  display: none;
}

.comment-like-ghost {
  will-change: transform, opacity;
}

.comment-like-ghost :deep(svg) {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

@media (prefers-reduced-motion: reduce) {
  .comment-edit-btn {
    transition: none;
  }

  .comment-edit-textarea {
    transition: none;
  }

  .comment-like-ghost {
    display: none;
  }
}
</style>
