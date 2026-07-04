export const DEFAULT_GAME_BAR_OPEN_SHORTCUT = 'Win+G';

export function parseGameBarShortcut(shortcut: string): string[] {
  return shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
}
