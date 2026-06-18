export interface CommentEmojiGroup {
  label: string;
  emojis: string[];
}

/** 评论输入常用 emoji，按场景分组 */
export const COMMENT_EMOJI_GROUPS: CommentEmojiGroup[] = [
  {
    label: '态度',
    emojis: ['👍', '👎', '🔥', '💪', '🎯', '⚡', '✨', '💯'],
  },
  {
    label: '表情',
    emojis: ['😎', '🤡', '🐮', '🐔', '😭', '😂', '🤣', '😅'],
  },
  {
    label: '对战',
    emojis: ['🔫', '💣', '🧨', '⚔️', '🏆', '🥇', '🎮', '🎲'],
  },
];

export const COMMENT_EMOJIS = COMMENT_EMOJI_GROUPS.flatMap((group) => group.emojis);
