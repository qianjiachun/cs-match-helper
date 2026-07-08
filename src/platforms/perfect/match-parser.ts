import type { LogLine } from '@core/log/types';
import { finalizeMatchDetail } from '@core/match/insights';
import type {
  MatchDetail,
  MatchPlayer,
  MatchRecord,
  MatchSummary,
  MatchTeam,
  RadarDimension,
} from '@core/match/models';
import { pickPlayerAvatar } from './media-url';
import { computePerfectReadyDeadline } from './ready-deadline';

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    if (typeof val === 'string' && val.trim() && !Number.isNaN(Number(val))) return Number(val);
  }
  return undefined;
}

function pickBool(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'boolean') return val;
    if (val === 1 || val === '1') return true;
    if (val === 0 || val === '0') return false;
  }
  return undefined;
}

function pickPlayers(data: Record<string, unknown>): Record<string, unknown>[] {
  const list = data.players_list ?? data.players ?? data.player_list;
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is Record<string, unknown> => p != null && typeof p === 'object');
}

function parseExtraInfo(raw: unknown): {
  data: Record<string, Record<string, unknown>>;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (raw == null) return { data: {}, warnings: ['缺少 playerlist_extrainfo'] };

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      warnings.push('playerlist_extrainfo 解析失败');
      return { data: {}, warnings };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    warnings.push('playerlist_extrainfo 格式无效');
    return { data: {}, warnings };
  }

  const root = parsed as Record<string, unknown>;
  const inner = root.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return { data: inner as Record<string, Record<string, unknown>>, warnings };
  }

  warnings.push('playerlist_extrainfo 缺少 data 字段');
  return { data: {}, warnings };
}

function pickRadarRaw(
  chart: Record<string, unknown>,
  dim: string,
  field: string,
): number | undefined {
  const d = chart[dim];
  if (!d || typeof d !== 'object') return undefined;
  const detail = (d as Record<string, unknown>).detail;
  if (!detail || typeof detail !== 'object') return undefined;
  const raw = (detail as Record<string, unknown>)[field];
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() && !Number.isNaN(Number(raw))) return Number(raw);
  return undefined;
}

function parseCombatStats(extra: Record<string, unknown>): {
  kd?: number;
  hsRate?: number;
  firstKillSuccessRate?: number;
  rapidStopSuccessRate?: number;
  reactionTime?: number;
  clutchWinRate?: number;
  weRaw?: number;
} {
  const chart = extra.radar_chart;
  if (!chart || typeof chart !== 'object') return {};

  const c = chart as Record<string, unknown>;
  const kpr = pickRadarRaw(c, 'fire_power', 'kills_per_round_raw');
  const rwak = pickRadarRaw(c, 'fire_power', 'rounds_with_a_kill_raw');

  let kd: number | undefined;
  if (kpr != null && rwak != null) {
    const estDeaths = Math.max(0.35, 1 - rwak * 0.55);
    kd = kpr / estDeaths;
  }

  return {
    kd,
    hsRate: pickRadarRaw(c, 'marksmanship', 'headshot_rate_raw'),
    firstKillSuccessRate: pickRadarRaw(c, 'first', 'first_success_rate_raw'),
    rapidStopSuccessRate: pickRadarRaw(c, 'marksmanship', 'rapid_stop_rate_raw'),
    reactionTime: pickRadarRaw(c, 'marksmanship', 'reaction_time_raw'),
    clutchWinRate: pickRadarRaw(c, '1vn', 'v1_win_percentage_raw'),
    weRaw: pickRadarRaw(c, 'fire_power', 'we_raw'),
  };
}

function parseRadar(extra: Record<string, unknown>): Record<string, RadarDimension> {
  const chart = extra.radar_chart;
  if (!chart || typeof chart !== 'object') return {};

  const result: Record<string, RadarDimension> = {};
  for (const [key, val] of Object.entries(chart as Record<string, unknown>)) {
    if (key === 'description' || !val || typeof val !== 'object') continue;
    const dim = val as Record<string, unknown>;
    const score = pickNumber(dim, ['score']);
    if (score == null) continue;
    result[key] = {
      score,
      level: pickString(dim, ['level']),
    };
  }
  return result;
}

function parseRecentStats(extra: Record<string, unknown>): {
  winRate?: number;
  drawCount: number;
  results: Array<'win' | 'lose' | 'draw'>;
  ratings: number[];
  weAvg?: number;
  ratingAvg?: number;
  winNum?: number;
  totalNum?: number;
} {
  const recent = extra.recent_10_stats;
  if (!recent || typeof recent !== 'object') {
    return { drawCount: 0, results: [], ratings: [] };
  }

  const r = recent as Record<string, unknown>;
  const winStats = Array.isArray(r.win_stats) ? r.win_stats : [];
  const results = winStats.map((w) => {
    const s = String(w).toLowerCase();
    if (s === 'win') return 'win' as const;
    if (s === 'draw') return 'draw' as const;
    return 'lose' as const;
  });

  const wins = results.filter((x) => x === 'win').length;
  const counted = results.filter((x) => x !== 'draw').length;
  const drawCount = results.filter((x) => x === 'draw').length;

  const ratings = (Array.isArray(r.pw_rating_list) ? r.pw_rating_list : [])
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  return {
    winRate: counted > 0 ? wins / counted : undefined,
    drawCount,
    results,
    ratings,
    weAvg: pickNumber(r, ['we_avg']),
    ratingAvg: pickNumber(r, ['pw_rating_avg']),
    winNum: wins,
    totalNum: results.length,
  };
}

function buildTags(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
  recent: ReturnType<typeof parseRecentStats>,
): string[] {
  const tags: string[] = [];
  if (pickBool(base, ['is_single']) ?? pickNumber(base, ['is_single']) === 1) {
    tags.push('单排');
  }
  if (pickBool(extra, ['is_green']) ?? pickNumber(extra, ['is_green']) === 1) {
    tags.push('绿色');
  }
  if (pickBool(extra, ['isVip'])) tags.push('VIP');
  if (recent.drawCount > 0) tags.push(`${recent.drawCount} 平`);
  const rankList = extra.perfectPower;
  if (rankList && typeof rankList === 'object') {
    const pp = rankList as Record<string, unknown>;
    const achieved = pp.achievedRankList;
    if (Array.isArray(achieved) && achieved.length > 0) {
      const first = achieved[0] as Record<string, unknown>;
      const desc = pickString(first, ['rankDesc']);
      if (desc) tags.push(desc);
    }
  }
  return tags;
}

function mergePlayer(
  raw: Record<string, unknown>,
  extraMap: Record<string, Record<string, unknown>>,
): MatchPlayer {
  const steamId = String(raw.player_id ?? raw.uid ?? raw.steamId ?? '');
  const extra = extraMap[steamId] ?? {};

  const teamSide = pickNumber(raw, ['roll_team_id', 'slot_type']) ?? 1;
  const recent = parseRecentStats(extra);
  const combat = parseCombatStats(extra);

  const seasonWin = pickNumber(extra, ['season_win_num']);
  const seasonTotal = pickNumber(extra, ['season_total_num']);
  const mapWin = pickNumber(extra, ['season_map_win_num']);
  const mapTotal = pickNumber(extra, ['season_map_total_num']);

  const mapWinNum = mapWin ?? (typeof extra.season_map_win_num === 'string' ? Number(extra.season_map_win_num) : undefined);
  const mapTotalNum = mapTotal ?? (typeof extra.season_map_total_num === 'string' ? Number(extra.season_map_total_num) : undefined);

  let mapWinRate: number | undefined;
  let mapSampleLow = false;
  if (mapWinNum != null && mapTotalNum != null && mapTotalNum > 0) {
    mapWinRate = mapWinNum / mapTotalNum;
    if (mapTotalNum < 3) mapSampleLow = true;
  }

  let seasonWinRate: number | undefined;
  if (seasonWin != null && seasonTotal != null && seasonTotal > 0) {
    seasonWinRate = seasonWin / seasonTotal;
  }

  const pp = extra.perfectPower;
  let perfectPower: number | undefined;
  let rankDesc: string | undefined;
  if (pp && typeof pp === 'object') {
    const p = pp as Record<string, unknown>;
    perfectPower = pickNumber(p, ['perfectPower']);
  }
  const achieved = (pp as Record<string, unknown> | undefined)?.achievedRankList;
  if (Array.isArray(achieved) && achieved[0] && typeof achieved[0] === 'object') {
    rankDesc = pickString(achieved[0] as Record<string, unknown>, ['rankDesc']);
  }

  const zqId = pickString(extra, ['zq_id']);

  return {
    steamId,
    nickname: pickString(extra, ['nickname', 'nick_name', 'name'])
      ?? pickString(raw, ['nickname', 'nick_name', 'name'])
      ?? steamId.slice(-6),
    avatar: pickPlayerAvatar(extra),
    score: pickNumber(raw, ['score']) ?? pickNumber(extra, ['score']),
    teamSide,
    slotType: pickNumber(raw, ['slot_type']),
    isSingle: pickBool(raw, ['is_single']) ?? pickNumber(raw, ['is_single']) === 1,
    troopTeamId: pickNumber(raw, ['troop_team_id']),
    isGreen: pickBool(raw, ['is_green']) ?? pickBool(extra, ['is_green']),
    isVip: pickBool(extra, ['isVip']),
    adpr: pickNumber(extra, ['adpr']),
    rating: recent.ratingAvg,
    seasonRating: pickNumber(extra, ['season_rating_pro_average']),
    kd: combat.kd,
    hsRate: combat.hsRate,
    firstKillSuccessRate: combat.firstKillSuccessRate,
    rapidStopSuccessRate: combat.rapidStopSuccessRate,
    reactionTime: combat.reactionTime,
    clutchWinRate: combat.clutchWinRate,
    weRaw: combat.weRaw,
    weAvg: recent.weAvg,
    recentWinRate: recent.winRate,
    recentDrawCount: recent.drawCount,
    seasonWinRate,
    seasonWinNum: seasonWin,
    seasonTotalNum: seasonTotal,
    mapWinRate,
    mapWinNum: mapWinNum,
    mapTotalNum: mapTotalNum,
    latest10WinNum: pickNumber(extra, ['latest_10_win_num']) ?? recent.winNum,
    latest10TotalNum: pickNumber(extra, ['latest_10_total_num']) ?? recent.totalNum,
    continuedWins: pickNumber(extra, ['continued_wins']),
    mapSampleLow,
    perfectPower,
    rankDesc,
    radar: parseRadar(extra),
    recentResults: recent.results.slice(-5),
    recentRatings: recent.ratings,
    tags: buildTags(raw, extra, recent),
    platformBoardId: zqId || undefined,
  };
}

function groupTeams(players: MatchPlayer[]): { teams: MatchTeam[]; unassigned: MatchPlayer[] } {
  const bySide = new Map<number, MatchPlayer[]>();
  for (const p of players) {
    const side = p.teamSide;
    if (!bySide.has(side)) bySide.set(side, []);
    bySide.get(side)!.push(p);
  }

  const sides = [...bySide.keys()].sort((a, b) => a - b);
  if (sides.length === 0) {
    return { teams: [], unassigned: players };
  }

  const teams: MatchTeam[] = sides.slice(0, 2).map((id, idx) => ({
    side: idx === 0 ? 'A' : 'B',
    id,
    players: bySide.get(id) ?? [],
    singleCount: 0,
    partyGroups: [],
  }));

  const assigned = new Set(teams.flatMap((t) => t.players));
  const unassigned = players.filter((p) => !assigned.has(p));

  return { teams, unassigned };
}

export function buildMatchDetail(
  data: Record<string, unknown>,
  logLine?: LogLine,
): MatchDetail {
  const { data: extraMap, warnings } = parseExtraInfo(data.playerlist_extrainfo);
  const rawPlayers = pickPlayers(data);
  const players = rawPlayers.map((p) => mergePlayer(p, extraMap));
  const { teams, unassigned } = groupTeams(players);

  const readyLeftFromLog = pickNumber(data, ['ready_left_time_ms']);
  const readyDeadlineAt = logLine
    ? computePerfectReadyDeadline(logLine, readyLeftFromLog)
    : undefined;

  const detail: MatchDetail = {
    platformId: 'perfect',
    platformGameId: pickString(data, ['platform_game_id', 'platformGameId']),
    mapName: pickString(data, ['map_name', 'mapName', 'map']),
    readyDeadlineAt,
    readyLeftTimeMs: readyDeadlineAt != null
      ? Math.max(0, readyDeadlineAt - Date.now())
      : readyLeftFromLog,
    isGreen: pickBool(data, ['is_green']),
    isSingle: pickBool(data, ['is_single']),
    isGrudgeMatch: pickBool(data, ['is_grudge_match']),
    teams,
    unassigned,
    hasExtraInfo: Object.keys(extraMap).length > 0,
    parseWarnings: warnings,
  };

  if (players.length > 0 && Object.keys(extraMap).length === 0) {
    detail.parseWarnings.push('仅基础玩家数据，缺少扩展统计');
  }

  return finalizeMatchDetail(detail);
}

export function summarizeMatch(data: Record<string, unknown>): MatchSummary {
  const players = pickPlayers(data);
  return {
    playerCount: players.length,
    mapName: pickString(data, ['map_name', 'mapName', 'map', 'map_id']),
    serverName: pickString(data, ['server_name', 'serverName', 'server', 'svr_name']),
    mode: pickString(data, ['game_mode', 'gameMode', 'mode', 'match_type']),
    platformGameId: pickString(data, ['platform_game_id', 'platformGameId']),
  };
}

export function parseMatchInput(
  text: string,
): { data: Record<string, unknown> } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '内容为空' };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown> };
    }
    return { error: 'JSON 需为对象' };
  } catch {
    return { error: 'JSON 解析失败，请粘贴解码后的匹配 JSON' };
  }
}

export function createMatchRecord(
  id: string,
  logLine: LogLine,
  data: Record<string, unknown>,
): MatchRecord {
  return {
    id,
    platformId: 'perfect',
    time: logLine.time,
    level: logLine.level,
    category: logLine.category,
    data,
    summary: summarizeMatch(data),
    detail: buildMatchDetail(data, logLine),
  };
}
