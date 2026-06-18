<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { Smile } from 'lucide-vue-next';
import { COMMENT_EMOJI_GROUPS } from '@core/comments/emoji-groups';

const emit = defineEmits<{
  pick: [emoji: string];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function onPick(emoji: string) {
  emit('pick', emoji);
  close();
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (target && rootRef.value?.contains(target)) return;
  close();
}

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

watch(open, (value) => {
  if (value) {
    window.addEventListener('keydown', onEscape);
  } else {
    window.removeEventListener('keydown', onEscape);
  }
});

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  window.removeEventListener('keydown', onEscape);
});
</script>

<template>
  <div ref="rootRef" class="relative shrink-0">
    <button
      type="button"
      class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-[color,background-color,transform] duration-200 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
      :class="open ? 'bg-blue-50 text-blue-500' : ''"
      :aria-expanded="open"
      aria-haspopup="dialog"
      aria-label="插入表情"
      title="插入表情"
      @click="toggle"
    >
      <Smile class="h-4 w-4" aria-hidden="true" />
    </button>

    <Transition name="emoji-picker">
      <div
        v-if="open"
        ref="panelRef"
        class="emoji-picker-panel absolute bottom-full left-0 z-20 mb-2 w-[248px] rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-lg shadow-slate-900/10"
        role="dialog"
        aria-label="选择表情"
        @pointerdown.stop
      >
        <div
          v-for="(group, groupIndex) in COMMENT_EMOJI_GROUPS"
          :key="group.label"
          :class="groupIndex > 0 ? 'mt-2 border-t border-slate-100 pt-2' : ''"
        >
          <p class="mb-1.5 px-0.5 text-[10px] font-medium leading-none text-slate-400">
            {{ group.label }}
          </p>
          <div class="grid grid-cols-8 gap-0.5">
            <button
              v-for="(emoji, emojiIndex) in group.emojis"
              :key="`${group.label}-${emoji}`"
              type="button"
              class="emoji-picker-cell inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[17px] leading-none transition-[background-color,transform] duration-150 hover:bg-slate-100 active:scale-95"
              :style="{ '--emoji-delay': `${groupIndex * 40 + emojiIndex * 18}ms` }"
              :aria-label="`插入 ${emoji}`"
              @click="onPick(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.emoji-picker-enter-active {
  transition:
    opacity 0.22s cubic-bezier(0.32, 0.72, 0, 1),
    transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
}

.emoji-picker-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.emoji-picker-enter-from,
.emoji-picker-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
  transform-origin: bottom left;
}

.emoji-picker-enter-active .emoji-picker-cell {
  animation: emoji-cell-in 0.28s cubic-bezier(0.32, 0.72, 0, 1) backwards;
  animation-delay: var(--emoji-delay, 0ms);
}

@keyframes emoji-cell-in {
  from {
    opacity: 0;
    transform: scale(0.72);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .emoji-picker-enter-active,
  .emoji-picker-leave-active {
    transition-duration: 0.01ms;
  }

  .emoji-picker-enter-active .emoji-picker-cell {
    animation: none;
  }

  .emoji-picker-cell:active {
    transform: none;
  }
}
</style>
