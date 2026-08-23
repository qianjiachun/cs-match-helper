import type { MatchPlayer, MatchRecord, MatchTeam, PerfectHotMap } from '@core/match/models';
import { AI_OUTPUT_LANGUAGE_RULES, getAiOutputLanguageRules, getAiUserPromptSchema, type AiOutputLocale } from './ai-prompt-schema';
import { METRIC_BASELINES_TEXT, mapFitHint } from './baselines';
import { buildP5eAiAnalysisRequest } from './p5e-prompt';
import { sanitizeAiAnalysisResult } from './sanitize-result';
import type { StartAiAnalysisInput } from './types';
import {
  buildAiAnalysisContext,
  buildAiPromptEvidence,
  parseAiAnalysisJson,
  type AiAnalysisContext,
} from './analysis-v2';
import { findPerfectHotMap, getPerfectMapFamiliarity, getPerfectMapMetrics, isPerfectMapStrong } from '@platforms/perfect/map-pool';
import { getPerfectRankDisplay } from '@platforms/perfect/rank';

export const PERFECT_SYSTEM_PROMPT = `你是 CS2 完美世界匹配赛前分析助手。只能基于输入数据做概率判断，不得编造缺失字段。
输出必须是严格 JSON，不要 Markdown 或代码块；winProbability.A + winProbability.B 必须等于 100，confidence 为 0-100 的数据把握度。
以双方和队内相对差异为主，绝不能把任何单项绝对值直接等同于胜率。
优先分析当前地图匹配度、组排协同、ELO、Rating、ADR、K/D、RWS、赛季 WE、首杀、道具、残局、反应时间、CT/T 倾向与近期状态。
weaponSpecialty 只能推断 AWP 或步枪专项倾向，不能单独判定玩家整体强弱。
mapWinRate 必须结合当前地图样本量解释，不代表跨赛季经验；低于 4 场只能进入 uncertainties。
seasonWe 来自当前赛季 we_raw；eloTrend、form._change 和近期胜率只能用于判断近期状态，并应与赛季值、样本量和对手差异共同解释。
currentRank 是当前赛季段位；peakRank 是历史最高段位，只能作为长期上限和经验证据，绝不能把历史最高分或历史最高 S 星当作当前水平。
S 段使用星数区分：0-9 普通 S、10-24 黄金 S、25-49 钻石 S、50 及以上魔王 S；S 段之间优先比较星数，不能继续按 2400 分后的 ELO 差值解释。
当前地图不足 4 场必须显著降权；4-9 场只能作为弱证据，不能称为强图。
统计覆盖不足 8/10，或当前地图有效样本普遍不足时，必须降低 confidence，并写入 uncertainties。
playerSignals 必须标出真正影响本局判断的玩家，明确区分强点、支点、专长、短板和变量；有正负对比证据时不要留空，也不要为凑数逐人输出。
不得把 PRI / pri_avg 写成 WE。
不得把 1vx_rate 写成 1v1 胜率；1v1 必须同时看胜场和 attempts。
不得把赛季 pw_rating_ct_avg / pw_rating_t_avg 写成当前地图 CT/T 水平；当前地图只有 CT/T 回合胜率，没有分侧 Rating。
不得引用留言内容，不评价玩家人格，不输出或推断 zq_id、留言数量和留言正文。

${AI_OUTPUT_LANGUAGE_RULES}

${METRIC_BASELINES_TEXT}`;

function round(value: number | undefined, digits = 2): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function avg(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => (
    item != null && item !== '' && (!Array.isArray(item) || item.length > 0)
  ))) as Partial<T>;
}

function rankSummary(score?: number, stars?: number, season?: string) {
  const rank = getPerfectRankDisplay(score, stars);
  if (rank.kind === 'empty') return undefined;
  if (rank.kind === 'score') return compact({ type: 'score', score: Math.round(rank.score), season });
  return compact({ type: 's', tier: rank.tier, stars: rank.stars, season });
}

function mapSummary(player: MatchPlayer, entry: PerfectHotMap, currentMap?: string) {
  const seasonMatches = player.seasonTotalNum ?? player.hotMaps?.reduce((sum, map) => sum + map.totalMatch, 0) ?? 0;
  const metrics = getPerfectMapMetrics(player, entry);
  const isCurrent = Boolean(currentMap && entry.map === findPerfectHotMap(player, currentMap)?.map);
  const familiarity = isCurrent ? getPerfectMapFamiliarity(player, currentMap) : undefined;
  return compact({
    map: entry.map,
    matches: entry.totalMatch,
    share: seasonMatches > 0 ? round(entry.totalMatch / seasonMatches, 3) : undefined,
    winRate: entry.totalMatch > 0 ? round(entry.winCount / entry.totalMatch, 3) : undefined,
    rating: round(metrics.rating),
    adr: round(metrics.adr, 1),
    kd: round(metrics.kd),
    rws: round(metrics.rws),
    openingDuelRate: round(metrics.openingDuelRate, 3),
    hsRate: round(metrics.headshotRate, 3),
    roundWinRate: round(metrics.roundWinRate, 3),
    ctRoundWinRate: round(metrics.ctRoundWinRate, 3),
    tRoundWinRate: round(metrics.tRoundWinRate, 3),
    ctRounds: entry.ctRoundCount,
    tRounds: entry.tRoundCount,
    priAvg: round(entry.priAvg, 1),
    pistolWe: round(entry.pistolWeSum, 1),
    sniperKillShare: entry.totalKill ? round((entry.sniperKillNum ?? 0) / entry.totalKill, 3) : undefined,
    firePower: metrics.firePower,
    familiarityScore: familiarity?.score,
    familiarityTier: familiarity?.tier,
    strongPerformance: isCurrent ? isPerfectMapStrong(player, currentMap) : undefined,
  });
}

function summarizePlayer(player: MatchPlayer, currentMap?: string) {
  const current = findPerfectHotMap(player, currentMap);
  const representative = [...(player.hotMaps ?? [])]
    .filter((entry) => entry !== current)
    .sort((a, b) => b.totalMatch - a.totalMatch)
    .slice(0, current ? 2 : 3);
  const maps = current ? [current, ...representative] : representative;
  const recentDelta = player.rating != null && player.seasonRating != null
    ? player.rating - player.seasonRating
    : undefined;
  return compact({
    steamId: player.steamId,
    nickname: player.nickname,
    elo: player.score,
    currentRank: rankSummary(player.score, player.currentSStars),
    peakRank: rankSummary(player.peakScore, player.peakSStars, player.peakSeason),
    rating: round(player.seasonRating),
    standardRating: round(player.standardRating),
    recentStandardRating: round(player.recentStandardRating),
    recentRating: round(player.rating),
    recentVsSeason: round(recentDelta),
    recentTrend: recentDelta == null ? undefined : Math.abs(recentDelta) < 0.03 ? 'flat' : recentDelta > 0 ? 'up' : 'down',
    adr: round(player.adpr, 1),
    kd: round(player.kd),
    hsRate: round(player.hsRate, 3),
    openingKillConversion: round(player.firstKillSuccessRate, 3),
    counterStrafeSuccess: round(player.rapidStopSuccessRate, 3),
    reactionTimeMs: round(player.reactionTime, 0),
    rws: round(player.rws),
    recentRws: round(player.recentRws),
    seasonWinRate: round(player.seasonWinRate, 3),
    entryKillRatio: round(player.entryKillRatio, 3),
    clutchWinRate: round(player.clutchWinRate, 3),
    clutch1v1Rate: round(player.clutch1v1Rate, 3),
    clutch1v1Attempts: player.clutch1v1Attempts,
    kast: round(player.kast, 3),
    tradeFragRate: round(player.tradeFragRate, 3),
    matchMvps: player.mvpCount,
    roundMvps: player.roundMvpCount,
    sides: compact({
      ct: compact({
        rating: round(player.combat?.sides?.ct?.rating),
        mapRoundWinRate: current ? round(getPerfectMapMetrics(player, current).ctRoundWinRate, 3) : undefined,
        rounds: current?.ctRoundCount,
      }),
      t: compact({
        rating: round(player.combat?.sides?.t?.rating),
        mapRoundWinRate: current ? round(getPerfectMapMetrics(player, current).tRoundWinRate, 3) : undefined,
        rounds: current?.tRoundCount,
      }),
    }),
    opening: player.combat?.opening ? compact({
      firstKillRate: round(player.combat.opening.firstKillRate, 3),
      openingDuelRate: round(player.combat.opening.openingDuelRate, 3),
      firstHurtPerMatch: round(player.combat.opening.firstHurtPerMatch, 2),
      winAfterOpeningKill: round(player.combat.opening.winAfterOpeningKill, 3),
    }) : undefined,
    utility: player.combat?.utility ? compact({
      flashAssistPerRound: round(player.combat.utility.flashAssistPerRound, 3),
      flashRate: round(player.combat.utility.flashRate, 3),
      enemyFlashTimePerRound: round(player.combat.utility.enemyFlashTimePerRound, 2),
      utilDmgPerRound: round(player.combat.utility.utilDmgPerRound, 2),
      itemRate: round(player.combat.utility.itemRate, 3),
    }) : undefined,
    aim: player.combat?.aim ? compact({
      avgTimeToKillMs: round(player.combat.aim.avgTimeToKillMs, 0),
      sprayHitRate: round(player.combat.aim.sprayHitRate, 3),
      killsPerRound: round(player.combat.aim.killsPerRound, 2),
      killsPerWinRound: round(player.combat.aim.killsPerWinRound, 2),
      dmgPerRound: round(player.combat.aim.dmgPerRound, 1),
      dmgPerWinRound: round(player.combat.aim.dmgPerWinRound, 1),
      roundsWithAKill: round(player.combat.aim.roundsWithAKill, 3),
      pistolRating: round(player.combat.aim.pistolRating, 1),
    }) : undefined,
    sniper: player.combat?.sniper ? compact({
      killShare: round(player.combat.sniper.killShare, 3),
      firstKills: player.combat.sniper.firstKills,
      killsPerSniperRound: round(player.combat.sniper.killsPerSniperRound, 2),
      multiKillRoundRate: round(player.combat.sniper.multiKillRoundRate, 3),
      holdRounds: player.combat.sniper.holdRounds,
      reactionMs: round(player.combat.sniper.reactionMs, 0),
    }) : undefined,
    clutch: player.combat?.clutch ? compact({
      allRate: round(player.combat.clutch.allRate, 3),
      v1: player.combat.clutch.v1,
      v2plus: player.combat.clutch.v2plus,
      lastAliveRate: round(player.combat.clutch.lastAliveRate, 3),
      savesPerLossRound: round(player.combat.clutch.savesPerLossRound, 3),
      timeAlivePerRound: round(player.combat.clutch.timeAlivePerRound, 1),
    }) : undefined,
    form: player.combat?.form ? compact({
      ratingChange: round(player.combat.form.ratingChange, 3),
      adrChange: round(player.combat.form.adrChange, 1),
      kdChange: round(player.combat.form.kdChange, 3),
      winRateChange: round(player.combat.form.winRateChange, 3),
      rwsChange: round(player.combat.form.rwsChange, 2),
    }) : undefined,
    recentWe: round(player.weAvg, 1),
    seasonWe: round(player.seasonWe, 1),
    commonRating: round(player.commonRating),
    eloTrend: round(player.eloTrend, 0),
    kad: player.kills != null || player.assists != null || player.deaths != null
      ? { kills: player.kills, assists: player.assists, deaths: player.deaths }
      : undefined,
    multiKills: player.multiKill3 != null || player.multiKill4 != null || player.multiKill5 != null
      ? { k3: player.multiKill3, k4: player.multiKill4, k5: player.multiKill5 }
      : undefined,
    clutchWins: player.clutchWins != null
      ? { total: player.clutchWins, v1: player.clutch1v1, v2: player.clutch1v2, v3: player.clutch1v3, v4: player.clutch1v4, v5: player.clutch1v5 }
      : undefined,
    partyId: player.troopTeamId,
    isSingle: player.isSingle || undefined,
    currentMap: current ? mapSummary(player, current, currentMap) : currentMap ? { map: currentMap, familiarityScore: 0, familiarityTier: 'none' } : undefined,
    representativeMaps: maps.map((entry) => mapSummary(player, entry, currentMap)),
    ability: player.abilityProfile ? compact(player.abilityProfile as Record<string, unknown>) : undefined,
    hotWeapons: player.primaryWeapons?.slice(0, 2).map((weapon) => compact({
      name: weapon.nameZh ?? weapon.name,
      kills: weapon.killNum,
      headshotRate: round(weapon.headshotRate, 3),
      firstShotAccuracy: round(weapon.firstShotAccuracy, 3),
      avgTimeToKillMs: round(weapon.avgTimeToKill, 0),
      avgKills: round(weapon.avgKillNum),
      avgKillsPerRound: round(weapon.avgKillsPerRound),
      counterStrafeSuccess: round(weapon.rapidStopSuccessRate, 3),
      sprayAccuracy: round(weapon.sprayAccuracy, 3),
    })),
  });
}

function partyStructure(team: MatchTeam) {
  const groups = new Map<number, string[]>();
  for (const player of team.players) {
    if (player.troopTeamId == null || player.isSingle) continue;
    groups.set(player.troopTeamId, [...(groups.get(player.troopTeamId) ?? []), player.steamId]);
  }
  return [...groups.entries()].filter(([, players]) => players.length > 1).map(([id, players]) => ({ id, players }));
}

type SummarizedPlayer = ReturnType<typeof summarizePlayer>;
type TeamAggregate = ReturnType<typeof summarizeTeamAggregate>;
type TeamSummaryWithPlayers = TeamAggregate & { players: SummarizedPlayer[] };

function summarizeTeamAggregate(team: MatchTeam, currentMap?: string) {
  const mapSamples = team.players.map((player) => findPerfectHotMap(player, currentMap));
  const validMapSamples = mapSamples.filter((entry) => (entry?.totalMatch ?? 0) >= 3).length;
  return compact({
    side: team.side,
    avgElo: round(avg(team.players.map((player) => player.score)), 0),
    avgRating: round(avg(team.players.map((player) => player.seasonRating))),
    avgRecentRating: round(avg(team.players.map((player) => player.rating))),
    avgAdr: round(avg(team.players.map((player) => player.adpr)), 1),
    avgKd: round(avg(team.players.map((player) => player.kd))),
    avgRws: round(avg(team.players.map((player) => player.rws))),
    avgRecentRws: round(avg(team.players.map((player) => player.recentRws))),
    avgRecentWe: round(avg(team.players.map((player) => player.weAvg)), 1),
    avgCtRating: round(avg(team.players.map((player) => player.combat?.sides?.ct?.rating))),
    avgTRating: round(avg(team.players.map((player) => player.combat?.sides?.t?.rating))),
    avgCurrentMapCtRoundWinRate: round(avg(mapSamples.map((entry) => (
      entry?.ctWinRoundCount != null && entry.ctRoundCount ? entry.ctWinRoundCount / entry.ctRoundCount : undefined
    ))), 3),
    avgCurrentMapTRoundWinRate: round(avg(mapSamples.map((entry) => (
      entry?.tWinRoundCount != null && entry.tRoundCount ? entry.tWinRoundCount / entry.tRoundCount : undefined
    ))), 3),
    currentSRankPlayers: team.players.filter((player) => getPerfectRankDisplay(player.score, player.currentSStars).kind === 's').length,
    peakSRankPlayers: team.players.filter((player) => getPerfectRankDisplay(player.peakScore, player.peakSStars).kind === 's').length,
    currentMapCoverage: `${validMapSamples}/${team.players.length}`,
    parties: partyStructure(team),
  });
}

function summarizeTeam(team: MatchTeam, currentMap: string | undefined, includePlayers: false): TeamAggregate;
function summarizeTeam(team: MatchTeam, currentMap?: string, includePlayers?: true): TeamSummaryWithPlayers;
function summarizeTeam(
  team: MatchTeam,
  currentMap?: string,
  includePlayers = true,
): TeamAggregate | TeamSummaryWithPlayers {
  const base = summarizeTeamAggregate(team, currentMap);
  return includePlayers
    ? { ...base, players: team.players.map((player) => summarizePlayer(player, currentMap)) }
    : base;
}

export interface MatchSummaryPayload {
  matchId: string;
  mapName?: string;
  mapFitHint?: string;
  fastSummary: { teams: TeamAggregate[]; dataQuality: Record<string, unknown> };
  deepContext: { teams: TeamSummaryWithPlayers[] };
  dataWarnings: string[];
}

function buildPerfectDataQuality(record: MatchRecord) {
  const players = record.detail.teams.flatMap((team) => team.players);
  const statsSuccess = players.filter((player) => player.perfectLoadState?.stats === 'loaded' || (
    record.detail.source !== 'ladder-events' && player.seasonRating != null
  )).length;
  const currentMapValid = players.filter((player) => (findPerfectHotMap(player, record.detail.mapName)?.totalMatch ?? 0) >= 3).length;
  const statsErrors = players.flatMap((player) => player.perfectLoadState?.statsError
    ? [{ steamId: player.steamId, error: player.perfectLoadState.statsError }]
    : []);
  return {
    statsSuccess,
    statsTotal: players.length,
    currentMapValidSamples: currentMapValid,
    missingStats: players.length - statsSuccess,
    statsErrors,
  };
}

function buildPerfectPromptMatch(record: MatchRecord) {
  return {
    matchId: record.id,
    platform: 'perfect' as const,
    mapName: record.detail.mapName,
    mapFitHint: mapFitHint(record.detail.mapName),
    dataQuality: buildPerfectDataQuality(record),
    dataWarnings: record.detail.parseWarnings,
  };
}

export function buildMatchSummary(record: MatchRecord): MatchSummaryPayload {
  const dataQuality = buildPerfectDataQuality(record);
  return {
    matchId: record.id,
    mapName: record.detail.mapName,
    mapFitHint: mapFitHint(record.detail.mapName),
    dataWarnings: record.detail.parseWarnings,
    fastSummary: {
      teams: record.detail.teams.map((team) => summarizeTeam(team, record.detail.mapName, false)),
      dataQuality,
    },
    deepContext: {
      teams: record.detail.teams.map((team) => summarizeTeam(team, record.detail.mapName, true)),
    },
  };
}

function localizeSystemPrompt(prompt: string, locale: AiOutputLocale): string {
  return prompt.replace(AI_OUTPUT_LANGUAGE_RULES, getAiOutputLanguageRules(locale));
}

export function buildPerfectAiAnalysisRequest(
  record: MatchRecord,
  locale: AiOutputLocale = 'zh-CN',
  viewerSteamId?: string | null,
): StartAiAnalysisInput {
  const context = buildAiAnalysisContext(record, viewerSteamId);
  return {
    matchId: record.id,
    systemPrompt: localizeSystemPrompt(PERFECT_SYSTEM_PROMPT, locale),
    userPrompt: getAiUserPromptSchema(locale) + JSON.stringify({
      match: {
        ...buildPerfectPromptMatch(record),
      },
      evidence: buildAiPromptEvidence(context),
    }),
  };
}

export function buildAiAnalysisRequest(
  record: MatchRecord,
  locale: AiOutputLocale = 'zh-CN',
  viewerSteamId?: string | null,
): StartAiAnalysisInput {
  if (record.platformId === '5e' || record.detail.platformId === '5e') {
    return buildP5eAiAnalysisRequest(record, locale, viewerSteamId);
  }
  return buildPerfectAiAnalysisRequest(record, locale, viewerSteamId);
}

export function parseAiAnalysisResult(raw: string, context?: AiAnalysisContext): import('./types').AiAnalysisResult | null {
  const parsed = parseAiAnalysisJson(raw, context);
  return parsed ? sanitizeAiAnalysisResult(parsed) : null;
}
