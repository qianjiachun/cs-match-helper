<script setup lang="ts">
import { MessageCircle } from 'lucide-vue-next';
import { computed } from 'vue';
import { isValidSteamId64 } from '@core/comments/steam-id';

const props = defineProps<{
  steamId: string;
  count?: number;
}>();

const emit = defineEmits<{
  open: [];
}>();

const enabled = computed(() => isValidSteamId64(props.steamId));
const displayCount = computed(() => props.count ?? 0);
const hasComments = computed(() => displayCount.value > 0);

const countLabel = computed(() =>
  displayCount.value > 99 ? '99+' : String(displayCount.value),
);

const label = computed(() =>
  hasComments.value ? `查看 ${displayCount.value} 条评论` : '查看或发表评论',
);

function onClick() {
  if (!enabled.value) return;
  emit('open');
}
</script>

<template>
  <button
    v-if="enabled"
    type="button"
    class="comment-badge ml-1.5 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-semibold leading-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
    :class="
      hasComments
        ? 'comment-badge--active text-blue-500 hover:bg-blue-50/60 hover:text-blue-600'
        : 'comment-badge--idle text-slate-400 opacity-0 hover:bg-blue-50/60 hover:text-blue-500 focus-visible:opacity-100 group-hover:opacity-100'
    "
    :title="label"
    :aria-label="label"
    @click.stop="onClick"
  >
    <MessageCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span v-if="hasComments" class="min-w-2 tabular-nums">{{ countLabel }}</span>
  </button>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .comment-badge {
    transition-duration: 0.01ms;
  }
}
</style>
