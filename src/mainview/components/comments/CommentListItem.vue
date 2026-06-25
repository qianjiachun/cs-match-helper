<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Loader2, ThumbsUp, MessageSquareReply, ChevronDown, ChevronUp, MapPin, PencilLine } from 'lucide-vue-next';
import { animate } from 'animejs/animation';
import { createTimeline } from 'animejs/timeline';
import type { CommentItem } from '@core/comments/types';
import { formatCommentTimeMeta } from '@core/comments/format-time';
import { isCommentEditable } from '@core/comments/edit-policy';
import { isInternalTopLevelComment } from '@core/comments/internal-comment';
import { resolveCommentAuthorIdentity } from '@core/comments/comment-identity';
import CommentEmojiPicker from './CommentEmojiPicker.vue';
import CommentImageThumb from './CommentImageThumb.vue';
import CommentPixelAvatar from './CommentPixelAvatar.vue';
import CommentProxiedImage from './CommentProxiedImage.vue';
import PlayerAvatar from '../PlayerAvatar.vue';
import PlatformLogo from '../PlatformLogo.vue';
import type { MatchPlatformId } from '@core/match/models';

const props = withDefaults(
  defineProps<{
    comment: CommentItem;
    submitting?: boolean;
    showLike?: boolean;
    embedded?: boolean;
    selfColor?: string | null;
    replyExpanded?: boolean;
    replyLoading?: boolean;
    replyLoadingMore?: boolean;
    replyMore?: boolean;
    replying?: boolean;
  }>(),
  {
    showLike: true,
    embedded: false,
    replyExpanded: false,
    replyLoading: false,
    replyLoadingMore: false,
    replyMore: false,
    replying: false,
  },
);

const emit = defineEmits<{
  like: [];
  saveEdit: [text: string];
  cancelEdit: [];
  toggleReplies: [];
  startReply: [];
  cancelReply: [];
  submitReply: [text: string];
  loadMoreReplies: [];
  likeReply: [reply: CommentItem];
  saveReplyEdit: [replyId: string, text: string];
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

const isPlatformComment = computed(
  () => props.comment.readOnly || (props.comment.source && props.comment.source !== 'internal'),
);

const platformSource = computed((): MatchPlatformId | null => {
  if (props.comment.source === 'perfect' || props.comment.source === '5e') {
    return props.comment.source;
  }
  return null;
});

const showPlatformBadge = computed(
  () => Boolean(platformSource.value) && !props.embedded,
);

const imageSource = computed((): 'perfect' | '5e' | 'internal' => {
  if (props.comment.source === 'perfect') return 'perfect';
  if (props.comment.source === '5e') return '5e';
  return 'internal';
});

const displayName = computed(() => {
  if (isPlatformComment.value && props.comment.authorName?.trim()) {
    return props.comment.authorName.trim();
  }
  return null;
});

const showLikeButton = computed(
  () => props.showLike && !isPlatformComment.value,
);

const canEdit = computed(
  () =>
    !isPlatformComment.value
    && Boolean(props.comment.self)
    && isCommentEditable(props.comment.createTime),
);

const isTopLevelInternal = computed(
  () => !props.embedded && isInternalTopLevelComment(props.comment),
);

const replyCountLabel = computed(() => {
  const count = props.comment.replyCount ?? props.comment.internalReplies?.length ?? 0;
  return count > 0 ? count : 0;
});

const showReplyToggle = computed(
  () => isTopLevelInternal.value && replyCountLabel.value > 0,
);

const showReplyAction = computed(() => isTopLevelInternal.value);

const replyDraft = ref('');
const replyTextareaRef = ref<HTMLTextAreaElement | null>(null);

const REPLY_TEXTAREA_MIN_HEIGHT = 32;
const REPLY_TEXTAREA_MAX_HEIGHT = 88;

function resizeReplyTextarea() {
  const el = replyTextareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const scrollHeight = el.scrollHeight;
  const nextHeight = Math.min(
    Math.max(scrollHeight, REPLY_TEXTAREA_MIN_HEIGHT),
    REPLY_TEXTAREA_MAX_HEIGHT,
  );
  el.style.height = `${nextHeight}px`;
  el.style.overflowY = scrollHeight > REPLY_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
}

watch(
  () => props.replying,
  (value) => {
    if (!value) replyDraft.value = '';
    if (value) void nextTick(resizeReplyTextarea);
  },
);

watch(replyDraft, () => {
  if (props.replying) void nextTick(resizeReplyTextarea);
});

function submitReplyDraft() {
  const text = replyDraft.value.trim();
  if (!text || text.length > 200 || props.submitting) return;
  emit('submitReply', text);
  replyDraft.value = '';
}

function insertReplyEmoji(emoji: string) {
  const el = replyTextareaRef.value;
  if (!el) {
    const next = `${replyDraft.value}${emoji}`;
    if (next.length <= 200) replyDraft.value = next;
    return;
  }
  const start = el.selectionStart ?? replyDraft.value.length;
  const end = el.selectionEnd ?? start;
  const next = `${replyDraft.value.slice(0, start)}${emoji}${replyDraft.value.slice(end)}`;
  if (next.length > 200) return;
  replyDraft.value = next;
  void nextTick(() => {
    el.focus();
    const pos = start + emoji.length;
    el.setSelectionRange(pos, pos);
    resizeReplyTextarea();
  });
}

const EDIT_TEXTAREA_MIN_HEIGHT = 36;
const EDIT_TEXTAREA_MAX_HEIGHT = 96;

function resizeEditTextarea() {
  const el = editTextareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const scrollHeight = el.scrollHeight;
  const nextHeight = Math.min(
    Math.max(scrollHeight, EDIT_TEXTAREA_MIN_HEIGHT),
    EDIT_TEXTAREA_MAX_HEIGHT,
  );
  el.style.height = `${nextHeight}px`;
  el.style.overflowY = scrollHeight > EDIT_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
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
    class="comment-item group relative grid grid-cols-[auto_minmax(0,1fr)] transition-colors duration-200"
    :class="
      embedded
        ? 'gap-x-2.5 py-1.5'
        : [
            'gap-x-3 rounded-xl px-3 py-2.5',
            comment.self
              ? 'bg-blue-50/40 hover:bg-blue-50/55'
              : isPlatformComment
                ? 'border border-slate-200/70 bg-white/90 hover:bg-white'
                : 'bg-slate-50/50 hover:bg-slate-50/80',
          ]
    "
    :style="accentStyle"
  >
    <div
      class="comment-item__avatar flex shrink-0 justify-center"
      :class="embedded ? 'w-6 pt-0.5' : 'w-8 pt-0.5'"
    >
      <CommentProxiedImage
        v-if="isPlatformComment && comment.authorAvatar && comment.source === 'perfect'"
        :src="comment.authorAvatar"
        source="perfect"
        :alt="displayName ?? '用户头像'"
        class="h-8 w-8 rounded-md"
      />
      <PlayerAvatar
        v-else-if="isPlatformComment && comment.authorAvatar"
        :src="comment.authorAvatar"
        :alt="displayName ?? '用户头像'"
        size="sm"
        shape="rounded"
        class="!h-8 !w-8"
      />
      <CommentPixelAvatar
        v-else
        :color="author?.color ?? comment.color"
        :size="avatarSize"
      />
    </div>

    <div class="comment-item__body min-w-0">
      <template v-if="!editing">
        <div class="flex items-center justify-between gap-2">
          <header class="min-w-0 flex-1 text-[11px] leading-snug">
            <div
              v-if="isPlatformComment"
              class="flex min-w-0 items-center justify-between gap-2"
            >
              <div class="comment-item__meta min-w-0 flex-1">
                <h3 class="comment-item__author m-0 min-w-0">
                  <span class="comment-item__author-prefix">{{ displayName ?? '用户' }}</span>
                </h3>
                <span
                  v-if="comment.self"
                  class="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[10px] font-medium leading-none text-blue-600"
                >
                  我
                </span>
                <span class="comment-item__meta-sep" aria-hidden="true">·</span>
                <time
                  v-if="timeMeta.relative || timeMeta.absolute"
                  :datetime="timeMeta.iso"
                  class="comment-item__meta-time shrink-0"
                  :title="timeMeta.absolute"
                >
                  {{ timeMeta.relative }}
                </time>
                <template v-if="comment.region">
                  <span class="comment-item__meta-sep" aria-hidden="true">·</span>
                  <span class="comment-item__meta-region inline-flex shrink-0 items-baseline gap-0.5">
                    <MapPin class="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                    {{ comment.region }}
                  </span>
                </template>
              </div>
              <PlatformLogo
                v-if="showPlatformBadge && platformSource"
                :platform-id="platformSource"
                size="xs"
                class="shrink-0"
              />
            </div>

            <div
              v-else
              class="comment-item__meta min-w-0"
            >
              <h3
                class="comment-item__author m-0 min-w-0"
                :class="{ 'comment-item__author--accent': Boolean(author) && !displayName }"
              >
                <template v-if="displayName">
                  <span class="comment-item__author-prefix">{{ displayName }}</span>
                </template>
                <template v-else>
                  <span class="comment-item__author-prefix">用户</span>
                  <span v-if="aliasCode" class="comment-item__author-code">
                    {{ aliasCode }}
                  </span>
                  <span v-else class="comment-item__author-prefix text-slate-600">匿名</span>
                </template>
              </h3>
              <span
                v-if="comment.region"
                class="comment-item__meta-region shrink-0"
              >
                {{ comment.region }}
              </span>
              <span
                v-if="comment.floor"
                class="comment-item__meta-floor shrink-0"
              >
                #{{ comment.floor }}
              </span>
              <span
                v-if="comment.self"
                class="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[10px] font-medium leading-none text-blue-600"
              >
                我
              </span>
              <span class="comment-item__meta-sep" aria-hidden="true">·</span>
              <time
                v-if="timeMeta.relative || timeMeta.absolute"
                :datetime="timeMeta.iso"
                class="comment-item__meta-time shrink-0"
                :title="timeMeta.absolute"
              >
                {{ timeMeta.relative }}
                <template v-if="comment.editedAt">
                  <span class="comment-item__meta-sep" aria-hidden="true">·</span>
                  <span>已编辑</span>
                </template>
              </time>
            </div>
          </header>

          <div
            v-if="showLikeButton || canEdit || (showReplyAction && !replying) || (isPlatformComment && comment.likes > 0)"
            class="comment-item__actions flex shrink-0 items-center gap-0.5"
          >
            <button
              v-if="showReplyAction && !replying"
              type="button"
              class="comment-reply-btn pointer-events-none inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-slate-400 opacity-0 transition-[opacity,color,background-color] duration-200 hover:bg-white/80 hover:text-blue-600 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 group-hover:pointer-events-auto group-hover:opacity-100"
              @click="emit('startReply')"
            >
              <MessageSquareReply class="h-3 w-3" aria-hidden="true" />
              回复
            </button>

            <button
              v-if="canEdit"
              type="button"
              class="comment-edit-btn pointer-events-none inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-slate-400 opacity-0 transition-[opacity,color,background-color] duration-200 hover:bg-white/80 hover:text-slate-600 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 group-hover:pointer-events-auto group-hover:opacity-100"
              @click="startEdit"
            >
              <PencilLine class="h-3 w-3" aria-hidden="true" />
              编辑
            </button>

            <button
              v-if="showLikeButton"
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
            <span
              v-else-if="isPlatformComment && comment.likes > 0"
              class="inline-flex h-6 items-center gap-0.5 px-1.5 text-[11px] font-medium text-slate-400"
            >
              <ThumbsUp class="h-3.5 w-3.5" aria-hidden="true" />
              <span class="tabular-nums">{{ comment.likes }}</span>
            </span>
          </div>
        </div>

        <p class="mt-1 whitespace-pre-wrap wrap-break-word text-[13px] leading-[1.65] text-slate-700">
          {{ comment.text }}
        </p>

        <div
          v-if="comment.images?.length"
          class="mt-2 flex flex-wrap gap-1.5"
        >
          <CommentImageThumb
            v-for="(image, index) in comment.images"
            :key="`${comment.id}-image-${index}`"
            :src="image"
            :source="imageSource"
            :alt="`评论图片 ${index + 1}`"
          />
        </div>

        <button
          v-if="showReplyToggle"
          type="button"
          class="mt-1.5 inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 -ml-1.5 text-[11px] font-medium text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
          @click="emit('toggleReplies')"
        >
          <component :is="replyExpanded ? ChevronUp : ChevronDown" class="h-3.5 w-3.5" aria-hidden="true" />
          <span class="tabular-nums">{{ replyCountLabel }}</span>
          条回复
        </button>

        <div
          v-if="isTopLevelInternal && (replyExpanded || replying)"
          class="comment-item__thread mt-2.5 overflow-visible rounded-xl border border-slate-200/70 bg-white/75 shadow-sm"
        >
          <div
            v-if="replyLoading"
            class="flex items-center justify-center gap-2 px-3 py-4 text-[12px] text-slate-500"
          >
            <Loader2 class="h-4 w-4 animate-spin text-blue-500" aria-hidden="true" />
            正在加载回复…
          </div>

          <div v-else-if="comment.internalReplies?.length" class="divide-y divide-slate-100 px-2.5 py-1">
            <CommentListItem
              v-for="reply in comment.internalReplies"
              :key="reply.id"
              :comment="reply"
              :self-color="selfColor"
              :submitting="submitting"
              embedded
              @like="emit('likeReply', reply)"
              @save-edit="(text) => emit('saveReplyEdit', reply.id, text)"
            />
          </div>

          <p
            v-else-if="replyExpanded && !replying"
            class="px-3 py-3 text-center text-[12px] text-slate-400"
          >
            暂无回复，来抢沙发吧
          </p>

          <button
            v-if="replyMore && comment.internalReplies?.length"
            type="button"
            class="w-full cursor-pointer border-t border-slate-200/70 px-3 py-2 text-[11px] font-medium text-slate-500 transition-colors duration-200 hover:bg-white/80 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="replyLoadingMore"
            @click="emit('loadMoreReplies')"
          >
            <span v-if="replyLoadingMore" class="inline-flex items-center justify-center gap-1.5">
              <Loader2 class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              加载中…
            </span>
            <span v-else>加载更多回复</span>
          </button>

          <div
            v-if="replying"
            class="bg-slate-50/50 px-3 py-3"
            :class="comment.internalReplies?.length || replyLoading ? 'border-t border-slate-200/70' : ''"
          >
            <div class="overflow-visible rounded-lg border border-slate-200/80 bg-white shadow-sm">
              <textarea
                ref="replyTextareaRef"
                v-model="replyDraft"
                rows="1"
                maxlength="200"
                placeholder="写下你的回复…"
                class="comment-edit-textarea w-full resize-none rounded-t-lg border-0 bg-transparent px-3 py-2 text-[12px] leading-[1.65] text-slate-700 outline-none focus:ring-0"
                @input="resizeReplyTextarea"
              />
              <div class="flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-1.5">
                <div class="flex min-w-0 items-center gap-1">
                  <CommentEmojiPicker @pick="insertReplyEmoji" />
                  <span
                    class="text-[11px] leading-none tabular-nums"
                    :class="replyDraft.length > 200 ? 'font-medium text-rose-500' : 'text-slate-400'"
                  >
                    {{ replyDraft.length }}/200
                  </span>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[11px] font-medium text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
                    @click="emit('cancelReply')"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11px] font-medium text-white transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="submitting || !replyDraft.trim() || replyDraft.length > 200"
                    @click="submitReplyDraft"
                  >
                    <Loader2 v-if="submitting" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    发送
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="isPlatformComment && comment.replies?.length"
          class="mt-3 space-y-2 rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-2"
        >
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {{ comment.replies.length }} 条回复
          </p>
          <div
            v-for="reply in comment.replies"
            :key="reply.id"
            class="flex gap-2 border-t border-slate-200/60 pt-2 first:border-t-0 first:pt-0"
          >
            <CommentProxiedImage
              v-if="reply.authorAvatar && comment.source === 'perfect'"
              :src="reply.authorAvatar"
              source="perfect"
              :alt="reply.authorName"
              class="h-6 w-6 shrink-0 rounded-md"
            />
            <PlayerAvatar
              v-else-if="reply.authorAvatar"
              :src="reply.authorAvatar"
              :alt="reply.authorName"
              size="xs"
              shape="rounded"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 text-[11px]">
                <div class="comment-item__meta min-w-0 flex-1">
                  <span class="text-[11px] font-semibold text-slate-700">{{ reply.authorName }}</span>
                  <span v-if="reply.replyToName" class="comment-item__meta-time shrink-0">
                    回复 {{ reply.replyToName }}
                  </span>
                  <template v-if="reply.region">
                    <span class="comment-item__meta-sep" aria-hidden="true">·</span>
                    <span class="comment-item__meta-region inline-flex shrink-0 items-baseline gap-0.5">
                      <MapPin class="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      {{ reply.region }}
                    </span>
                  </template>
                </div>
              </div>
              <p class="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">
                {{ reply.text }}
              </p>
              <div v-if="reply.image" class="mt-1.5">
                <CommentImageThumb
                  :src="reply.image"
                  :source="imageSource"
                  alt="回复图片"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="relative">
        <header class="mb-2 flex min-w-0 items-center gap-1.5">
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

        <div class="overflow-visible rounded-lg border border-slate-200/80 bg-white shadow-sm">
          <textarea
            ref="editTextareaRef"
            v-model="draft"
            rows="1"
            maxlength="200"
            class="comment-edit-textarea w-full resize-none rounded-t-lg border-0 bg-transparent px-3 py-2 text-[13px] leading-[1.65] text-slate-700 outline-none focus:ring-0"
            @input="resizeEditTextarea"
          />
          <div class="flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-1.5">
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
                class="inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[11px] font-medium text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
                @click="cancelEdit"
              >
                取消
              </button>
              <button
                type="button"
                class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11px] font-medium text-white transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  </article>
</template>

<style scoped>
.comment-item__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 0.25rem;
  row-gap: 0.125rem;
}

.comment-item__meta .comment-item__author {
  align-items: baseline;
}

.comment-item__meta-sep {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  color: rgb(203 213 225);
  user-select: none;
}

.comment-item__meta-time,
.comment-item__meta-region,
.comment-item__meta-floor {
  font-size: 11px;
  line-height: 1.35;
  color: rgb(148 163 184);
}

.comment-item__meta-region {
  font-size: 10px;
}

.comment-item__meta-region :deep(svg) {
  position: relative;
  top: 0.05em;
}

.comment-item__meta-floor {
  font-weight: 500;
}

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
  margin-top: 0;
}

.comment-edit-btn,
.comment-reply-btn {
  transition:
    opacity 0.2s ease,
    color 0.2s ease,
    background-color 0.2s ease;
}

.comment-edit-textarea {
  overflow-y: hidden;
  scrollbar-width: none;
  transition: height 0.2s ease-out;
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
  .comment-edit-btn,
  .comment-reply-btn {
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
