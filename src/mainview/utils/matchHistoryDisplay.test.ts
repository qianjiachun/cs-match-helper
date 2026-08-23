import { afterEach, describe, expect, it } from 'vitest';
import { applyResolvedLocale } from '../i18n';
import { historyMapEnCaption, historyPrimaryMapTitle } from './matchHistoryDisplay';
import type { MatchHistoryListItem } from '@core/match/history';

afterEach(() => applyResolvedLocale('zh-CN'));

function item(mapName?: string): MatchHistoryListItem {
  return {
    id: 'game-1',
    platformId: 'perfect',
    savedAt: 1,
    updatedAt: 1,
    mapName,
  };
}

describe('match history list map names', () => {
  it('shows engine map ids in the list title', () => {
    expect(historyPrimaryMapTitle(item('死城之谜'))).toBe('de_cache');
    expect(historyPrimaryMapTitle(item('Cache'))).toBe('de_cache');
    expect(historyPrimaryMapTitle(item('de_cache'))).toBe('de_cache');
    expect(historyPrimaryMapTitle(item('荒漠迷城'))).toBe('de_mirage');
  });

  it('uses the localized common name as the caption', () => {
    expect(historyMapEnCaption(item('de_cache'))).toBe('死城之谜');
    applyResolvedLocale('en-US');
    expect(historyMapEnCaption(item('de_cache'))).toBe('Cache');
  });
});
