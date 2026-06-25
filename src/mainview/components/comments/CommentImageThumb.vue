<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { fetchProxiedImageDataUrl } from '@core/comments/platform-board';
import { PERFECT_MEDIA_REFERER } from '@core/comments/platform-board/perfect-board';

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    source?: 'perfect' | '5e' | 'internal';
  }>(),
  {
    alt: '评论图片',
    source: 'internal',
  },
);

const resolvedSrc = ref('');
const failed = ref(false);
const previewOpen = ref(false);
let requestId = 0;

async function resolveSrc() {
  const raw = props.src?.trim();
  requestId += 1;
  const current = requestId;
  failed.value = false;
  resolvedSrc.value = '';

  if (!raw) return;

  if (props.source === 'perfect') {
    try {
      const dataUrl = await fetchProxiedImageDataUrl(raw, PERFECT_MEDIA_REFERER);
      if (current !== requestId) return;
      resolvedSrc.value = dataUrl;
    } catch {
      if (current !== requestId) return;
      failed.value = true;
    }
    return;
  }

  resolvedSrc.value = raw;
}

watch(
  () => [props.src, props.source] as const,
  () => {
    void resolveSrc();
  },
  { immediate: true },
);

function openPreview() {
  if (!resolvedSrc.value || failed.value) return;
  previewOpen.value = true;
}

function closePreview() {
  previewOpen.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closePreview();
}

watch(previewOpen, (open) => {
  if (open) {
    window.addEventListener('keydown', onKeydown);
  } else {
    window.removeEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => {
  requestId += 1;
  window.removeEventListener('keydown', onKeydown);
});

onMounted(() => {
  if (previewOpen.value) window.addEventListener('keydown', onKeydown);
});
</script>

<template>
  <button
    v-if="resolvedSrc && !failed"
    type="button"
    class="comment-image-thumb inline-flex cursor-pointer overflow-hidden rounded-md border border-slate-200/80 bg-slate-100 transition-[box-shadow,border-color] duration-200 hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
    :aria-label="`预览${alt}`"
    @click="openPreview"
  >
    <img
      :src="resolvedSrc"
      :alt="alt"
      class="h-16 w-16 object-cover"
      loading="lazy"
      decoding="async"
    />
  </button>

  <Teleport to="body">
    <Transition name="comment-image-preview">
      <div
        v-if="previewOpen"
        class="fixed inset-0 z-[70] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="alt"
      >
        <button
          type="button"
          class="absolute inset-0 cursor-pointer border-0 bg-slate-900/72 backdrop-blur-[2px]"
          aria-label="关闭预览"
          @click="closePreview"
        />

        <div class="relative z-10 flex max-h-[min(90vh,920px)] max-w-[min(92vw,1100px)] items-center justify-center">
          <img
            :src="resolvedSrc"
            :alt="alt"
            class="max-h-[min(90vh,920px)] max-w-[min(92vw,1100px)] rounded-lg object-contain shadow-2xl"
            @click.stop
          />
          <button
            type="button"
            class="absolute -right-2 -top-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-slate-900/80 text-white transition-colors duration-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label="关闭预览"
            @click="closePreview"
          >
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.comment-image-preview-enter-active,
.comment-image-preview-leave-active {
  transition: opacity 0.2s ease;
}

.comment-image-preview-enter-active img,
.comment-image-preview-leave-active img {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.comment-image-preview-enter-from,
.comment-image-preview-leave-to {
  opacity: 0;
}

.comment-image-preview-enter-from img,
.comment-image-preview-leave-to img {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .comment-image-preview-enter-active,
  .comment-image-preview-leave-active,
  .comment-image-preview-enter-active img,
  .comment-image-preview-leave-active img {
    transition: none;
  }
}
</style>
