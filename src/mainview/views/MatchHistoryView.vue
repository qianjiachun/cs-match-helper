<script setup lang="ts">
import type { MatchHistoryListItem, MatchHistoryViewModel } from '@core/match/history';
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import MatchFeaturedPanel from '../components/MatchFeaturedPanel.vue';
import MatchHistoryEmptyState from '../components/match-history/MatchHistoryEmptyState.vue';
import MatchHistoryListRow from '../components/match-history/MatchHistoryListRow.vue';
import MatchHistoryListShell, {
  type PlatformFilter,
} from '../components/match-history/MatchHistoryListShell.vue';
import MatchHistoryPagination from '../components/match-history/MatchHistoryPagination.vue';
import { useAiAnalysis } from '../composables/useAiAnalysis';
import type { MatchHistoryApi } from '../composables/useMatchHistory';
import type { useComments } from '../composables/useComments';
import {
  historyPrimaryMapTitle,
  matchesPlatformFilter,
  sortHistoryItemsNewestFirst,
} from '../utils/matchHistoryDisplay';

const PAGE_SIZE = 20;

const props = defineProps<{
  history: MatchHistoryApi;
  comments: ReturnType<typeof useComments>;
  /** 历史 Tab 是否可见；用于在显示后再触发列表入场动画 */
  visible?: boolean;
}>();

const emit = defineEmits<{
  openSettings: [];
}>();

const filter = ref<PlatformFilter>('all');
const currentPage = ref(1);
const listShellRef = ref<InstanceType<typeof MatchHistoryListShell> | null>(null);
const selectedKey = ref<string | null>(null);
const detailVm = shallowRef<MatchHistoryViewModel | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);
const deleteConfirmItem = ref<MatchHistoryListItem | null>(null);
const detailReady = ref(false);
const listRevealKey = ref(0);

watch(
  () => props.visible,
  (visible) => {
    if (visible !== false) {
      listRevealKey.value += 1;
    }
  },
  { immediate: true },
);

const detailAi = useAiAnalysis({
  autoInit: false,
  onAnalysisSettled: (payload) => {
    const vm = detailVm.value;
    const platformId =
      vm?.document.platformId ??
      vm?.record?.platformId ??
      vm?.record?.detail.platformId ??
      'unknown';
    void props.history
      .patchMatchAi(payload.matchId, platformId, {
        status: payload.status,
        result: payload.result,
        usage: payload.usage,
        elapsedMs: payload.elapsedMs,
        error: payload.error,
        model: payload.model,
        providerMode: payload.providerMode,
        analyzedAt: payload.analyzedAt,
        fallbackRecord: vm?.record ?? null,
      })
      .catch(() => {
        // 历史写入失败不阻断 AI 展示
      });
  },
});

const filteredEntries = computed(() => {
  const list = props.history.listItems.value.filter((item) =>
    matchesPlatformFilter(item.platformId, filter.value),
  );
  return sortHistoryItemsNewestFirst(list);
});

const totalCount = computed(() => filteredEntries.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)));

const pagedEntries = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredEntries.value.slice(start, start + PAGE_SIZE);
});

watch(filter, () => {
  currentPage.value = 1;
});

watch([currentPage, filter], () => {
  void nextTick(() => listShellRef.value?.scrollToTop());
});

watch(totalPages, (pages) => {
  if (currentPage.value > pages) {
    currentPage.value = pages;
  }
});

function entryKey(item: Pick<MatchHistoryListItem, 'platformId' | 'id'>): string {
  return `${item.platformId}::${item.id}`;
}

async function openEntry(item: MatchHistoryListItem) {
  selectedKey.value = entryKey(item);
  detailLoading.value = true;
  detailError.value = null;
  detailVm.value = null;
  detailReady.value = false;
  try {
    const vm = await props.history.loadEntry(item.platformId, item.id);
    if (!vm || !vm.record) {
      detailError.value = vm?.unsupportedSections.includes('match')
        ? '数据格式较新，请升级客户端后查看'
        : '无法加载该对局详情';
      return;
    }
    detailVm.value = vm;
    await detailAi.ensureSettingsLoaded();
    detailAi.hydrateFromHistory(vm.document.id, vm.ai);
    detailReady.value = true;
  } catch (e) {
    detailError.value = e instanceof Error ? e.message : String(e);
  } finally {
    detailLoading.value = false;
  }
}

async function backToList() {
  const s = detailAi.status.value;
  if (s === 'loading' || s === 'streaming') {
    await detailAi.stop();
  }
  selectedKey.value = null;
  detailVm.value = null;
  detailReady.value = false;
  detailError.value = null;
}

function goBack(): boolean {
  if (selectedKey.value) {
    void backToList();
    return true;
  }
  return false;
}

defineExpose({ goBack });

function requestRemoveItem(item: MatchHistoryListItem, event?: Event) {
  event?.stopPropagation();
  deleteConfirmItem.value = item;
}

async function confirmRemoveItem() {
  const item = deleteConfirmItem.value;
  if (!item) return;
  deleteConfirmItem.value = null;
  await props.history.removeEntry(item);
  if (selectedKey.value === entryKey(item)) {
    await backToList();
  }
  if (pagedEntries.value.length === 0 && currentPage.value > 1) {
    currentPage.value -= 1;
  }
}

onMounted(() => {
  void props.history.refreshList();
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <template v-if="!selectedKey">
      <MatchHistoryListShell
        ref="listShellRef"
        v-model:filter="filter"
        :total-count="totalCount"
        :loading="history.loading.value && !history.listItems.value.length"
      >
        <div
          v-if="history.loading.value && !history.listItems.value.length"
          class="space-y-3"
        >
          <div
            v-for="i in 4"
            :key="i"
            class="h-[88px] animate-pulse rounded-2xl bg-white/80 ring-1 ring-slate-200/60"
          />
        </div>
        <div v-else-if="history.error.value" class="py-20 text-center text-[13px] text-rose-600">
          {{ history.error.value }}
        </div>
        <MatchHistoryEmptyState v-else-if="!filteredEntries.length" />
        <template v-else>
          <TransitionGroup
            :key="`${listRevealKey}:${filter}:${currentPage}`"
            name="history-row"
            tag="ul"
            appear
            class="flex flex-col gap-3"
          >
            <MatchHistoryListRow
              v-for="(item, index) in pagedEntries"
              :key="entryKey(item)"
              v-memo="[item.id, item.platformId, item.updatedAt, item.mapName, item.matchAvgScore, item.aiStatus]"
              :item="item"
              :stagger-index="index"
              @open="openEntry(item)"
              @remove="requestRemoveItem(item, $event)"
            />
          </TransitionGroup>

          <MatchHistoryPagination
            v-model:current-page="currentPage"
            :total-count="totalCount"
            :total-pages="totalPages"
            :page-size="PAGE_SIZE"
          />
        </template>
      </MatchHistoryListShell>
    </template>

    <template v-else>
      <div class="flex h-full min-h-0 flex-col bg-[#F1F5F9]">
        <div
          v-if="detailVm?.unsupportedSections.length"
          class="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-700"
        >
          部分数据格式较新，请升级客户端后查看完整内容
        </div>

        <div class="min-h-0 flex-1 overflow-hidden">
          <div v-if="detailLoading" class="flex h-full items-center justify-center text-[13px] text-slate-500">
            加载详情…
          </div>
          <div v-else-if="detailError" class="flex h-full items-center justify-center text-[13px] text-rose-600">
            {{ detailError }}
          </div>
          <MatchFeaturedPanel
            v-else-if="detailVm?.record && detailReady"
            history-mode
            :match="detailVm.record"
            :ai="detailAi"
            :comments="comments"
            @open-settings="emit('openSettings')"
          />
        </div>
      </div>
    </template>

    <!-- 单条删除确认 -->
    <div
      v-if="deleteConfirmItem"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]"
      @click.self="deleteConfirmItem = null"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
        <h2 class="text-[15px] font-semibold text-slate-900">删除这条对局记录？</h2>
        <p class="mt-1.5 text-[12px] leading-relaxed text-slate-500">
          将删除「{{ historyPrimaryMapTitle(deleteConfirmItem) }}」的本地快照，此操作不可恢复。
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
            @click="deleteConfirmItem = null"
          >
            取消
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-lg bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-rose-700 active:scale-[0.96]"
            @click="confirmRemoveItem"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
