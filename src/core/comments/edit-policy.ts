/** 评论可编辑窗口：自 createTime 起 30 天内 */
export const COMMENT_EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function isCommentEditable(createTime: number, now = Date.now()): boolean {
  if (!Number.isFinite(createTime)) return false;
  return now - createTime < COMMENT_EDIT_WINDOW_MS;
}
