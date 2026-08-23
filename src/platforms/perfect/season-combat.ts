import type {
  PerfectClutchAttempt,
  PerfectSeasonCombat,
} from '@core/match/models';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function objectValue(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

export function ratio(numerator: unknown, denominator: unknown): number | undefined {
  const top = numberValue(numerator);
  const bottom = numberValue(denominator);
  if (top == null || bottom == null || bottom <= 0) return undefined;
  return top / bottom;
}

function detailRaw(dimension: JsonObject, key: string): number | undefined {
  return numberValue(objectValue(dimension.detail)[key]);
}

function compact<T extends Record<string, unknown>>(value: T): T | undefined {
  const next = Object.fromEntries(Object.entries(value).filter(([, item]) => (
    item != null && item !== '' && (!Array.isArray(item) || item.length > 0)
      && (typeof item !== 'object' || Object.keys(item as object).length > 0)
  ))) as T;
  return Object.keys(next).length ? next : undefined;
}

function clutchAttempt(wins: unknown, attempts: unknown): PerfectClutchAttempt | undefined {
  return compact({
    wins: numberValue(wins),
    attempts: numberValue(attempts),
    rate: ratio(wins, attempts),
  });
}

export function buildPerfectSeasonCombat(
  ladder: JsonObject,
  radar: JsonObject,
  data: JsonObject,
): PerfectSeasonCombat {
  const first = objectValue(radar.first);
  const item = objectValue(radar.item);
  const firePower = objectValue(radar.fire_power);
  const sniper = objectValue(radar.sniper);
  const clutchRadar = objectValue(radar['1vn']);
  const app = objectValue(radar.app);
  const matches = numberValue(data.cnt ?? ladder.match_count);
  const rounds = numberValue(ladder.round_count);
  const kills = numberValue(data.kills ?? ladder.kill_num);
  const firstKills = numberValue(ladder.first_kill_num);
  const firstDeaths = numberValue(ladder.first_death_num);
  const v1 = clutchAttempt(data.vs1 ?? ladder['1v1_num'], ladder['1v1_total']);
  const v2plusWins = ['1v2_num', '1v3_num', '1v4_num', '1v5_num']
    .map((key) => numberValue(ladder[key]))
    .reduce<number | undefined>((sum, value) => (
      value == null ? sum : (sum ?? 0) + value
    ), undefined);
  const v2plusAttempts = ['1v2_total', '1v3_total', '1v4_total', '1v5_total']
    .map((key) => numberValue(ladder[key]))
    .reduce<number | undefined>((sum, value) => (
      value == null ? sum : (sum ?? 0) + value
    ), undefined);

  return compact({
    kast: ratio(ladder.kast_total, rounds),
    tradeFragRate: ratio(ladder.trade_frag_count, ladder.trade_frag_try_count),
    clutch1v1Rate: v1?.rate,
    clutch1v1Attempts: v1?.attempts,
    matchMvpCount: numberValue(data.matchMvpCount ?? ladder.match_mvp_num),
    roundMvpCount: numberValue(data.mvpCount ?? ladder.mvp_num),
    seasonWinNum: numberValue(ladder.win_num),
    seasonDrawNum: numberValue(ladder.draw_num),
    sides: compact({
      ct: compact({ rating: numberValue(ladder.pw_rating_ct_avg) ?? detailRaw(app, 'pw_rating_ct_avg_raw') }),
      t: compact({ rating: numberValue(ladder.pw_rating_t_avg) ?? detailRaw(app, 'pw_rating_t_avg_raw') }),
    }),
    opening: compact({
      firstKillRate: ratio(firstKills, rounds),
      openingDuelRate: firstKills != null && firstDeaths != null && (firstKills + firstDeaths) > 0
        ? firstKills / (firstKills + firstDeaths)
        : undefined,
      firstHurtPerMatch: ratio(ladder.first_hurt_num, matches) ?? detailRaw(first, 'first_hurt_raw'),
      winAfterOpeningKill: ratio(ladder.first_kill_win_round, firstKills)
        ?? detailRaw(first, 'win_after_opening_kill_raw'),
    }),
    utility: compact({
      flashAssistPerRound: ratio(ladder.flash_assist_count, rounds) ?? detailRaw(item, 'flash_assist_per_round_raw'),
      flashRate: detailRaw(item, 'flashbang_flash_rate_raw'),
      enemyFlashTimePerRound: detailRaw(item, 'time_opponent_flashed_per_round_raw'),
      utilDmgPerRound: detailRaw(item, 'utility_damage_per_rounds_raw'),
      itemRate: detailRaw(item, 'item_rate_raw'),
    }),
    aim: compact({
      avgTimeToKillMs: ratio(ladder.time_to_kill_total, ladder.time_to_kill_count) ?? detailRaw(objectValue(radar.marksmanship), 'kill_time_raw'),
      sprayHitRate: ratio(ladder.sm_hit_count, ladder.sm_shot_count) ?? detailRaw(objectValue(radar.marksmanship), 'sm_hit_rate_raw'),
      killsPerRound: ratio(kills, rounds) ?? detailRaw(firePower, 'kills_per_round_raw'),
      killsPerWinRound: ratio(ladder.win_round_kill, ladder.win_round_count) ?? detailRaw(firePower, 'kills_per_win_round_raw'),
      dmgPerRound: numberValue(ladder.adpr) ?? detailRaw(firePower, 'damage_per_round_raw'),
      dmgPerWinRound: ratio(ladder.win_dmg_health, ladder.win_round_count) ?? detailRaw(firePower, 'damage_per_round_win_raw'),
      roundsWithAKill: ratio(ladder.kill_round, rounds) ?? detailRaw(firePower, 'rounds_with_a_kill_raw'),
      pistolRating: detailRaw(firePower, 'pistol_round_rating_raw'),
    }),
    sniper: compact({
      killShare: ratio(ladder.sniper_kill_num, kills) ?? detailRaw(sniper, 'sniper_kills_percentage_raw'),
      firstKills: numberValue(ladder.sniper_first_kill),
      killsPerSniperRound: detailRaw(sniper, 'sniper_kill_per_round_raw')
        ?? ratio(ladder.sniper_kill_num, ladder.sniper_kill_round),
      multiKillRoundRate: ratio(ladder.sniper_multiple_kill_round, rounds)
        ?? detailRaw(sniper, 'sniper_multiple_kill_round_percentage_raw'),
      holdRounds: numberValue(ladder.sniper_hold_round_count),
      reactionMs: ratio(ladder.sniper_reaction_time_total, ladder.sniper_reaction_time_count),
    }),
    clutch: compact({
      allRate: numberValue(data.vs1WinRate ?? ladder['1vx_rate']),
      v1,
      v2plus: clutchAttempt(v2plusWins, v2plusAttempts),
      lastAliveRate: ratio(ladder.only_alive_count, rounds) ?? detailRaw(clutchRadar, 'last_alive_percentage_raw'),
      savesPerLossRound: ratio(ladder.save_weapon_loss_round, ladder.loss_round_count)
        ?? detailRaw(clutchRadar, 'saves_per_round_loss_raw'),
      timeAlivePerRound: ratio(ladder.alive_time, rounds) ?? detailRaw(clutchRadar, 'time_alive_per_round_raw'),
    }),
    form: compact({
      ratingChange: numberValue(ladder.pw_rating_avg_change),
      adrChange: numberValue(ladder.adpr_change),
      kdChange: numberValue(ladder.kd_change),
      winRateChange: numberValue(ladder.win_rate_change),
      rwsChange: numberValue(ladder.rws_avg_change),
    }),
  }) ?? {};
}
