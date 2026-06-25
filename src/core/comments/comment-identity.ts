import { generateAvatarFromColor, hashString, hslToHex, normalizeCommentColor } from './pixel-avatar';
import type { PixelAvatar } from './pixel-avatar';

const ALIAS_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ALIAS_CODE_LENGTH = 6;

export interface CommentAuthorIdentity {
  color: string;
  alias: string;
  avatar: PixelAvatar;
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };
}

/** 与服务端 generateColorFromUid 一致：由 clientKey 确定性生成作者色 */
export function generateColorFromClientKey(clientKey: string): string {
  const hash = hashString(clientKey);
  const h = hash % 360;
  const s = 58 + (hash % 17);
  const l = 46 + ((hash >> 10) % 14);
  return hslToHex(h, s, l);
}

/** 由 color 确定性生成昵称：用户 + 6 位英文数字 */
export function generateCommentAlias(color: string): string | null {
  const normalized = normalizeCommentColor(color);
  if (!normalized) return null;

  const next = createRng(hashString(normalized) ^ 0x6a09e667);
  let code = '';
  for (let i = 0; i < ALIAS_CODE_LENGTH; i++) {
    code += ALIAS_CHARS[next() % ALIAS_CHARS.length];
  }
  return `用户${code}`;
}

export function resolveCommentColor(
  color: string | undefined | null,
  options?: { self?: boolean; selfColor?: string | null },
): string | null {
  const resolved = normalizeCommentColor(color);
  if (resolved) return resolved;
  if (options?.self) {
    return normalizeCommentColor(options.selfColor);
  }
  return null;
}

export function resolveCommentAuthorIdentity(
  color: string | undefined | null,
  options?: { self?: boolean; selfColor?: string | null },
): CommentAuthorIdentity | null {
  const resolvedColor = resolveCommentColor(color, options);
  if (!resolvedColor) return null;

  const alias = generateCommentAlias(resolvedColor);
  const avatar = generateAvatarFromColor(resolvedColor);
  if (!alias || !avatar) return null;

  return { color: resolvedColor, alias, avatar };
}
