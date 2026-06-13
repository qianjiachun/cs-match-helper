<script setup lang="ts">
import { ChevronDown, ChevronUp, Columns3, GripVertical, RotateCcw, X } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useColumnListDrag } from '../composables/useColumnListDrag';
import {
  TEAM_TABLE_COLUMN_CATEGORIES,
  type TeamTableColumnDef,
  type TeamTableColumnKey,
} from './team-table-columns';

const props = defineProps<{
  open: boolean;
  items: TeamTableColumnDef[];
  visibleKeys: TeamTableColumnKey[];
}>();

const emit = defineEmits<{
  close: [];
  toggle: [key: TeamTableColumnKey, visible: boolean];
  setOrder: [order: TeamTableColumnKey[]];
  reset: [];
}>();

const draggableKeys = ref<TeamTableColumnKey[]>([]);
const pendingCommit = ref(false);

const visibleCount = computed(() => props.visibleKeys.length);

const fixedColumn = computed(() => props.items.find((col) => col.fixed) ?? null);

const columnMap = computed(() => new Map(props.items.map((col) => [col.key, col])));

function sameKeys(a: TeamTableColumnKey[], b: TeamTableColumnKey[]) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function readDraggableKeysFromProps() {
  return props.items.filter((col) => !col.fixed).map((col) => col.key);
}

function syncDraggableKeysFromProps() {
  const next = readDraggableKeysFromProps();
  if (!sameKeys(next, draggableKeys.value)) {
    draggableKeys.value = next;
  }
}

function fullOrderFromDraggable(keys: TeamTableColumnKey[]) {
  return ['nickname' as const, ...keys];
}

function commitOrder() {
  const order = fullOrderFromDraggable(draggableKeys.value);
  const current = fullOrderFromDraggable(readDraggableKeysFromProps());
  if (sameKeys(order, current)) {
    pendingCommit.value = false;
    return;
  }
  pendingCommit.value = true;
  emit('setOrder', order);
}

const { isDragging, rowStyle, setRowRef, onGripPointerDown } = useColumnListDrag(
  draggableKeys,
  commitOrder,
);

function moveLocal(key: TeamTableColumnKey, direction: -1 | 1) {
  const keys = [...draggableKeys.value];
  const idx = keys.indexOf(key);
  if (idx < 0) return;
  const next = idx + direction;
  if (next < 0 || next >= keys.length) return;
  [keys[idx], keys[next]] = [keys[next], keys[idx]];
  draggableKeys.value = keys;
  commitOrder();
}

async function onReset() {
  emit('reset');
  await nextTick();
  syncDraggableKeysFromProps();
}

function categoryLabel(category: TeamTableColumnDef['category']) {
  return TEAM_TABLE_COLUMN_CATEGORIES[category];
}

function isVisible(key: TeamTableColumnKey) {
  return props.visibleKeys.includes(key);
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      pendingCommit.value = false;
      syncDraggableKeysFromProps();
    }
  },
);

watch(
  () => props.items,
  () => {
    if (!props.open || pendingCommit.value) return;
    syncDraggableKeysFromProps();
  },
);

watch(pendingCommit, async (pending) => {
  if (!pending) return;
  await nextTick();
  pendingCommit.value = false;
});

onMounted(() => {
  syncDraggableKeysFromProps();
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="column-customizer">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click="onBackdropClick"
      >
        <div
          class="flex max-h-[min(86vh,640px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10"
          role="dialog"
          aria-modal="true"
          aria-labelledby="column-customizer-title"
        >
          <header class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Columns3 class="h-4 w-4" aria-hidden="true" />
                </span>
                <h2 id="column-customizer-title" class="text-[16px] font-semibold text-slate-900">
                  自定义列
                </h2>
              </div>
              <p class="mt-1.5 text-[12px] leading-relaxed text-slate-500">
                勾选要展示的列，拖拽或使用箭头调整顺序。设置将保存在本机。
              </p>
            </div>
            <button
              type="button"
              class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
              aria-label="关闭"
              @click="emit('close')"
            >
              <X class="h-4 w-4" />
            </button>
          </header>

          <div class="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5">
            <span class="text-[12px] text-slate-500">
              已显示 <b class="font-semibold text-slate-800">{{ visibleCount }}</b> 列
            </span>
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition-colors duration-200 hover:bg-white hover:text-slate-900"
              @click="onReset"
            >
              <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
              恢复默认
            </button>
          </div>

          <div class="column-customizer-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <ul class="m-0 list-none space-y-1 p-0">
              <li
                v-if="fixedColumn"
                class="flex items-center gap-2 rounded-xl border border-transparent bg-slate-50/60 px-2 py-2"
              >
                <span
                  class="flex h-8 w-6 shrink-0 items-center justify-center text-slate-300 opacity-30"
                  aria-hidden="true"
                >
                  <span class="h-4 w-4" />
                </span>
                <label class="flex min-w-0 flex-1 cursor-default items-center gap-3">
                  <input
                    type="checkbox"
                    class="h-4 w-4 shrink-0 cursor-default rounded border-slate-300 text-blue-600"
                    checked
                    disabled
                  />
                  <span class="min-w-0">
                    <span class="flex items-center gap-2">
                      <span class="truncate text-[13px] font-medium text-slate-800">{{ fixedColumn.label }}</span>
                      <span class="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {{ categoryLabel(fixedColumn.category) }}
                      </span>
                    </span>
                  </span>
                </label>
              </li>

              <li
                v-for="(key, index) in draggableKeys"
                :key="key"
                :ref="(el) => setRowRef(key, el)"
                class="column-customizer-row group flex items-center gap-2 rounded-xl border border-transparent px-2 py-2 hover:border-slate-200 hover:bg-slate-50"
                :class="isDragging(key) ? 'border-slate-200 bg-white shadow-lg shadow-slate-900/10' : ''"
                :style="rowStyle(key, index)"
              >
                <span
                  class="column-customizer-grip flex h-8 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center text-slate-400 active:cursor-grabbing group-hover:text-slate-500"
                  aria-hidden="true"
                  @pointerdown="onGripPointerDown(key, index, $event)"
                >
                  <GripVertical class="h-4 w-4" />
                </span>

                <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    class="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    :checked="isVisible(key)"
                    @change="emit('toggle', key, ($event.target as HTMLInputElement).checked)"
                  />
                  <span class="min-w-0">
                    <span class="flex items-center gap-2">
                      <span class="truncate text-[13px] font-medium text-slate-800">
                        {{ columnMap.get(key)?.label }}
                      </span>
                      <span
                        v-if="columnMap.get(key)"
                        class="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                      >
                        {{ categoryLabel(columnMap.get(key)!.category) }}
                      </span>
                    </span>
                    <span
                      v-if="columnMap.get(key)?.description"
                      class="block truncate text-[11px] text-slate-400"
                    >
                      {{ columnMap.get(key)?.description }}
                    </span>
                  </span>
                </label>

                <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-white hover:text-slate-700"
                    aria-label="上移"
                    @click="moveLocal(key, -1)"
                  >
                    <ChevronUp class="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-white hover:text-slate-700"
                    aria-label="下移"
                    @click="moveLocal(key, 1)"
                  >
                    <ChevronDown class="h-4 w-4" />
                  </button>
                </div>
              </li>
            </ul>
          </div>

          <footer class="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
            <button
              type="button"
              class="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-blue-700"
              @click="emit('close')"
            >
              完成
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.column-customizer-scroll {
  overflow-anchor: none;
}

.column-customizer-row {
  will-change: transform;
}

.column-customizer-enter-active,
.column-customizer-leave-active {
  transition: opacity 0.2s ease;
}

.column-customizer-enter-active > div,
.column-customizer-leave-active > div {
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}

.column-customizer-enter-from,
.column-customizer-leave-to {
  opacity: 0;
}

.column-customizer-enter-from > div,
.column-customizer-leave-to > div {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .column-customizer-row {
    transition: none !important;
    will-change: auto;
  }

  .column-customizer-enter-active,
  .column-customizer-leave-active,
  .column-customizer-enter-active > div,
  .column-customizer-leave-active > div {
    transition: none;
  }
}
</style>
