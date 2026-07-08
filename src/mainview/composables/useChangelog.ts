import type { ChangelogReleaseDetail, ChangelogReleaseSummary } from '@core/update/changelog';
import { getChangelogRelease, listChangelogReleases } from '../native';
import { ref, shallowRef } from 'vue';

export type ChangelogDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; body: string }
  | { status: 'error'; message: string };

export function useChangelog() {
  const releases = shallowRef<ChangelogReleaseSummary[]>([]);
  const listLoading = ref(false);
  const listError = ref<string | null>(null);

  const details = ref<Record<string, ChangelogDetailState>>({});
  const detailInflight = new Map<string, Promise<void>>();

  async function loadList() {
    listLoading.value = true;
    listError.value = null;
    try {
      releases.value = await listChangelogReleases();
    } catch (err) {
      listError.value = err instanceof Error ? err.message : String(err);
      releases.value = [];
    } finally {
      listLoading.value = false;
    }
  }

  function getDetailState(tagName: string): ChangelogDetailState {
    return details.value[tagName] ?? { status: 'idle' };
  }

  async function loadDetail(tagName: string, options?: { force?: boolean }) {
    const key = tagName.trim();
    if (!key) return;

    const current = details.value[key];
    if (!options?.force && (current?.status === 'loading' || current?.status === 'ready')) {
      return;
    }

    const inflight = detailInflight.get(key);
    if (inflight && !options?.force) {
      await inflight;
      return;
    }

    details.value = { ...details.value, [key]: { status: 'loading' } };

    const task = (async () => {
      try {
        const detail: ChangelogReleaseDetail = await getChangelogRelease(key);
        details.value = {
          ...details.value,
          [key]: { status: 'ready', body: detail.body?.trim() ?? '' },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        details.value = { ...details.value, [key]: { status: 'error', message } };
      } finally {
        detailInflight.delete(key);
      }
    })();

    detailInflight.set(key, task);
    await task;
  }

  return {
    releases,
    listLoading,
    listError,
    details,
    loadList,
    loadDetail,
    getDetailState,
  };
}
