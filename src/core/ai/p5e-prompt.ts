import type { MatchPlayer, MatchRecord, MatchTeam } from '@core/match/models';
import type { P5eMatchBundle } from '@platforms/5e/types';
import {
  calcFirstKillSuccessRate,
  calcHsRate,
  calcKd,
  getMatchDetailData,
  getMatchEntryForUuid,
  hasMatchDetailTeams,
  type P5ePlayerMatchEntry,
} from '@platforms/5e/match-detail-parser';
import { numOrUndef } from '@platforms/5e/field-mapper';
import { AI_USER_PROMPT_SCHEMA, AI_OUTPUT_LANGUAGE_RULES } from './ai-prompt-schema';
import { P5E_METRIC_BASELINES_TEXT, p5eMapFitHint } from './p5e-baselines';
import type { StartAiAnalysisInput } from './types';

export const P5E_SYSTEM_PROMPT = `你是 CS2 5E 对战平台赛前分析助手。你只能基于输入数据做概率判断，不要编造缺失字段。
所有 player 在输出文案中必须称为「玩家」，禁止使用「球员」。
请结合 CS2 对局理解：地图控制、首杀/补枪、道具、狙击、残局、近期 ELO 状态与当前地图适配度。
输出必须是严格 JSON，不要 Markdown，不要代码块。
胜率不是确定结果，winProbability.A + winProbability.B 必须等于 100。
confidence 为 0-100 整数，表示你对本次判断的数据把握度（不是胜率），样本不足时必须降低。

5E 指标语义（务必按此理解，禁止套用完美世界 Rating Pro 语境）：
- score = 5E 当前 ELO，优先来自 elo/info modes[9].elo
- seasonTotalNum = 当前赛季模式场次；<5 场必须降低置信度并在 risks 说明
- seasonRating = 若有 match detail，表示当局 fight.rating；否则多为当前地图 Rating
- rating / adpr / weRaw = 5E 地图或当局 Rating / ADR / RWS，不是完美 Rating Pro
- recentRatings = 近期 ELO 变化序列，不是 Rating 均值
- mapWinRate / mapTotalNum / mapSampleLow = 当前地图历史样本与胜率质量
- eloChange / rankLevel / rankNum / tags = 段位、排名和本场 ELO 变化辅助信息

判断原则：
- ELO 差距是基础强度参考，不能单独决定胜率
- 地图历史样本充足时提升地图适配权重；样本低时必须在 dataQuality 和 risks 说明
- 近期 ELO 波动与连胜连败用于状态判断，但不要把单场大加减分简单等同强弱
- 无 match detail 时地图与分队可能为推断，必须降低 confidence
- keyFactors.type 优先使用 strength | map | form | risk；5E 一般不要输出 party（无可靠组排数据）
- quickReasons 至少包含一条来自 ELO / 地图 / 近期状态 / 数据质量的核心依据
- playerNotes 只点评真正影响局势的玩家（高 ELO、地图强弱极端、近期波动大、当局表现异常、低样本风险）
- 禁止输出「完美平台」「PerfectPower」「Rating Pro」等完美专属词

${AI_OUTPUT_LANGUAGE_RULES}

${P5E_METRIC_BASELINES_TEXT}`;

function round(n: number | undefined, digits = 2): number | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function formatPct(n: number | undefined): string | undefined {
  if (n == null) return undefined;
  return `${Math.round(n * 100)}%`;
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

function getP5eBundle(record: MatchRecord): P5eMatchBundle | undefined {
  const bundle = record.data?.p5eBundle;
  if (bundle && typeof bundle === 'object') return bundle as P5eMatchBundle;
  return undefined;
}

function getUserApiData(bundle: P5eMatchBundle): Record<string, Record<string, unknown>> | undefined {
  const body = bundle.userInfo?.responseBody;
  if (!body || typeof body !== 'object') return undefined;
  const data = (body as Record<string, unknown>).data;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, Record<string, unknown>>)
    : undefined;
}

function findUuidForPlayer(bundle: P5eMatchBundle, player: MatchPlayer): string | undefined {
  const data = getUserApiData(bundle);
  if (data) {
    for (const [uuid, row] of Object.entries(data)) {
      const steamId = row?.steam_id;
      const username = row?.username;
      if (typeof steamId === 'string' && steamId === player.steamId) return uuid;
      if (typeof username === 'string' && username === player.nickname) return uuid;
    }
  }
  return bundle.uuids.find((uuid) => player.steamId === `5e-${uuid.slice(0, 8)}`);
}

function summarizeMatchFight(entry?: P5ePlayerMatchEntry) {
  const fight = entry?.fight;
  if (!fight) return undefined;

  return compact({
    rating: round(numOrUndef(fight.rating)),
    rating2: round(numOrUndef(fight.rating2)),
    adr: round(numOrUndef(fight.adr), 1),
    rws: round(numOrUndef(fight.rws), 1),
    kast: round(numOrUndef(fight.kast)),
    kd: calcKd(fight),
    hsRate: formatPct(calcHsRate(fight)),
    firstKillRate: formatPct(calcFirstKillSuccessRate(fight)),
    kills: numOrUndef(fight.kill),
    deaths: numOrUndef(fight.death),
    assists: numOrUndef(fight.assist),
    firstKill: numOrUndef(fight.first_kill),
    firstDeath: numOrUndef(fight.first_death),
    awpKills: numOrUndef(fight.awp_kill),
    clutch1v2: numOrUndef(fight.end_1v2),
    utilityDmg: numOrUndef(fight.throw_harm_enemy),
    isMvp: fight.is_mvp === '1' ? true : undefined,
  });
}

function summarizeMatchSts(entry?: P5ePlayerMatchEntry) {
  const sts = entry?.sts;
  if (!sts) return undefined;

  const levelInfo = entry?.level_info;
  return compact({
    originElo: numOrUndef(sts.origin_elo),
    changeElo: numOrUndef(sts.change_elo),
    originRank: numOrUndef(sts.origin_rank),
    rank: numOrUndef(sts.rank),
    levelName: typeof levelInfo?.level_name === 'string' ? levelInfo.level_name : undefined,
  });
}

function summarizeP5ePlayer(
  player: MatchPlayer,
  side: 'A' | 'B',
  bundle?: P5eMatchBundle,
) {
  const recent = player.recentResults
    .map((r) => (r === 'win' ? 'W' : r === 'lose' ? 'L' : 'D'))
    .join('');

  const uuid = bundle ? findUuidForPlayer(bundle, player) : undefined;
  const matchEntry = bundle && uuid ? getMatchEntryForUuid(bundle, uuid) : undefined;

  return compact({
    steamId: player.steamId,
    nickname: player.nickname,
    side,
    elo: round(player.score, 0),
    rankLevel: player.rankLevel,
    rankNum: player.rankNum,
    rankDesc: player.rankDesc,
    seasonMatches: player.seasonTotalNum,
    seasonLowSample: player.seasonTotalNum != null && player.seasonTotalNum < 5 ? true : undefined,
    mapRating: round(player.rating),
    mapAdr: round(player.adpr, 1),
    mapRws: round(player.weRaw, 1),
    matchRating: round(player.seasonRating),
    kd: round(player.kd),
    hsRate: formatPct(player.hsRate),
    firstKillRate: formatPct(player.firstKillSuccessRate),
    mapWinRate: formatPct(player.mapWinRate),
    mapMatches: player.mapTotalNum,
    mapSampleLow: player.mapSampleLow || undefined,
    recentForm: recent || undefined,
    recentWinRate: formatPct(player.recentWinRate),
    recentEloChanges: player.recentRatings.length ? player.recentRatings.slice(-5) : undefined,
    continuedWins: player.continuedWins,
    eloChange: player.eloChange,
    tags: player.tags.length ? player.tags : undefined,
    isVip: player.isVip || undefined,
    matchDetailStats: matchEntry
      ? compact({
          fight: summarizeMatchFight(matchEntry),
          sts: summarizeMatchSts(matchEntry),
        })
      : undefined,
  });
}

function summarizeP5eTeam(team: MatchTeam, bundle?: P5eMatchBundle) {
  const players = team.players;
  return compact({
    side: team.side,
    avgElo: round(team.avgScore, 0),
    avgRating: round(team.avgRating),
    avgAdr: round(team.avgAdpr, 1),
    avgRws: round(team.avgWe, 1),
    avgKd: round(team.avgKd),
    recentWinRate: formatPct(team.recentWinRate),
    mapWinRate: formatPct(team.mapWinRate),
    strengthScore: round(team.strengthScore, 0),
    lowMapSampleCount: players.filter((p) => p.mapSampleLow).length || undefined,
    lowSeasonMatchCount:
      players.filter((p) => (p.seasonTotalNum ?? 0) < 5).length || undefined,
    players: players.map((p) => summarizeP5ePlayer(p, team.side, bundle)),
  });
}

function assessP5eDataQuality(record: MatchRecord, bundle?: P5eMatchBundle) {
  const missing: string[] = [];
  if (!bundle?.userInfo) missing.push('userInfo');
  if (!bundle?.eloInfo) missing.push('eloInfo');
  if (!bundle?.mapExt) missing.push('mapExt');

  const hasMatchDetail = Boolean(bundle?.matchDetail);
  const officialTeams = bundle ? hasMatchDetailTeams(bundle) : false;

  return compact({
    missingApis: missing.length ? missing : undefined,
    hasMatchDetail,
    officialTeams,
    teamSource: officialTeams ? 'matchDetail' : 'inferred',
    parseWarnings: record.detail.parseWarnings.length ? record.detail.parseWarnings : undefined,
    mapInferred: !hasMatchDetail ? true : undefined,
    teamsInferred: !officialTeams ? true : undefined,
  });
}

function summarizeP5eMatchContext(record: MatchRecord, bundle?: P5eMatchBundle) {
  const data = bundle ? getMatchDetailData(bundle) : undefined;
  const main = data?.main as Record<string, unknown> | undefined;
  const officialTeams = bundle ? hasMatchDetailTeams(bundle) : false;

  return compact({
    matchId: record.id,
    platformGameId: record.summary.platformGameId,
    mapName: record.detail.mapName,
    mapDesc: record.summary.serverName,
    mode: record.summary.mode,
    officialMap: typeof main?.map === 'string' ? main.map : undefined,
    hasMatchDetail: Boolean(bundle?.matchDetail),
    teamSource: officialTeams ? 'matchDetail' : 'inferred',
    group1Score: numOrUndef(main?.group1_all_score),
    group2Score: numOrUndef(main?.group2_all_score),
    matchWinner: numOrUndef(main?.match_winner),
    readyLeftSeconds: record.detail.readyLeftTimeMs
      ? Math.floor(record.detail.readyLeftTimeMs / 1000)
      : undefined,
  });
}

export interface P5eMatchSummaryPayload {
  platform: '5e';
  match: ReturnType<typeof summarizeP5eMatchContext>;
  dataQuality: ReturnType<typeof assessP5eDataQuality>;
  mapFitHint?: string;
  teams: ReturnType<typeof summarizeP5eTeam>[];
  localInsights?: {
    note: string;
    strongerSide?: 'A' | 'B';
    scoreDiff: number;
    ratingDiff: number;
    highlights: string[];
    risks: string[];
    tendencies: string[];
  };
}

export function buildP5eMatchSummary(record: MatchRecord): P5eMatchSummaryPayload {
  const bundle = getP5eBundle(record);
  const mapName = record.detail.mapName;

  const localInsights = record.detail.insights
    ? {
        note: '以下为本地启发式聚合结果，仅供参考，请结合原始指标独立判断',
        strongerSide: record.detail.insights.strongerSide,
        scoreDiff: round(record.detail.insights.scoreDiff, 0) ?? 0,
        ratingDiff: round(record.detail.insights.ratingDiff) ?? 0,
        highlights: record.detail.insights.highlights.slice(0, 4),
        risks: record.detail.insights.risks.slice(0, 4),
        tendencies: record.detail.insights.tendencies.slice(0, 3),
      }
    : undefined;

  return {
    platform: '5e',
    match: summarizeP5eMatchContext(record, bundle),
    dataQuality: assessP5eDataQuality(record, bundle),
    mapFitHint: p5eMapFitHint(mapName),
    teams: record.detail.teams.map((t) => summarizeP5eTeam(t, bundle)),
    localInsights,
  };
}

export function buildP5eAiAnalysisRequest(record: MatchRecord): StartAiAnalysisInput {
  const summary = buildP5eMatchSummary(record);
  return {
    matchId: record.id,
    systemPrompt: P5E_SYSTEM_PROMPT,
    userPrompt: AI_USER_PROMPT_SCHEMA + JSON.stringify(summary),
  };
}
