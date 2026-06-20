import { computed, ref } from 'vue';
import type { MatchPlayer } from '@core/match/models';
import {
  addComment,
  CommentApiError,
  fetchCommentBatchCounts,
  fetchCommentHistory,
  fetchCommentList,
  likeComment,
  setCommentClientKeyProvider,
  updateComment,
} from '@core/comments/api';
import type {
  CommentCursor,
  CommentItem,
  CommentPlayerTarget,
  HistoryCommentItem,
} from '@core/comments/types';
import { filterValidSteamIds, isValidSteamId64 } from '@core/comments/steam-id';
import { isCommentEditable } from '@core/comments/edit-policy';
import { getCommentClientKey } from '../native';
import {
  MOCK_COMMENT_ITEMS,
  MOCK_COMMENT_PLAYER,
  MOCK_COMMENT_STEAM_ID,
  MOCK_HISTORY_CURSOR,
  MOCK_HISTORY_ITEMS,
  MOCK_HISTORY_MORE_ITEMS,
  type MockCommentScenario,
} from './comments-mock';

let clientKeyReady = false;

function ensureClientKeyProvider() {
  if (clientKeyReady) return;
  setCommentClientKeyProvider(() => getCommentClientKey());
  clientKeyReady = true;
}

function formatCommentError(err: unknown): string {
  if (err instanceof CommentApiError) return err.message;
  if (err instanceof Error) return err.message;
  return '操作失败，请稍后重试';
}

function toPlayerTarget(player: MatchPlayer): CommentPlayerTarget {
  return {
    steamId: player.steamId,
    nickname: player.nickname,
    avatar: player.avatar,
  };
}

export function useComments() {
  ensureClientKeyProvider();

  const counts = ref<Record<string, number>>({});
  const countsLoading = ref(false);

  const drawerOpen = ref(false);
  const activePlayer = ref<CommentPlayerTarget | null>(null);

  const list = ref<CommentItem[]>([]);
  const listLoading = ref(false);
  const listLoadingMore = ref(false);
  const listMore = ref(false);
  const listCursor = ref<CommentCursor | null>(null);
  const listError = ref('');
  const listFetched = ref(false);
  const listRefreshing = ref(false);
  const listSort = ref<'time' | 'hot'>('time');

  const listCache = new Map<
    string,
    { list: CommentItem[]; more: boolean; cursor: CommentCursor | null; sort: 'time' | 'hot' }
  >();

  const submitting = ref(false);
  const submitError = ref('');
  const mockMode = ref(false);

  const historyList = ref<HistoryCommentItem[]>([]);
  const historyLoading = ref(false);
  const historyLoadingMore = ref(false);
  const historyMore = ref(false);
  const historyCursor = ref<CommentCursor | null>(null);
  const historyError = ref('');
  const historyMockMode = ref(false);
  const historyFetched = ref(false);

  const activeCount = computed(() => {
    const id = activePlayer.value?.steamId;
    if (!id) return 0;
    return counts.value[id] ?? 0;
  });

  function getCount(steamId: string): number {
    if (!isValidSteamId64(steamId)) return 0;
    return counts.value[steamId] ?? 0;
  }

  function canComment(steamId: string): boolean {
    return isValidSteamId64(steamId);
  }

  async function loadCounts(steamIds: string[]) {
    const valid = filterValidSteamIds(steamIds);
    if (valid.length === 0) return;

    countsLoading.value = true;
    try {
      const data = await fetchCommentBatchCounts(valid);
      const next = { ...counts.value };
      for (const id of valid) {
        next[id] = data[id]?.count ?? 0;
      }
      counts.value = next;
    } catch {
      // batch 失败时静默，不影响主流程
    } finally {
      countsLoading.value = false;
    }
  }

  function bumpCount(steamId: string, delta: number) {
    counts.value = {
      ...counts.value,
      [steamId]: Math.max(0, (counts.value[steamId] ?? 0) + delta),
    };
  }

  function syncListCache(steamId: string) {
    listCache.set(steamId, {
      list: [...list.value],
      more: listMore.value,
      cursor: listCursor.value,
      sort: listSort.value,
    });
  }

  function applyMockScenario(scenario: MockCommentScenario) {
    activePlayer.value = { ...MOCK_COMMENT_PLAYER };
    submitError.value = '';
    listCursor.value = null;

    switch (scenario) {
      case 'list':
        list.value = [...MOCK_COMMENT_ITEMS];
        listMore.value = true;
        listLoading.value = false;
        listFetched.value = true;
        listError.value = '';
        counts.value = {
          ...counts.value,
          [MOCK_COMMENT_STEAM_ID]: MOCK_COMMENT_ITEMS.length,
        };
        break;
      case 'empty':
        list.value = [];
        listMore.value = false;
        listLoading.value = false;
        listFetched.value = true;
        listError.value = '';
        counts.value = { ...counts.value, [MOCK_COMMENT_STEAM_ID]: 0 };
        break;
      case 'loading':
        list.value = [];
        listMore.value = false;
        listLoading.value = true;
        listFetched.value = false;
        listError.value = '';
        counts.value = {
          ...counts.value,
          [MOCK_COMMENT_STEAM_ID]: MOCK_COMMENT_ITEMS.length,
        };
        break;
      case 'error':
        list.value = [];
        listMore.value = false;
        listLoading.value = false;
        listFetched.value = false;
        listError.value = 'Mock：加载评论失败';
        counts.value = {
          ...counts.value,
          [MOCK_COMMENT_STEAM_ID]: MOCK_COMMENT_ITEMS.length,
        };
        break;
    }
  }

  function openMockDrawer(scenario: MockCommentScenario = 'list') {
    mockMode.value = true;
    applyMockScenario(scenario);
    drawerOpen.value = true;
  }

  async function openPlayer(player: MatchPlayer) {
    if (!canComment(player.steamId)) return;

    mockMode.value = false;
    const steamId = player.steamId;
    activePlayer.value = toPlayerTarget(player);
    listError.value = '';
    submitError.value = '';
    listSort.value = 'time'; // 默认每次打开恢复为最新排序

    const cached = listCache.get(steamId);
    if (cached && cached.sort === listSort.value) {
      list.value = cached.list;
      listMore.value = cached.more;
      listCursor.value = cached.cursor;
      listLoading.value = false;
      listFetched.value = true;
    } else {
      list.value = [];
      listMore.value = false;
      listCursor.value = null;
      listLoading.value = true;
      listFetched.value = false;
    }

    drawerOpen.value = true;

    if (cached) {
      void refreshCommentsInBackground();
    } else {
      await loadComments(true);
    }
  }

  async function refreshCommentsInBackground() {
    if (mockMode.value) return;
    const player = activePlayer.value;
    if (!player || !canComment(player.steamId)) return;

    const steamId = player.steamId;
    listRefreshing.value = true;
    try {
      const result = await fetchCommentList(steamId, {
        limit: 20,
        cursor: null,
        sort: listSort.value,
        cache: false,
      });
      if (activePlayer.value?.steamId !== steamId) return;
      list.value = result.list;
      listMore.value = result.more;
      listCursor.value = result.nextCursor;
      listFetched.value = true;
      syncListCache(steamId);
    } catch {
      // 保留缓存内容，静默失败
    } finally {
      if (activePlayer.value?.steamId === steamId) {
        listRefreshing.value = false;
      }
    }
  }

  function closeDrawer() {
    mockMode.value = false;
    drawerOpen.value = false;
    activePlayer.value = null;
    listLoading.value = false;
    listRefreshing.value = false;
    listFetched.value = false;
    listError.value = '';
    submitError.value = '';
  }

  async function changeSort(sort: 'time' | 'hot') {
    if (listSort.value === sort || listLoading.value) return;
    listSort.value = sort;
    await loadComments(true);
  }

  async function loadComments(reset = false) {
    const player = activePlayer.value;
    if (!player || !canComment(player.steamId)) return;

    if (mockMode.value) {
      if (reset) {
        applyMockScenario('list');
      } else {
        listLoadingMore.value = true;
        await new Promise((resolve) => setTimeout(resolve, 350));
        list.value = [
          ...list.value,
          {
            id: `mock-more-${Date.now()}`,
            text: '这是「加载更多」返回的 Mock 评论。',
            likes: 1,
            createTime: Date.now() - 8 * 24 * 60 * 60 * 1000,
            liked: false,
          },
        ];
        listMore.value = false;
        listLoadingMore.value = false;
      }
      return;
    }

    const hadContent = list.value.length > 0;

    if (reset) {
      if (!hadContent) {
        listLoading.value = true;
        list.value = [];
      }
      listCursor.value = null;
      listMore.value = false;
      listFetched.value = false;
    } else {
      listLoadingMore.value = true;
    }
    listError.value = '';

    try {
      const result = await fetchCommentList(player.steamId, {
        limit: 20,
        cursor: reset ? null : listCursor.value,
        sort: listSort.value,
      });
      list.value = reset ? result.list : [...list.value, ...result.list];
      listMore.value = result.more;
      listCursor.value = result.nextCursor;
      syncListCache(player.steamId);
    } catch (err) {
      listError.value = formatCommentError(err);
    } finally {
      listLoading.value = false;
      listLoadingMore.value = false;
      listFetched.value = true;
    }
  }

  async function submitComment(text: string) {
    const player = activePlayer.value;
    if (!player || !canComment(player.steamId)) return false;

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 200) return false;

    submitting.value = true;
    submitError.value = '';
    try {
      if (mockMode.value) {
        const item: CommentItem = {
          id: `mock-${Date.now()}`,
          text: trimmed,
          likes: 0,
          createTime: Date.now(),
          liked: false,
          self: true,
          color: '',
        };
        list.value = [item, ...list.value];
        bumpCount(player.steamId, 1);
        return true;
      }

      const { id } = await addComment(player.steamId, trimmed);
      const item: CommentItem = {
        id,
        text: trimmed,
        likes: 0,
        createTime: Date.now(),
        liked: false,
        self: true,
      };
      list.value = [item, ...list.value];
      bumpCount(player.steamId, 1);
      syncListCache(player.steamId);
      return true;
    } catch (err) {
      submitError.value = formatCommentError(err);
      return false;
    } finally {
      submitting.value = false;
    }
  }

  async function editComment(commentId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 200) return false;

    const target =
      list.value.find((item) => item.id === commentId) ??
      historyList.value.find((item) => item.id === commentId);
    if (target && !isCommentEditable(target.createTime)) {
      submitError.value = '评论超过30天不可编辑';
      return false;
    }

    submitting.value = true;
    submitError.value = '';
    try {
      if (mockMode.value || historyMockMode.value) {
        list.value = list.value.map((item) =>
          item.id === commentId
            ? { ...item, text: trimmed, editedAt: Date.now() }
            : item,
        );
        historyList.value = historyList.value.map((item) =>
          item.id === commentId
            ? { ...item, text: trimmed, editedAt: Date.now() }
            : item,
        );
        return true;
      }

      await updateComment(commentId, trimmed);
      list.value = list.value.map((item) =>
        item.id === commentId
          ? { ...item, text: trimmed, editedAt: Date.now() }
          : item,
      );
      historyList.value = historyList.value.map((item) =>
        item.id === commentId
          ? { ...item, text: trimmed, editedAt: Date.now() }
          : item,
      );
      const player = activePlayer.value;
      if (player) syncListCache(player.steamId);
      return true;
    } catch (err) {
      submitError.value = formatCommentError(err);
      return false;
    } finally {
      submitting.value = false;
    }
  }

  const likeCooldown = new Map<string, number>();

  async function toggleLike(comment: CommentItem) {
    const now = Date.now();
    const last = likeCooldown.get(comment.id) ?? 0;
    if (now - last < 800) return;
    likeCooldown.set(comment.id, now);

    try {
      if (mockMode.value) {
        const patchListItem = (item: CommentItem): CommentItem =>
          item.id === comment.id
            ? {
                ...item,
                liked: !item.liked,
                likes: Math.max(0, item.likes + (item.liked ? -1 : 1)),
              }
            : item;
        list.value = list.value.map(patchListItem);
        return;
      }

      const result = await likeComment(comment.id);
      const patchListItem = (item: CommentItem): CommentItem =>
        item.id === comment.id
          ? {
              ...item,
              likes: result.likes,
              liked: result.liked,
            }
          : item;
      list.value = list.value.map(patchListItem);
      historyList.value = historyList.value.map((item) => patchListItem(item) as HistoryCommentItem);
      const player = activePlayer.value;
      if (player) syncListCache(player.steamId);
    } catch (err) {
      submitError.value = formatCommentError(err);
    }
  }

  function fillMockHistory() {
    historyMockMode.value = true;
    historyLoading.value = false;
    historyLoadingMore.value = false;
    historyError.value = '';
    submitError.value = '';
    historyList.value = [...MOCK_HISTORY_ITEMS];
    historyMore.value = true;
    historyCursor.value = { ...MOCK_HISTORY_CURSOR };
    historyFetched.value = true;
  }

  async function loadHistory(reset = false) {
    if (historyMockMode.value) {
      if (reset) {
        if (historyFetched.value && historyList.value.length > 0) return;

        const showLoading = historyList.value.length === 0;
        if (showLoading) {
          historyLoading.value = true;
          historyList.value = [];
          historyCursor.value = null;
          historyMore.value = false;
          await new Promise((resolve) => setTimeout(resolve, 320));
        }
        historyList.value = [...MOCK_HISTORY_ITEMS];
        historyMore.value = true;
        historyCursor.value = { ...MOCK_HISTORY_CURSOR };
        historyError.value = '';
        historyLoading.value = false;
        historyFetched.value = true;
      } else {
        historyLoadingMore.value = true;
        await new Promise((resolve) => setTimeout(resolve, 380));
        historyList.value = [...historyList.value, ...MOCK_HISTORY_MORE_ITEMS];
        historyMore.value = false;
        historyLoadingMore.value = false;
      }
      return;
    }

    const hadContent = historyList.value.length > 0;

    if (reset) {
      if (!hadContent) {
        historyLoading.value = true;
        historyList.value = [];
      }
      historyCursor.value = null;
      historyMore.value = false;
    } else {
      historyLoadingMore.value = true;
    }
    historyError.value = '';

    try {
      const result = await fetchCommentHistory({
        limit: 20,
        cursor: reset ? null : historyCursor.value,
      });
      historyList.value = reset
        ? result.list
        : [...historyList.value, ...result.list];
      historyMore.value = result.more;
      historyCursor.value = result.nextCursor;
    } catch (err) {
      historyError.value = formatCommentError(err);
    } finally {
      historyLoading.value = false;
      historyLoadingMore.value = false;
      historyFetched.value = true;
    }
  }

  return {
    counts,
    countsLoading,
    drawerOpen,
    activePlayer,
    activeCount,
    list,
    listSort,
    changeSort,
    listLoading,
    listLoadingMore,
    listMore,
    listError,
    listFetched,
    listRefreshing,
    submitting,
    submitError,
    historyList,
    historyLoading,
    historyLoadingMore,
    historyMore,
    historyError,
    historyFetched,
    getCount,
    canComment,
    loadCounts,
    openPlayer,
    openMockDrawer,
    closeDrawer,
    loadComments,
    submitComment,
    editComment,
    toggleLike,
    loadHistory,
    fillMockHistory,
  };
}
