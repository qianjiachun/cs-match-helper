import { computed, ref } from 'vue';
import {
  getDefaultColumnOrder,
  getDefaultVisibleColumnKeys,
  TEAM_TABLE_COLUMN_DEFS,
  TEAM_TABLE_COLUMN_MAP,
  type TeamTableColumnDef,
  type TeamTableColumnKey,
} from '../components/team-table-columns';

const STORAGE_KEY = 'cs-match-helper.team-table-columns-v2';
const STORAGE_VERSION = 2;

interface StoredColumnPrefs {
  version: number;
  order: TeamTableColumnKey[];
  visible: TeamTableColumnKey[];
}

function isColumnKey(value: unknown): value is TeamTableColumnKey {
  return typeof value === 'string' && TEAM_TABLE_COLUMN_MAP.has(value as TeamTableColumnKey);
}

function normalizePrefs(raw: StoredColumnPrefs): StoredColumnPrefs {
  const allKeys = getDefaultColumnOrder();
  const known = new Set(allKeys);

  const order = [
    ...raw.order.filter((key) => known.has(key)),
    ...allKeys.filter((key) => !raw.order.includes(key)),
  ];

  const visibleSet = new Set(raw.visible.filter((key) => known.has(key) && key !== 'nickname'));
  visibleSet.add('nickname');

  const visible = order.filter((key) => visibleSet.has(key));
  if (!visible.length) {
    return {
      version: STORAGE_VERSION,
      order: allKeys,
      visible: getDefaultVisibleColumnKeys(),
    };
  }

  return { version: STORAGE_VERSION, order, visible };
}

function loadPrefs(): StoredColumnPrefs {
  const fallback: StoredColumnPrefs = {
    version: STORAGE_VERSION,
    order: getDefaultColumnOrder(),
    visible: getDefaultVisibleColumnKeys(),
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredColumnPrefs>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.visible)) return fallback;
    return normalizePrefs({
      version: STORAGE_VERSION,
      order: parsed.order.filter(isColumnKey),
      visible: parsed.visible.filter(isColumnKey),
    });
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: StoredColumnPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 存储不可用时静默忽略
  }
}

export function useTeamTableColumns() {
  const initial = loadPrefs();
  const columnOrder = ref<TeamTableColumnKey[]>([...initial.order]);
  const visibleKeys = ref<TeamTableColumnKey[]>([...initial.visible]);

  const visibleColumns = computed<TeamTableColumnDef[]>(() =>
    columnOrder.value
      .filter((key) => visibleKeys.value.includes(key))
      .map((key) => TEAM_TABLE_COLUMN_MAP.get(key)!)
      .filter(Boolean),
  );

  const customizerItems = computed(() =>
    columnOrder.value
      .map((key) => TEAM_TABLE_COLUMN_MAP.get(key)!)
      .filter(Boolean),
  );

  function persist() {
    savePrefs({
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
    const allKeys = getDefaultColumnOrder();
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
    columnOrder.value = getDefaultColumnOrder();
    visibleKeys.value = getDefaultVisibleColumnKeys();
    persist();
  }

  return {
    columnOrder,
    visibleKeys,
    visibleColumns,
    customizerItems,
    allColumnDefs: TEAM_TABLE_COLUMN_DEFS,
    setVisible,
    moveColumn,
    reorderColumn,
    setColumnOrder,
    resetColumns,
  };
}
