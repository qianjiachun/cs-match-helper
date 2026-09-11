import { describe, expect, it } from 'vitest';
import { buildMatchDetail } from './match-parser';

describe('Perfect legacy match parsing', () => {
  it('uses the enriched ELO when the live player list contains a zero placeholder', () => {
    const steamId = '76561198104088654';
    const detail = buildMatchDetail({
      players_list: [{ player_id: steamId, score: 0, roll_team_id: 1 }],
      playerlist_extrainfo: {
        data: {
          [steamId]: { score: 1876, nickname: 'Player' },
        },
      },
    });
    const player = [...detail.unassigned, ...detail.teams.flatMap((team) => team.players)]
      .find((item) => item.steamId === steamId);

    expect(player?.score).toBe(1876);
  });

  it('keeps a positive live ELO ahead of the extra-info fallback', () => {
    const steamId = '76561198104088654';
    const detail = buildMatchDetail({
      players_list: [{ player_id: steamId, score: 1946, roll_team_id: 1 }],
      playerlist_extrainfo: { data: { [steamId]: { score: 1876 } } },
    });
    const player = detail.teams.flatMap((team) => team.players)
      .find((item) => item.steamId === steamId);

    expect(player?.score).toBe(1946);
  });
});
