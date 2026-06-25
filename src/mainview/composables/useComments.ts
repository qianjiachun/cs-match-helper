import { computed, ref } from 'vue';
import type { MatchPlatformId, MatchPlayer } from '@core/match/models';
import {
  addComment,
  CommentApiError,
  fetchCommentBatchCounts,
  fetchCommentHistory,
  fetchCommentList,
  fetchCommentReplyList,
  likeComment,
  setCommentClientKeyProvider,
  updateComment,
} from '@core/comments/api';
import {
  extractSelfColorFromComments,
  isInternalTopLevelComment,
  normalizeInternalComment,
  normalizeInternalReplyList,
} from '@core/comments/internal-comment';
import {
  fetchPlatformBoardComments,
  fetchPlatformBoardCount,
  mergeCommentLists,
} from '@core/comments/platform-board';
import type {
  CommentCursor,
  CommentItem,
  CommentPlayerTarget,
  HistoryCommentItem,
  PlatformBoardCursor,
  PlayerCommentCount,
} from '@core/comments/types';
import { isValidSteamId64 } from '@core/comments/steam-id';
import { isCommentEditable } from '@core/comments/edit-policy';
import { generateColorFromClientKey } from '@core/comments/comment-identity';
import { getCommentClientKey } from '../native';
import {
  MOCK_COMMENT_ITEMS,
  MOCK_COMMENT_PLAYER,
  MOCK_COMMENT_STEAM_ID,
  MOCK_SELF_COMMENT_COLOR,
  MOCK_HISTORY_CURSOR,
  MOCK_HISTORY_ITEMS,
  MOCK_HISTORY_MORE_ITEMS,
  type MockCommentScenario,
} from './comments-mock';

let clientKeyReady = false;
let selfCommentColorPromise: Promise<string | null> | null = null;

function ensureClientKeyProvider() {
  if (clientKeyReady) return;
  setCommentClientKeyProvider(() => getCommentClientKey());
  clientKeyReady = true;
}

async function resolveSelfCommentColor(): Promise<string | null> {
  if (!selfCommentColorPromise) {
    selfCommentColorPromise = getCommentClientKey()
      .then((key) => generateColorFromClientKey(key))
      .catch(() => null);
  }
  return selfCommentColorPromise;
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
    platformBoardId: player.platformBoardId,
  };
}

type ListCacheEntry = {
  internalList: CommentItem[];
  platformList: CommentItem[];
  internalMore: boolean;
  platformMore: boolean;
  internalCursor: CommentCursor | null;
  platformCursor: PlatformBoardCursor | null;
  sort: 'time' | 'hot';
  cachedAt: number;
};

const LIST_CACHE_TTL_MS = 60_000;

function listCacheKey(steamId: string, platformId: MatchPlatformId) {
  return `${steamId}:${platformId}`;
}

function isListCacheFresh(entry: ListCacheEntry): boolean {
  return Date.now() - entry.cachedAt < LIST_CACHE_TTL_MS;
}

export function useComments() {
  ensureClientKeyProvider();

  const counts = ref<Record<string, PlayerCommentCount>>({});
  const countsLoading = ref(false);

  const drawerOpen = ref(false);
  const activePlayer = ref<CommentPlayerTarget | null>(null);
  const activePlatformId = ref<MatchPlatformId>('perfect');

  const list = ref<CommentItem[]>([]);
  const internalList = ref<CommentItem[]>([]);
  const platformList = ref<CommentItem[]>([]);
  const listLoading = ref(false);
  const listLoadingMore = ref(false);
  const internalMore = ref(false);
  const platformMore = ref(false);
  const listMore = ref(false);
  const internalCursor = ref<CommentCursor | null>(null);
  const platformCursor = ref<PlatformBoardCursor | null>(null);
  const listError = ref('');
  const listFetched = ref(false);
  const listRefreshing = ref(false);
  const listSort = ref<'time' | 'hot'>('time');

  const listCache = new Map<string, ListCacheEntry>();

  function rebuildMergedList() {
    list.value = mergeCommentLists(internalList.value, platformList.value, listSort.value);
    listMore.value = internalMore.value || platformMore.value;
  }

  function patchInternalListItem(
    commentId: string,
    patch: (item: CommentItem) => CommentItem,
  ) {
    internalList.value = internalList.value.map((item) => {
      if (item.id === commentId) return patch(item);
      if (!item.internalReplies?.length) return item;
      const nextReplies = item.internalReplies.map((reply) =>
        reply.id === commentId ? patch(reply) : reply,
      );
      if (nextReplies === item.internalReplies) return item;
      return { ...item, internalReplies: nextReplies };
    });
    rebuildMergedList();
  }

  function updateParentInternalReplies(
    parentId: string,
    updater: (parent: CommentItem) => CommentItem,
  ) {
    internalList.value = internalList.value.map((item) =>
      item.id === parentId ? updater(item) : item,
    );
    rebuildMergedList();
  }

  function resetReplyState() {
    replyExpanded.value = {};
    replyLoading.value = {};
    replyLoadingMore.value = {};
    replyMore.value = {};
    replyCursors.value = {};
    replyingToId.value = null;
  }

  function canLoadPlatformBoard(player: CommentPlayerTarget | null): player is CommentPlayerTarget {
    return Boolean(player?.platformBoardId?.trim());
  }

  async function fetchPlatformPage(reset: boolean) {
    const player = activePlayer.value;
    if (!canLoadPlatformBoard(player)) {
      if (reset) {
        platformList.value = [];
        platformMore.value = false;
        platformCursor.value = null;
      }
      return;
    }

    const result = await fetchPlatformBoardComments(
      activePlatformId.value,
      player.platformBoardId!,
      {
        cursor: reset ? null : platformCursor.value,
        sort: listSort.value,
      },
    );

    platformList.value = reset
      ? result.list
      : [...platformList.value, ...result.list];
    platformMore.value = result.more;
    platformCursor.value = result.nextCursor;
  }

  const submitting = ref(false);
  const submitError = ref('');
  const mockMode = ref(false);
  const selfCommentColor = ref<string | null>(null);

  const replyExpanded = ref<Record<string, boolean>>({});
  const replyLoading = ref<Record<string, boolean>>({});
  const replyLoadingMore = ref<Record<string, boolean>>({});
  const replyMore = ref<Record<string, boolean>>({});
  const replyCursors = ref<Record<string, CommentCursor | null>>({});
  const replyingToId = ref<string | null>(null);

  void resolveSelfCommentColor().then((color) => {
    selfCommentColor.value = color;
  });

  const historyList = ref<HistoryCommentItem[]>([]);
  const historyLoading = ref(false);
  const historyLoadingMore = ref(false);
  const historyMore = ref(false);
  const historyCursor = ref<CommentCursor | null>(null);
  const historyError = ref('');
  const historyMockMode = ref(false);
  const historyFetched = ref(false);

  function syncSelfColorFromComments(items: CommentItem[]) {
    const color = extractSelfColorFromComments(items);
    if (color) selfCommentColor.value = color;
  }

  async function resolveOptimisticSelfColor(): Promise<string | undefined> {
    const fromList = extractSelfColorFromComments(internalList.value);
    if (fromList) {
      selfCommentColor.value = fromList;
      return fromList;
    }
    const fromHistory = extractSelfColorFromComments(historyList.value);
    if (fromHistory) {
      selfCommentColor.value = fromHistory;
      return fromHistory;
    }
    if (selfCommentColor.value) return selfCommentColor.value;
    const generated = await resolveSelfCommentColor();
    if (generated) selfCommentColor.value = generated;
    return generated ?? undefined;
  }

  const activeCount = computed(() => {
    const id = activePlayer.value?.steamId;
    if (!id) return 0;
    return counts.value[id]?.count ?? 0;
  });

  function getCount(steamId: string): number {
    if (!isValidSteamId64(steamId)) return 0;
    return counts.value[steamId]?.count ?? 0;
  }

  function getCountHasMore(steamId: string): boolean {
    if (!isValidSteamId64(steamId)) return false;
    return counts.value[steamId]?.hasMore ?? false;
  }

  function canComment(steamId: string): boolean {
    return isValidSteamId64(steamId);
  }

  async function loadCounts(players: MatchPlayer[], platformId: MatchPlatformId) {
    const valid = players.filter((player) => isValidSteamId64(player.steamId));
    if (valid.length === 0) return;

    const steamIds = valid.map((player) => player.steamId);
    countsLoading.value = true;
    try {
      const [internalData, platformResults] = await Promise.all([
        fetchCommentBatchCounts(steamIds),
        Promise.allSettled(
          valid
            .filter((player) => player.platformBoardId?.trim())
            .map(async (player) => ({
              steamId: player.steamId,
              platform: await fetchPlatformBoardCount(platformId, player.platformBoardId!),
            })),
        ),
      ]);

      const next: Record<string, PlayerCommentCount> = { ...counts.value };
      for (const id of steamIds) {
        next[id] = { count: internalData[id]?.count ?? 0 };
      }
      for (const result of platformResults) {
        if (result.status === 'fulfilled') {
          const { steamId, platform } = result.value;
          const prev = next[steamId] ?? { count: 0 };
          next[steamId] = {
            count: prev.count + platform.count,
            hasMore: platform.hasMore ?? prev.hasMore,
          };
        }
      }
      counts.value = next;
    } catch {
      // batch 失败时静默，不影响主流程
    } finally {
      countsLoading.value = false;
    }
  }

  function bumpCount(steamId: string, delta: number) {
    const prev = counts.value[steamId] ?? { count: 0 };
    counts.value = {
      ...counts.value,
      [steamId]: {
        ...prev,
        count: Math.max(0, prev.count + delta),
      },
    };
  }

  function syncListCache(steamId: string) {
    listCache.set(listCacheKey(steamId, activePlatformId.value), {
      internalList: [...internalList.value],
      platformList: [...platformList.value],
      internalMore: internalMore.value,
      platformMore: platformMore.value,
      internalCursor: internalCursor.value,
      platformCursor: platformCursor.value,
      sort: listSort.value,
      cachedAt: Date.now(),
    });
  }

  function restoreListFromCache(entry: ListCacheEntry) {
    internalList.value = [...entry.internalList];
    platformList.value = [...entry.platformList];
    syncSelfColorFromComments(internalList.value);
    internalMore.value = entry.internalMore;
    platformMore.value = entry.platformMore;
    internalCursor.value = entry.internalCursor;
    platformCursor.value = entry.platformCursor;
    rebuildMergedList();
    listLoading.value = false;
    listRefreshing.value = false;
    listFetched.value = true;
    listError.value = '';
  }

  function applyMockScenario(scenario: MockCommentScenario) {
    activePlayer.value = { ...MOCK_COMMENT_PLAYER };
    submitError.value = '';
    internalCursor.value = null;
    platformCursor.value = null;
    internalList.value = [];
    platformList.value = [];

    switch (scenario) {
      case 'list':
        internalList.value = [...MOCK_COMMENT_ITEMS];
        list.value = [...MOCK_COMMENT_ITEMS];
        internalMore.value = true;
        listMore.value = true;
        listLoading.value = false;
        listFetched.value = true;
        listError.value = '';
        counts.value = {
          ...counts.value,
          [MOCK_COMMENT_STEAM_ID]: { count: MOCK_COMMENT_ITEMS.length },
        };
        break;
      case 'empty':
        list.value = [];
        internalList.value = [];
        internalMore.value = false;
        listMore.value = false;
        listLoading.value = false;
        listFetched.value = true;
        listError.value = '';
        counts.value = { ...counts.value, [MOCK_COMMENT_STEAM_ID]: { count: 0 } };
        break;
      case 'loading':
        list.value = [];
        listMore.value = false;
        listLoading.value = true;
        listFetched.value = false;
        listError.value = '';
        counts.value = {
          ...counts.value,
          [MOCK_COMMENT_STEAM_ID]: { count: MOCK_COMMENT_ITEMS.length },
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
          [MOCK_COMMENT_STEAM_ID]: { count: MOCK_COMMENT_ITEMS.length },
        };
        break;
    }
  }

  function openMockDrawer(scenario: MockCommentScenario = 'list') {
    mockMode.value = true;
    selfCommentColor.value = MOCK_SELF_COMMENT_COLOR;
    applyMockScenario(scenario);
    drawerOpen.value = true;
  }

  async function openPlayer(player: MatchPlayer, platformId: MatchPlatformId = 'perfect') {
    if (!canComment(player.steamId)) return;

    mockMode.value = false;
    const steamId = player.steamId;
    activePlatformId.value = platformId;
    activePlayer.value = toPlayerTarget(player);
    listError.value = '';
    submitError.value = '';
    listSort.value = 'time';
    resetReplyState();

    const cacheKey = listCacheKey(steamId, platformId);
    const cached = listCache.get(cacheKey);
    const cacheMatchesSort = cached?.sort === listSort.value;

    if (cached && cacheMatchesSort) {
      restoreListFromCache(cached);
    } else {
      internalList.value = [];
      platformList.value = [];
      internalMore.value = false;
      platformMore.value = false;
      internalCursor.value = null;
      platformCursor.value = null;
      list.value = [];
      listMore.value = false;
      listLoading.value = true;
      listFetched.value = false;
    }

    drawerOpen.value = true;

    if (cached && cacheMatchesSort && isListCacheFresh(cached)) {
      return;
    }

    if (cached && cacheMatchesSort) {
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
      const [internalResult] = await Promise.all([
        fetchCommentList(steamId, {
          limit: 20,
          cursor: null,
          sort: listSort.value,
          cache: false,
        }),
        fetchPlatformPage(true),
      ]);
      if (activePlayer.value?.steamId !== steamId) return;
      internalList.value = internalResult.list.map(normalizeInternalComment);
      syncSelfColorFromComments(internalList.value);
      internalMore.value = internalResult.more;
      internalCursor.value = internalResult.nextCursor;
      rebuildMergedList();
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
    resetReplyState();
  }

  async function changeSort(sort: 'time' | 'hot') {
    if (listSort.value === sort || listLoading.value) return;
    listSort.value = sort;
    await loadComments(true);
  }

  async function loadComments(reset = false, options?: { bypassCache?: boolean }) {
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
        internalList.value = [];
        platformList.value = [];
        list.value = [];
      }
      internalCursor.value = null;
      platformCursor.value = null;
      internalMore.value = false;
      platformMore.value = false;
      listMore.value = false;
      listFetched.value = false;
    } else {
      listLoadingMore.value = true;
    }
    listError.value = '';

    try {
      const internalPromise = fetchCommentList(player.steamId, {
        limit: 20,
        cursor: reset ? null : internalCursor.value,
        sort: listSort.value,
        cache: options?.bypassCache ? false : LIST_CACHE_TTL_MS,
      });
      const platformPromise = canLoadPlatformBoard(player)
        ? fetchPlatformBoardComments(activePlatformId.value, player.platformBoardId!, {
            cursor: reset ? null : platformCursor.value,
            sort: listSort.value,
          })
        : Promise.resolve({
            list: [] as CommentItem[],
            more: false,
            nextCursor: null,
          });

      const [internalResult, platformResult] = await Promise.all([
        internalPromise,
        platformPromise,
      ]);

      internalList.value = reset
        ? internalResult.list.map(normalizeInternalComment)
        : [...internalList.value, ...internalResult.list.map(normalizeInternalComment)];
      syncSelfColorFromComments(internalList.value);
      internalMore.value = internalResult.more;
      internalCursor.value = internalResult.nextCursor;

      platformList.value = reset
        ? platformResult.list
        : [...platformList.value, ...platformResult.list];
      platformMore.value = platformResult.more;
      platformCursor.value = platformResult.nextCursor;

      rebuildMergedList();
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
        const color = await resolveOptimisticSelfColor();
        const item: CommentItem = {
          id: `mock-${Date.now()}`,
          text: trimmed,
          likes: 0,
          createTime: Date.now(),
          liked: false,
          self: true,
          color: color ?? undefined,
        };
        list.value = [item, ...list.value];
        internalList.value = [item, ...internalList.value];
        bumpCount(player.steamId, 1);
        return true;
      }

      const { id } = await addComment(player.steamId, trimmed);
      const color = await resolveOptimisticSelfColor();
      const item: CommentItem = {
        id,
        text: trimmed,
        likes: 0,
        createTime: Date.now(),
        liked: false,
        self: true,
        color: color ?? undefined,
        source: 'internal',
      };
      internalList.value = [item, ...internalList.value];
      rebuildMergedList();
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

  function findInternalComment(commentId: string): CommentItem | undefined {
    for (const item of internalList.value) {
      if (item.id === commentId) return item;
      const reply = item.internalReplies?.find((row) => row.id === commentId);
      if (reply) return reply;
    }
    return undefined;
  }

  async function editComment(commentId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 200) return false;

    const target =
      findInternalComment(commentId) ??
      historyList.value.find((item) => item.id === commentId);
    if (target && !isCommentEditable(target.createTime)) {
      submitError.value = '评论超过30天不可编辑';
      return false;
    }
    if (target?.readOnly || (target?.source && target.source !== 'internal')) {
      return false;
    }

    submitting.value = true;
    submitError.value = '';
    try {
      if (mockMode.value || historyMockMode.value) {
        patchInternalListItem(commentId, (item) => ({
          ...item,
          text: trimmed,
          editedAt: Date.now(),
        }));
        historyList.value = historyList.value.map((item) =>
          item.id === commentId
            ? { ...item, text: trimmed, editedAt: Date.now() }
            : item,
        );
        return true;
      }

      await updateComment(commentId, trimmed);
      patchInternalListItem(commentId, (item) => ({
        ...item,
        text: trimmed,
        editedAt: Date.now(),
      }));
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
    if (comment.readOnly || (comment.source && comment.source !== 'internal')) return;

    const now = Date.now();
    const last = likeCooldown.get(comment.id) ?? 0;
    if (now - last < 800) return;
    likeCooldown.set(comment.id, now);

    try {
      if (mockMode.value) {
        patchInternalListItem(comment.id, (item) => ({
          ...item,
          liked: !item.liked,
          likes: Math.max(0, item.likes + (item.liked ? -1 : 1)),
        }));
        return;
      }

      const result = await likeComment(comment.id);
      patchInternalListItem(comment.id, (item) => ({
        ...item,
        likes: result.likes,
        liked: result.liked,
      }));
      historyList.value = historyList.value.map((item) =>
        item.id === comment.id
          ? { ...item, likes: result.likes, liked: result.liked }
          : item,
      ) as HistoryCommentItem[];
      const player = activePlayer.value;
      if (player) syncListCache(player.steamId);
    } catch (err) {
      submitError.value = formatCommentError(err);
    }
  }

  function findInternalTopLevel(commentId: string): CommentItem | undefined {
    return internalList.value.find((item) => item.id === commentId);
  }

  function isReplyExpanded(commentId: string): boolean {
    return Boolean(replyExpanded.value[commentId]);
  }

  async function toggleReplies(commentId: string) {
    const parent = findInternalTopLevel(commentId);
    if (!parent || !isInternalTopLevelComment(parent)) return;

    if (replyExpanded.value[commentId]) {
      replyExpanded.value = { ...replyExpanded.value, [commentId]: false };
      if (replyingToId.value === commentId) replyingToId.value = null;
      return;
    }

    replyExpanded.value = { ...replyExpanded.value, [commentId]: true };
    if (!parent.internalReplies) {
      await loadReplies(commentId, true);
    }
  }

  async function loadReplies(commentId: string, reset = false) {
    const parent = findInternalTopLevel(commentId);
    if (!parent || !isInternalTopLevelComment(parent)) return;

    if (reset) {
      replyLoading.value = { ...replyLoading.value, [commentId]: true };
      replyCursors.value = { ...replyCursors.value, [commentId]: null };
      replyMore.value = { ...replyMore.value, [commentId]: false };
    } else {
      replyLoadingMore.value = { ...replyLoadingMore.value, [commentId]: true };
    }

    try {
      if (mockMode.value) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const mockReplies: CommentItem[] = [
          {
            id: `mock-reply-${commentId}`,
            text: '这是 Mock 回复。',
            likes: 1,
            createTime: Date.now() - 3600000,
            liked: false,
            self: false,
            color: '#8b5cf6',
            source: 'internal',
            replyId: commentId,
          },
        ];
        updateParentInternalReplies(commentId, (item) => ({
          ...item,
          internalReplies: reset
            ? mockReplies
            : [...(item.internalReplies ?? []), ...mockReplies],
          replyCount: Math.max(item.replyCount ?? 0, mockReplies.length),
        }));
        replyMore.value = { ...replyMore.value, [commentId]: false };
        return;
      }

      const result = await fetchCommentReplyList(commentId, {
        limit: 20,
        cursor: reset ? null : replyCursors.value[commentId] ?? null,
        cache: false,
      });
      const normalized = normalizeInternalReplyList(result.list);
      syncSelfColorFromComments(normalized);
      updateParentInternalReplies(commentId, (item) => ({
        ...item,
        internalReplies: reset
          ? normalized
          : [...(item.internalReplies ?? []), ...normalized],
        replyCount: Math.max(item.replyCount ?? 0, normalized.length),
      }));
      replyMore.value = { ...replyMore.value, [commentId]: result.more };
      replyCursors.value = { ...replyCursors.value, [commentId]: result.nextCursor };
      const player = activePlayer.value;
      if (player) syncListCache(player.steamId);
    } catch (err) {
      submitError.value = formatCommentError(err);
    } finally {
      replyLoading.value = { ...replyLoading.value, [commentId]: false };
      replyLoadingMore.value = { ...replyLoadingMore.value, [commentId]: false };
    }
  }

  function startReply(commentId: string) {
    const parent = findInternalTopLevel(commentId);
    if (!parent || !isInternalTopLevelComment(parent)) return;
    replyingToId.value = commentId;

    const hasReplies =
      (parent.replyCount ?? 0) > 0 || (parent.internalReplies?.length ?? 0) > 0;
    if (!hasReplies) return;

    replyExpanded.value = { ...replyExpanded.value, [commentId]: true };
    if (!parent.internalReplies) {
      void loadReplies(commentId, true);
    }
  }

  function cancelReply() {
    replyingToId.value = null;
  }

  async function submitReply(parentId: string, text: string) {
    const player = activePlayer.value;
    if (!player || !canComment(player.steamId)) return false;

    const parent = findInternalTopLevel(parentId);
    if (!parent || !isInternalTopLevelComment(parent)) return false;

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 200) return false;

    submitting.value = true;
    submitError.value = '';
    try {
      if (mockMode.value) {
        const color = await resolveOptimisticSelfColor();
        const item = normalizeInternalComment({
          id: `mock-reply-${Date.now()}`,
          text: trimmed,
          likes: 0,
          createTime: Date.now(),
          liked: false,
          self: true,
          color: color ?? undefined,
          replyId: parentId,
        });
        updateParentInternalReplies(parentId, (p) => ({
          ...p,
          internalReplies: [item, ...(p.internalReplies ?? [])],
          replyCount: (p.replyCount ?? p.internalReplies?.length ?? 0) + 1,
        }));
        replyingToId.value = null;
        replyExpanded.value = { ...replyExpanded.value, [parentId]: true };
        return true;
      }

      const { id } = await addComment(player.steamId, trimmed, parentId);
      const color = await resolveOptimisticSelfColor();
      const item = normalizeInternalComment({
        id,
        text: trimmed,
        likes: 0,
        createTime: Date.now(),
        liked: false,
        self: true,
        color: color ?? undefined,
        replyId: parentId,
      });
      updateParentInternalReplies(parentId, (p) => ({
        ...p,
        internalReplies: [item, ...(p.internalReplies ?? [])],
        replyCount: (p.replyCount ?? p.internalReplies?.length ?? 0) + 1,
      }));
      replyingToId.value = null;
      replyExpanded.value = { ...replyExpanded.value, [parentId]: true };
      syncListCache(player.steamId);
      return true;
    } catch (err) {
      submitError.value = formatCommentError(err);
      return false;
    } finally {
      submitting.value = false;
    }
  }

  function fillMockHistory() {
    historyMockMode.value = true;
    selfCommentColor.value = MOCK_SELF_COMMENT_COLOR;
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
      syncSelfColorFromComments(historyList.value);
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
    activePlatformId,
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
    selfCommentColor,
    replyExpanded,
    replyLoading,
    replyLoadingMore,
    replyMore,
    replyingToId,
    historyList,
    historyLoading,
    historyLoadingMore,
    historyMore,
    historyError,
    historyFetched,
    getCount,
    getCountHasMore,
    canComment,
    loadCounts,
    openPlayer,
    openMockDrawer,
    closeDrawer,
    loadComments,
    submitComment,
    editComment,
    toggleLike,
    toggleReplies,
    loadReplies,
    isReplyExpanded,
    startReply,
    cancelReply,
    submitReply,
    loadHistory,
    fillMockHistory,
  };
}
