<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { onMounted, onUnmounted } from 'vue';
import appIcon from '@app-icon';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('cancel');
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('cancel');
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="close-confirm-dialog">
      <div
        v-if="open"
        class="fixed inset-0 z-210 flex items-center justify-center bg-fg/28 p-4 backdrop-blur-[3px]"
        role="presentation"
        @click="onBackdropClick"
      >
        <div
          class="w-full max-w-[360px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-fg/8"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="close-confirm-title"
        >
          <header class="relative shrink-0 overflow-hidden border-b border-border-subtle">
            <div
              class="pointer-events-none absolute inset-0 bg-linear-to-br from-accent/8 via-transparent to-transparent"
              aria-hidden="true"
            />
            <button
              type="button"
              class="absolute right-3 top-3 z-10 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              aria-label="取消"
              @click="emit('cancel')"
            >
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
            <div class="relative flex flex-col items-center px-5 pb-5 pt-6 text-center">
              <img
                :src="appIcon"
                alt=""
                class="h-11 w-11 shrink-0 rounded-2xl border-0 object-cover outline-none"
                aria-hidden="true"
              />
              <h2
                id="close-confirm-title"
                class="mt-3 text-[17px] font-semibold tracking-tight text-fg-secondary"
              >
                确定退出
              </h2>
            </div>
          </header>

          <footer
            class="flex items-center justify-center gap-2 border-t border-border-subtle bg-elevated/35 px-5 py-4"
          >
            <button
              type="button"
              class="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              @click="emit('cancel')"
            >
              取消
            </button>
            <button
              type="button"
              class="inline-flex cursor-pointer items-center justify-center rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-accent/20 transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              @click="emit('confirm')"
            >
              退出
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.close-confirm-dialog-enter-active,
.close-confirm-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.close-confirm-dialog-enter-active > div,
.close-confirm-dialog-leave-active > div {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.close-confirm-dialog-enter-from,
.close-confirm-dialog-leave-to {
  opacity: 0;
}

.close-confirm-dialog-enter-from > div,
.close-confirm-dialog-leave-to > div {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .close-confirm-dialog-enter-active,
  .close-confirm-dialog-leave-active,
  .close-confirm-dialog-enter-active > div,
  .close-confirm-dialog-leave-active > div {
    transition: none;
  }
}
</style>
