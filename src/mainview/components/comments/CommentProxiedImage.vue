<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { fetchProxiedImageDataUrl } from '@core/comments/platform-board';
import { PERFECT_MEDIA_REFERER } from '@core/comments/platform-board/perfect-board';

const props = withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    source?: 'perfect' | '5e' | 'internal';
    imgClass?: string;
  }>(),
  {
    alt: '图片',
  },
);

const resolvedSrc = ref('');
const failed = ref(false);
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

onBeforeUnmount(() => {
  requestId += 1;
});
</script>

<template>
  <img
    v-if="resolvedSrc && !failed"
    :src="resolvedSrc"
    :alt="alt"
    :class="imgClass"
    class="object-cover"
    loading="lazy"
    decoding="async"
  />
</template>
