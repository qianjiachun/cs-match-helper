import type { MatchRecord } from '@core/match/models';
import type { AiAnalysisResult, AiProviderMode, AiTokenUsage } from '@core/ai/types';
import {
  aiResultToAiSection,
  buildDocumentFromMatch,
  documentToListItem,
  documentToViewModel,
  HISTORY_SECTION_AI,
  migrateDocument,
  migrateIndex,
  type AiHistoryStatus,
  type MatchHistoryIndexItemV2,
  type MatchHistoryIndexV2,
  type MatchHistoryListItem,
  type MatchHistoryViewModel,
} from '@core/match/history';
import {
  clearMatchHistory as clearMatchHistoryNative,
  deleteMatchHistoryEntry,
  getMatchHistoryEntry,
  listMatchHistoryDocuments,
  patchMatchHistorySection,
  upsertMatchHistoryEntry,
} from '@core/match/history/native';
import { sortHistoryItemsNewestFirst } from '../utils/matchHistoryDisplay';
import { shallowRef } from 'vue';

function platformOf(record: MatchRecord): string {
  return record.platformId ?? record.detail.platformId ?? 'unknown';
}

class WriteQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

const writeQueue = new WriteQueue();

export function useMatchHistory() {
  const index = shallowRef<MatchHistoryIndexV2 | null>(null);
  const listItems = shallowRef<MatchHistoryListItem[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef<string | null>(null);

  function applyIndex(raw: unknown) {
    index.value = migrateIndex(raw);
    return index.value;
  }

  function rebuildListFromDocuments(docs: unknown[]) {
    const items: MatchHistoryListItem[] = [];
    for (const raw of docs) {
      const { document, unsupportedSections } = migrateDocument(raw);
      if (!document.id || !document.platformId) continue;
      items.push(documentToListItem(document, unsupportedSections));
    }
    listItems.value = sortHistoryItemsNewestFirst(items);
    return listItems.value;
  }

  async function refreshList() {
    loading.value = true;
    error.value = null;
    try {
      const docs = await listMatchHistoryDocuments();
      rebuildListFromDocuments(docs);
      // 同步瘦 index（删改后列表与 index 一致）
      index.value = {
        schemaVersion: 2,
        entries: listItems.value.map((item) => ({
          id: item.id,
          platformId: item.platformId,
          savedAt: item.savedAt,
          updatedAt: item.updatedAt,
        })),
      };
      return listItems.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** @deprecated 使用 refreshList */
  async function refreshIndex() {
    return refreshList();
  }

  async function saveMatchSnapshot(record: MatchRecord, options?: { savedAt?: number }) {
    return writeQueue.enqueue(async () => {
      const now = options?.savedAt ?? Date.now();
      const doc = buildDocumentFromMatch(record, { includeEmptyAi: false, now });
      const raw = await upsertMatchHistoryEntry(doc);
      applyIndex(raw);
      // 增量更新内存列表，避免整表重读；失败时不影响主流程
      const { document, unsupportedSections } = migrateDocument(doc);
      const item = documentToListItem(document, unsupportedSections);
      const next = listItems.value.filter(
        (x) => !(x.id === item.id && x.platformId === item.platformId),
      );
      listItems.value = sortHistoryItemsNewestFirst([item, ...next]);
    });
  }

  async function patchMatchAi(
    matchId: string,
    platformId: string,
    input: {
      status: AiHistoryStatus;
      result?: AiAnalysisResult | null;
      usage?: AiTokenUsage | null;
      elapsedMs?: number | null;
      error?: string | null;
      model?: string;
      providerMode?: AiProviderMode | string;
      analyzedAt?: number;
      fallbackRecord?: MatchRecord | null;
    },
  ) {
    return writeQueue.enqueue(async () => {
      const section = aiResultToAiSection({
        status: input.status,
        result: input.result,
        usage: input.usage,
        elapsedMs: input.elapsedMs,
        error: input.error,
        model: input.model,
        providerMode: input.providerMode,
        analyzedAt: input.analyzedAt,
      });

      try {
        const raw = await patchMatchHistorySection(platformId, matchId, HISTORY_SECTION_AI, section);
        applyIndex(raw);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!message.includes('不存在') || !input.fallbackRecord) {
          throw e;
        }
        await upsertMatchHistoryEntry(
          buildDocumentFromMatch(input.fallbackRecord, { includeEmptyAi: false }),
        );
        const raw = await patchMatchHistorySection(platformId, matchId, HISTORY_SECTION_AI, section);
        applyIndex(raw);
      }

      // 用最新 entry 重算该条列表项
      const entryRaw = await getMatchHistoryEntry(platformId, matchId);
      if (entryRaw) {
        const { document, unsupportedSections } = migrateDocument(entryRaw);
        const item = documentToListItem(document, unsupportedSections);
        const next = listItems.value.filter(
          (x) => !(x.id === item.id && x.platformId === item.platformId),
        );
        listItems.value = sortHistoryItemsNewestFirst([item, ...next]);
      }
    });
  }

  async function loadEntry(platformId: string, id: string): Promise<MatchHistoryViewModel | null> {
    const raw = await getMatchHistoryEntry(platformId, id);
    if (!raw) return null;
    const { document, unsupportedSections } = migrateDocument(raw);
    return documentToViewModel(document, unsupportedSections);
  }

  async function removeEntry(item: Pick<MatchHistoryIndexItemV2, 'platformId' | 'id'>) {
    const raw = await deleteMatchHistoryEntry(item.platformId, item.id);
    applyIndex(raw);
    listItems.value = listItems.value.filter(
      (x) => !(x.id === item.id && x.platformId === item.platformId),
    );
  }

  async function clearAll() {
    const raw = await clearMatchHistoryNative();
    applyIndex(raw);
    listItems.value = [];
  }

  return {
    index,
    listItems,
    loading,
    error,
    refreshList,
    refreshIndex,
    saveMatchSnapshot,
    patchMatchAi,
    loadEntry,
    removeEntry,
    clearAll,
    platformOf,
  };
}

export type MatchHistoryApi = ReturnType<typeof useMatchHistory>;
