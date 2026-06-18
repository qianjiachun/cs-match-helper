import type { CommentItem, CommentPlayerTarget, HistoryCommentItem } from '@core/comments/types';

export const MOCK_COMMENT_STEAM_ID = '76561198000000001';

export const MOCK_COMMENT_PLAYER: CommentPlayerTarget = {
  steamId: MOCK_COMMENT_STEAM_ID,
  nickname: '调试玩家_Mock',
  avatar: 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
};

export const MOCK_COMMENT_ITEMS: CommentItem[] = [
  {
    id: 'mock-comment-1',
    text: '枪法很稳，道具也舍得丢，适合当突破手。',
    likes: 12,
    createTime: Date.now() - 45 * 60 * 1000,
    liked: false,
    color: '#8b5cf6', // purple-500
  },
  {
    id: 'mock-comment-2',
    text: '沟通积极，会报点也会给信息，组排体验不错。',
    likes: 8,
    createTime: Date.now() - 3 * 60 * 60 * 1000,
    liked: true,
    color: '#10b981', // emerald-500
  },
  {
    id: 'mock-comment-3',
    text: '这是我写的测试评论，可以点编辑和点赞试试交互。',
    likes: 2,
    createTime: Date.now() - 26 * 60 * 60 * 1000,
    liked: false,
    self: true,
    editedAt: Date.now() - 20 * 60 * 60 * 1000,
    color: '',
  },
  {
    id: 'mock-comment-4',
    text: '偶尔上头，但整体水平在线。',
    likes: 5,
    createTime: Date.now() - 2 * 24 * 60 * 60 * 1000,
    liked: false,
    color: '#f59e0b', // amber-500
  },
  {
    id: 'mock-comment-5',
    text: '残局处理能力强，适合守点位。',
    likes: 3,
    createTime: Date.now() - 5 * 24 * 60 * 60 * 1000,
    liked: false,
    color: '#3b82f6', // blue-500
  },
];

export type MockCommentScenario = 'list' | 'empty' | 'loading' | 'error';

export const MOCK_HISTORY_STEAM_IDS = [
  MOCK_COMMENT_STEAM_ID,
  '76561198000000002',
  '76561198000000003',
] as const;

export const MOCK_HISTORY_ITEMS: HistoryCommentItem[] = [
  {
    id: 'mock-history-1',
    steamid: MOCK_HISTORY_STEAM_IDS[0],
    self: true,
    text: '枪法很稳，道具也舍得丢，适合当突破手。',
    likes: 12,
    createTime: Date.now() - 45 * 60 * 1000,
    color: '#8b5cf6',
  },
  {
    id: 'mock-history-2',
    steamid: MOCK_HISTORY_STEAM_IDS[1],
    self: true,
    text: '沟通积极，会报点也会给信息，组排体验不错 👍',
    likes: 8,
    createTime: Date.now() - 3 * 60 * 60 * 1000,
    color: '#10b981',
  },
  {
    id: 'mock-history-3',
    steamid: MOCK_HISTORY_STEAM_IDS[0],
    self: true,
    text: '这是我写的测试评论，可以点编辑试试交互与表情插入。',
    likes: 2,
    createTime: Date.now() - 26 * 60 * 60 * 1000,
    editedAt: Date.now() - 20 * 60 * 60 * 1000,
    color: '',
  },
  {
    id: 'mock-history-4',
    steamid: MOCK_HISTORY_STEAM_IDS[2],
    self: true,
    text: '偶尔上头，但整体水平在线。',
    likes: 5,
    createTime: Date.now() - 2 * 24 * 60 * 60 * 1000,
    color: '#f59e0b',
  },
  {
    id: 'mock-history-5',
    steamid: MOCK_HISTORY_STEAM_IDS[1],
    self: true,
    text: '残局处理能力强，适合守点位。',
    likes: 3,
    createTime: Date.now() - 5 * 24 * 60 * 60 * 1000,
    color: '#3b82f6',
  },
];

export const MOCK_HISTORY_MORE_ITEMS: HistoryCommentItem[] = [
  {
    id: 'mock-history-more-1',
    steamid: MOCK_HISTORY_STEAM_IDS[2],
    self: true,
    text: '这是「加载更多」返回的 Mock 历史评论。',
    likes: 1,
    createTime: Date.now() - 8 * 24 * 60 * 60 * 1000,
    color: '#ec4899',
  },
];

export const MOCK_HISTORY_CURSOR = {
  createTime: MOCK_HISTORY_MORE_ITEMS[0]!.createTime,
  id: MOCK_HISTORY_MORE_ITEMS[0]!.id,
};
