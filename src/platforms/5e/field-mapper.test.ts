import { describe, expect, it } from 'vitest';
import { buildP5ePlayer, parseP5eSpecialData, pickMapStats, resolveMatchMap } from './field-mapper';
import type { P5eMatchBundle } from './types';

const UUID_JERRY = '4ac0324d-66e6-11f1-bfd6-043f72fd82b0';

function makeBundle(partial: Partial<P5eMatchBundle>): P5eMatchBundle {
  return {
    platformGameId: '5e-test',
    uuids: [UUID_JERRY],
    matchMode: [9],
    capturedAt: new Date().toISOString(),
    mapName: 'de_dust2',
    ...partial,
  };
}

describe('P5e field mapper', () => {
  it('parses specialData recent matches', () => {
    const stats = parseP5eSpecialData(
      '{"match_data":[{"is_win":-1,"match_id":"g1"},{"is_win":1,"match_id":"g2"},{"is_win":0,"match_id":""}]}',
    );
    expect(stats.recentResults).toEqual(['lose', 'win']);
    expect(stats.latest10WinNum).toBe(1);
    expect(stats.latest10TotalNum).toBe(2);
    expect(stats.recentWinRate).toBe(0.5);
  });

  it('maps map-ext de_dust2 stats', () => {
    const map = pickMapStats(
      {
        de_dust2: {
          matchTotal: '18',
          winTotal: '5',
          perWin: 0.28,
          recentPerWin: 0.28,
          rating: 0.74,
          adr: 59.29,
          rws: 6.34,
        },
      },
      'de_dust2',
    );
    expect(map?.matchTotal).toBe(18);
    expect(map?.perWin).toBe(0.28);
    expect(map?.rating).toBe(0.74);
    expect(map?.adr).toBe(59.29);
    expect(map?.rws).toBe(6.34);
  });

  it('maps full player from three API shapes', () => {
    const bundle = makeBundle({
      userInfo: {
        url: 'https://platform-api.5eplay.com/api/user/info',
        requestBody: { uuids: [UUID_JERRY] },
        responseBody: {
          data: {
            [UUID_JERRY]: {
              username: '想吃jerry的奶酪',
              steam_id: '76561198738114681',
              avatar_url: 'disguise/images/56/b8/56b87d1c7dddcd017ce0e0da16d7cde8.jpg',
              csgo_rating: 0.58,
              csgo_elo_9: 776.1769767906753,
              csgo_match_count_9: 21,
              vip_grade: 2,
              credit_score: 100000,
            },
          },
        },
      },
      eloInfo: {
        url: 'https://gate.5eplay.com/.../elo/info/batch',
        requestBody: { user: [UUID_JERRY], match_mode: [9] },
        responseBody: {
          data: {
            [UUID_JERRY]: {
              modes: {
                '9': {
                  elo: 776.18,
                  matchTotal: 21,
                  levelId: 41,
                  rank: 1760646,
                  season: '2026s3',
                  maxElo: 776.18,
                  specialData:
                    '{"match_data":[{"is_win":0,"match_id":"","match_status":0,"change_elo":0}]}',
                },
              },
            },
          },
        },
      },
      mapExt: {
        url: 'https://gate.5eplay.com/.../map-ext/batch',
        requestBody: { uuids: [UUID_JERRY] },
        responseBody: {
          data: {
            [UUID_JERRY]: {
              de_dust2: {
                matchTotal: '18',
                winTotal: '5',
                perWin: 0.28,
                recentPerWin: 0.28,
                rating: 0.74,
                adr: 59.29,
                rws: 6.34,
                level: '4',
              },
            },
          },
        },
      },
    });

    const player = buildP5ePlayer(UUID_JERRY, 0, bundle, 'de_dust2');
    expect(player.nickname).toBe('想吃jerry的奶酪');
    expect(player.steamId).toBe('76561198738114681');
    expect(player.score).toBe(776.18);
    expect(player.seasonRating).toBe(0.74);
    expect(player.rating).toBe(0.74);
    expect(player.mapWinRate).toBe(0.28);
    expect(player.mapWinNum).toBe(5);
    expect(player.mapTotalNum).toBe(18);
    expect(player.adpr).toBe(59.29);
    expect(player.weRaw).toBe(6.34);
    expect(player.seasonTotalNum).toBe(21);
    expect(player.isVip).toBe(true);
    expect(player.rankDesc).toBe('2026s3 Lv.41 #1760646');
    expect(player.rankLevel).toBe('2026s3 Lv.41');
    expect(player.rankNum).toBe(1760646);
    expect(resolveMatchMap(bundle)).toBe('de_dust2');
  });

  it('resolves map from match detail before map-ext voting', () => {
    const bundle = makeBundle({
      mapName: undefined,
      matchDetail: { data: { main: { map: 'de_inferno' } } },
    });
    expect(resolveMatchMap(bundle)).toBe('de_inferno');
  });

  it('prefers fight stats and match detail team side when available', () => {
    const bundle = makeBundle({
      matchDetail: {
        data: {
          main: { map: 'de_dust2', map_desc: '炙热沙城' },
          group_1: [
            {
              user_info: {
                user_data: {
                  uuid: UUID_JERRY,
                  username: 'match详情昵称',
                  steam_id: '76561198738114681',
                },
              },
              fight: {
                rating: 1.28,
                adr: 92.5,
                rws: 10.2,
                kill: 22,
                death: 11,
                per_headshot: 0.42,
                first_kill: 4,
                first_death: 2,
              },
              sts: { change_elo: 15, rank: 999 },
              level_info: { level_name: 'S+', rank: 999 },
            },
          ],
          group_2: [],
        },
      },
      userInfo: {
        responseBody: {
          data: {
            [UUID_JERRY]: {
              username: 'user接口昵称',
              steam_id: '76561198738114681',
              csgo_rating: 0.58,
              csgo_elo_9: 776,
            },
          },
        },
      },
      eloInfo: {
        responseBody: {
          data: {
            [UUID_JERRY]: {
              modes: {
                '9': { elo: 776, matchTotal: 21, levelId: 41, rank: 1760646, season: '2026s3' },
              },
            },
          },
        },
      },
      mapExt: {
        responseBody: {
          data: {
            [UUID_JERRY]: {
              de_dust2: {
                matchTotal: '18',
                winTotal: '5',
                perWin: 0.28,
                rating: 0.74,
                adr: 59.29,
                rws: 6.34,
              },
            },
          },
        },
      },
    });

    const player = buildP5ePlayer(UUID_JERRY, 0, bundle, 'de_dust2');
    expect(player.nickname).toBe('match详情昵称');
    expect(player.teamSide).toBe(1);
    expect(player.seasonRating).toBe(1.28);
    expect(player.adpr).toBe(92.5);
    expect(player.weRaw).toBe(10.2);
    expect(player.kd).toBe(2);
    expect(player.hsRate).toBe(0.42);
    expect(player.firstKillSuccessRate).toBeCloseTo(4 / 6);
    expect(player.eloChange).toBe(15);
    expect(player.rankDesc).toBe('S+ #999');
    expect(player.rankLevel).toBe('S+');
    expect(player.rankNum).toBe(999);
  });
});
