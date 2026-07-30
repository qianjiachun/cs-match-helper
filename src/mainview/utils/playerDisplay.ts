import { localize } from '../i18n';

export function displayPlayerNickname(nickname?: string): string {
  const value = nickname?.trim();
  if (!value || value === '未知玩家') return localize('未知玩家', 'Unknown player');
  return value;
}
