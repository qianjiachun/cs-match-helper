<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Loader2, ThumbsUp } from 'lucide-vue-next';
import { animate } from 'animejs/animation';
import { createTimeline } from 'animejs/timeline';
import type { CommentItem } from '@core/comments/types';
import { formatCommentTimeMeta } from '@core/comments/format-time';
import { isCommentEditable } from '@core/comments/edit-policy';
import CommentEmojiPicker from './CommentEmojiPicker.vue';

const props = withDefaults(
  defineProps<{
    comment: CommentItem;
    submitting?: boolean;
    showLike?: boolean;
    embedded?: boolean;
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
    class="group relative flex flex-col transition-all duration-300"
    :class="
      embedded
        ? 'rounded-xl'
        : [
            'rounded-2xl border',
            comment.self
              ? 'bg-blue-50/30 hover:bg-blue-50/50'
              : 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]',
          ]
    "
    :style="
      embedded
        ? undefined
        : comment.color
          ? { borderColor: comment.color }
          : comment.self
            ? { borderColor: 'rgb(219 234 254)' }
            : { borderColor: 'rgb(241 245 249)' }
    "
  >
    <div v-if="!editing" class="px-3.5 pt-2.5 pb-1.5">
      <p class="whitespace-pre-wrap wrap-break-word text-[13px] leading-[1.55] text-slate-700">
        {{ comment.text }}
      </p>

      <div class="mt-1.5 flex items-center justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-x-1.5 text-[11px] leading-none">
          <time
            v-if="timeMeta.relative || timeMeta.absolute"
            :datetime="timeMeta.iso"
            class="inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5"
          >
            <span v-if="timeMeta.relative" class="shrink-0 font-medium text-slate-500">
              {{ timeMeta.relative }}
            </span>
            <span
              v-if="timeMeta.relative && timeMeta.absolute"
              class="shrink-0 text-slate-300"
              aria-hidden="true"
            >
              ·
            </span>
            <span class="truncate tabular-nums text-slate-400">{{ timeMeta.absolute }}</span>
          </time>
          <template v-if="comment.self">
            <span class="shrink-0 text-slate-300" aria-hidden="true">·</span>
            <span class="shrink-0 font-medium text-blue-500">我的评论</span>
          </template>
        </div>

        <div class="flex shrink-0 items-center gap-0.5">
          <button
            v-if="canEdit"
            type="button"
            class="comment-edit-btn pointer-events-none inline-flex h-6 cursor-pointer items-center rounded-md px-1.5 text-[11px] font-medium text-slate-400 opacity-0 hover:bg-white/80 hover:text-slate-700 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 group-hover:pointer-events-auto group-hover:opacity-100"
            @click="startEdit"
          >
            编辑
          </button>

          <button
            v-if="showLike"
            type="button"
            class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            :class="
              comment.liked
                ? 'bg-rose-50/80 text-rose-500'
                : 'text-slate-400 hover:bg-rose-50 hover:text-rose-500'
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
            <span
              v-else
              class="opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              赞
            </span>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="relative overflow-visible px-3.5 pt-2.5 pb-1.5">
      <textarea
        ref="editTextareaRef"
        v-model="draft"
        rows="1"
        maxlength="200"
        class="comment-edit-textarea w-full resize-none rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-[13px] leading-[1.55] text-slate-700 outline-none transition-[height,border-color,box-shadow] duration-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100/60"
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
            class="inline-flex h-6 cursor-pointer items-center rounded-md px-2 text-[11px] font-medium text-slate-500 transition-colors duration-200 hover:bg-white/80 hover:text-slate-700"
            @click="cancelEdit"
          >
            取消
          </button>
          <button
            type="button"
            class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11px] font-medium text-white transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="submitting || !draft.trim() || draft.length > 200"
            @click="saveEdit"
          >
            <Loader2 v-if="submitting" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            保存
          </button>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
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
