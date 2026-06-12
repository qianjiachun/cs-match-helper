import type { MatchPlayer, MatchRecord } from '@core/match/models';
import type { AiPlayerNote } from './types';

export interface EnrichedPlayerNote extends AiPlayerNote {
  avatar?: string;
  score?: number;
  rating?: number;
  /** loading 态占位，非 AI 正式点评 */
  isPending?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  entry: '突破',
  awp: '狙击',
  lurk: '潜伏',
  anchor: '守点',
  support: '辅助',
  risk: '风险点',
};

export function formatPlayerRole(role?: string): string | null {
  if (!role) return null;
  return ROLE_LABELS[role.toLowerCase()] ?? role;
}

function buildPlayerLookup(match: MatchRecord): Map<string, MatchPlayer> {
  const map = new Map<string, MatchPlayer>();
  for (const team of match.detail.teams) {
    for (const p of team.players) {
      map.set(p.steamId, p);
    }
  }
  return map;
}

export function enrichPlayerNotes(
  notes: AiPlayerNote[],
  match: MatchRecord,
): EnrichedPlayerNote[] {
  const lookup = buildPlayerLookup(match);
  return notes.map((note) => {
    const player = lookup.get(note.steamId);
    return {
      ...note,
      avatar: player?.avatar,
      score: player?.score,
      rating: player?.rating,
    };
  });
}

/** loading 且 AI 尚未返回 playerNotes 时，用本地 insights 占位 */
export function placeholderPlayerNotes(match: MatchRecord): EnrichedPlayerNote[] {
  const topPlayers = match.detail.insights?.topPlayers;
  if (!topPlayers?.length) return [];

  return topPlayers.map((p) => {
    const team = match.detail.teams.find((t) =>
      t.players.some((pl) => pl.steamId === p.steamId),
    );
    return {
      steamId: p.steamId,
      nickname: p.nickname,
      side: team?.side ?? 'A',
      text: '待 AI 点评…',
      avatar: p.avatar,
      score: p.score,
      rating: p.rating,
      isPending: true,
    };
  });
}
