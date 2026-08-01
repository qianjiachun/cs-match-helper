import { computed, ref, watch, type Ref } from 'vue';
import type { MatchPlatformId } from '@core/match/models';
import {
  getDefaultColumnOrder,
  getDefaultVisibleColumnKeys,
  getStorageKeyForPlatform,
  getTeamTableColumnDefs,
  getTeamTableColumnMap,
  type TeamTableColumnDef,
  type TeamTableColumnKey,
  type TeamTablePlatformId,
} from '../components/team-table-columns';

const STORAGE_VERSION = 9;

interface StoredColumnPrefs {
  version: number;
  order: TeamTableColumnKey[];
  visible: TeamTableColumnKey[];
}

function toTablePlatformId(platformId?: MatchPlatformId): TeamTablePlatformId {
  return platformId === '5e' ? '5e' : 'perfect';
}

function isColumnKey(value: unknown, platformId: TeamTablePlatformId): value is TeamTableColumnKey {
  return typeof value === 'string' && getTeamTableColumnMap(platformId).has(value as TeamTableColumnKey);
}

function normalizePrefs(raw: StoredColumnPrefs, platformId: TeamTablePlatformId): StoredColumnPrefs {
  const allKeys = getDefaultColumnOrder(platformId);
  const known = new Set(allKeys);
  const migratePerfectWe = platformId === 'perfect' && raw.version < 8;
  const migratePerfectLayout = platformId === 'perfect' && raw.version < STORAGE_VERSION;
  const previousSeasonWeVisible = migratePerfectWe && raw.visible.includes('weAvg');
  let migratedOrder = migratePerfectWe
    ? raw.order.filter((key) => key !== 'weAvg' && key !== 'seasonWe')
    : raw.order;
  if (migratePerfectWe) {
    const mapPoolIndex = migratedOrder.indexOf('mapPool');
    migratedOrder.splice(mapPoolIndex >= 0 ? mapPoolIndex + 1 : migratedOrder.length, 0, 'weAvg');
  }
  if (migratePerfectLayout) {
    migratedOrder = migratedOrder.filter((key) => key !== 'primaryWeapon' && key !== 'seasonWinRate');
    const mapPoolIndex = migratedOrder.indexOf('mapPool');
    migratedOrder.splice(mapPoolIndex >= 0 ? mapPoolIndex + 1 : migratedOrder.length, 0, 'primaryWeapon');
    const seasonTotalIndex = migratedOrder.indexOf('seasonTotalNum');
    migratedOrder.splice(seasonTotalIndex >= 0 ? seasonTotalIndex + 1 : migratedOrder.length, 0, 'seasonWinRate');
  }

  const order = [
    ...migratedOrder.filter((key) => known.has(key)),
    ...allKeys.filter((key) => !migratedOrder.includes(key)),
  ];

  const visibleSet = new Set(raw.visible.filter((key) => known.has(key) && key !== 'nickname' && (!migratePerfectWe || key !== 'weAvg')));
  visibleSet.add('nickname');
  if (migratePerfectWe) visibleSet.add('weAvg');
  if (previousSeasonWeVisible) visibleSet.add('seasonWe');
  if (migratePerfectLayout) {
    visibleSet.delete('seasonWinRate');
    visibleSet.add('primaryWeapon');
  }

  const visible = order.filter((key) => visibleSet.has(key));
  if (!visible.length) {
    return {
      version: STORAGE_VERSION,
      order: allKeys,
      visible: getDefaultVisibleColumnKeys(platformId),
    };
  }

  return { version: STORAGE_VERSION, order, visible };
}

function loadPrefs(platformId: TeamTablePlatformId): StoredColumnPrefs {
  const fallback: StoredColumnPrefs = {
    version: STORAGE_VERSION,
    order: getDefaultColumnOrder(platformId),
    visible: getDefaultVisibleColumnKeys(platformId),
  };

  try {
    const raw = localStorage.getItem(getStorageKeyForPlatform(platformId))
      ?? localStorage.getItem(`cs-match-helper.team-table-columns-v8.${platformId}`)
      ?? localStorage.getItem(`cs-match-helper.team-table-columns-v7.${platformId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredColumnPrefs>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.visible)) return fallback;
    return normalizePrefs(
      {
        version: typeof parsed.version === 'number' ? parsed.version : 0,
        order: parsed.order.filter((key) => isColumnKey(key, platformId)),
        visible: parsed.visible.filter((key) => isColumnKey(key, platformId)),
      },
      platformId,
    );
  } catch {
    return fallback;
  }
}

function savePrefs(platformId: TeamTablePlatformId, prefs: StoredColumnPrefs) {
  try {
    localStorage.setItem(getStorageKeyForPlatform(platformId), JSON.stringify(prefs));
  } catch {
    // 存储不可用时静默忽略
  }
}

export function useTeamTableColumns(platformId: Ref<MatchPlatformId | undefined>) {
  const tablePlatformId = computed(() => toTablePlatformId(platformId.value));

  const initial = loadPrefs(tablePlatformId.value);
  const columnOrder = ref<TeamTableColumnKey[]>([...initial.order]);
  const visibleKeys = ref<TeamTableColumnKey[]>([...initial.visible]);

  watch(tablePlatformId, (next) => {
    const prefs = loadPrefs(next);
    columnOrder.value = [...prefs.order];
    visibleKeys.value = [...prefs.visible];
  });

  const columnDefs = computed(() => getTeamTableColumnDefs(tablePlatformId.value));
  const columnMap = computed(() => getTeamTableColumnMap(tablePlatformId.value));

  const visibleColumns = computed<TeamTableColumnDef[]>(() =>
    columnOrder.value
      .filter((key) => visibleKeys.value.includes(key))
      .map((key) => columnMap.value.get(key)!)
      .filter(Boolean),
  );

  const customizerItems = computed(() =>
    columnOrder.value
      .map((key) => columnMap.value.get(key)!)
      .filter(Boolean),
  );

  function persist() {
    savePrefs(tablePlatformId.value, {
      version: STORAGE_VERSION,
      order: [...columnOrder.value],
      visible: [...visibleKeys.value],
    });
  }

  function setVisible(key: TeamTableColumnKey, visible: boolean) {
    if (key === 'nickname') return;
    const set = new Set(visibleKeys.value);
    if (visible) set.add(key);
    else set.delete(key);
    visibleKeys.value = columnOrder.value.filter((k) => set.has(k));
    persist();
  }

  function moveColumn(key: TeamTableColumnKey, direction: -1 | 1) {
    const idx = columnOrder.value.indexOf(key);
    if (idx < 0) return;
    const next = idx + direction;
    if (next < 0 || next >= columnOrder.value.length) return;
    const order = [...columnOrder.value];
    [order[idx], order[next]] = [order[next], order[idx]];
    columnOrder.value = order;
    visibleKeys.value = order.filter((k) => visibleKeys.value.includes(k));
    persist();
  }

  function reorderColumn(fromKey: TeamTableColumnKey, toKey: TeamTableColumnKey) {
    if (fromKey === toKey || fromKey === 'nickname') return;
    const order = [...columnOrder.value];
    const fromIdx = order.indexOf(fromKey);
    const toIdx = order.indexOf(toKey);
    if (fromIdx < 0 || toIdx < 0) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, fromKey);
    setColumnOrder(order);
  }

  function setColumnOrder(order: TeamTableColumnKey[]) {
    const allKeys = getDefaultColumnOrder(tablePlatformId.value);
    const known = new Set(allKeys);
    const normalized = [
      ...order.filter((key) => known.has(key)),
      ...allKeys.filter((key) => !order.includes(key)),
    ];
    columnOrder.value = normalized;
    visibleKeys.value = normalized.filter((k) => visibleKeys.value.includes(k));
    persist();
  }

  function resetColumns() {
    columnOrder.value = getDefaultColumnOrder(tablePlatformId.value);
    visibleKeys.value = getDefaultVisibleColumnKeys(tablePlatformId.value);
    persist();
  }

  return {
    columnOrder,
    visibleKeys,
    visibleColumns,
    customizerItems,
    allColumnDefs: columnDefs,
    tablePlatformId,
    setVisible,
    moveColumn,
    reorderColumn,
    setColumnOrder,
    resetColumns,
  };
}
