<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}>();

const emit = defineEmits<{
  'update:currentPage': [number];
}>();

const pageInput = ref(String(props.currentPage));

const rangeLabel = computed(() => {
  if (props.totalCount === 0) return '0';
  const start = (props.currentPage - 1) * props.pageSize + 1;
  const end = Math.min(props.currentPage * props.pageSize, props.totalCount);
  return `${start}–${end}`;
});

const pageInputWidthClass = computed(() => {
  const digits = String(props.totalPages).length;
  if (digits >= 3) return 'w-8';
  if (digits >= 2) return 'w-7';
  return 'w-6';
});

watch(
  () => props.currentPage,
  (page) => {
    pageInput.value = String(page);
  },
);

function goTo(page: number) {
  const next = Math.min(Math.max(1, page), props.totalPages);
  if (next !== props.currentPage) {
    emit('update:currentPage', next);
  }
  pageInput.value = String(next);
}

function commitPageInput() {
  const raw = pageInput.value.trim();
  if (!raw) {
    pageInput.value = String(props.currentPage);
    return;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    pageInput.value = String(props.currentPage);
    return;
  }
  goTo(parsed);
}

function onPageInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitPageInput();
    (event.target as HTMLInputElement).blur();
  }
}
</script>

<template>
  <div
    v-if="totalPages > 1"
    class="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
  >
    <p class="text-[13px] leading-relaxed text-slate-500">
      显示
      <span class="font-semibold tabular-nums text-slate-700">{{ rangeLabel }}</span>
      条，共
      <span class="font-semibold tabular-nums text-slate-700">{{ totalCount }}</span>
      条
    </p>

    <div
      class="inline-flex items-center gap-0.5 self-start rounded-xl bg-white p-1 ring-1 ring-slate-200/60 sm:self-auto"
      role="navigation"
      aria-label="分页"
    >
      <button
        type="button"
        class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] duration-200 hover:bg-slate-50 hover:text-slate-700 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
        :disabled="currentPage <= 1"
        aria-label="上一页"
        @click="goTo(currentPage - 1)"
      >
        <ChevronLeft class="h-4 w-4" aria-hidden="true" />
      </button>

      <div class="flex items-center px-2.5">
        <input
          v-model="pageInput"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          class="h-6 cursor-text rounded bg-transparent px-0 text-center text-[12px] font-semibold tabular-nums text-slate-800 outline-none ring-1 ring-slate-200/70 transition-[background-color,box-shadow] duration-200 focus:bg-slate-50 focus:ring-2 focus:ring-accent/20"
          :class="pageInputWidthClass"
          :aria-label="`第 ${currentPage} 页，共 ${totalPages} 页`"
          @keydown="onPageInputKeydown"
          @blur="commitPageInput"
        />
        <span class="mx-2 text-[12px] leading-none text-slate-300" aria-hidden="true">/</span>
        <span class="min-w-[1ch] text-[12px] font-medium leading-none tabular-nums text-slate-500">
          {{ totalPages }}
        </span>
      </div>

      <button
        type="button"
        class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] duration-200 hover:bg-slate-50 hover:text-slate-700 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
        :disabled="currentPage >= totalPages"
        aria-label="下一页"
        @click="goTo(currentPage + 1)"
      >
        <ChevronRight class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
