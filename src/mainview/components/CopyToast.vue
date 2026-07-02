<script setup lang="ts">
import { AlertCircle, Check, XCircle } from 'lucide-vue-next';
import { useCopyFeedback } from '../composables/useCopyFeedback';

const { toastMessage, toastVisible, toastVariant } = useCopyFeedback();
</script>

<template>
  <Transition name="copy-toast">
    <div
      v-if="toastVisible"
      class="pointer-events-none fixed bottom-6 left-1/2 z-100 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-slate-200/80 bg-white/95 px-4 py-2.5 text-[13px] font-medium text-slate-700 shadow-lg backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <Check
        v-if="toastVariant === 'success'"
        class="h-4 w-4 shrink-0 text-emerald-500"
        aria-hidden="true"
      />
      <AlertCircle
        v-else-if="toastVariant === 'warning'"
        class="h-4 w-4 shrink-0 text-amber-500"
        aria-hidden="true"
      />
      <XCircle
        v-else
        class="h-4 w-4 shrink-0 text-red-500"
        aria-hidden="true"
      />
      {{ toastMessage }}
    </div>
  </Transition>
</template>

<style scoped>
.copy-toast-enter-active,
.copy-toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.copy-toast-enter-from,
.copy-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
