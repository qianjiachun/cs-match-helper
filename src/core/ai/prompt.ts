import type { MatchPlayer, MatchRecord, MatchTeam, PerfectHotMap } from '@core/match/models';
import { AI_OUTPUT_LANGUAGE_RULES, getAiOutputLanguageRules, getAiUserPromptSchema, type AiOutputLocale } from './ai-prompt-schema';
import { METRIC_BASELINES_TEXT, mapFitHint } from './baselines';
import { buildP5eAiAnalysisRequest } from './p5e-prompt';
import { sanitizeAiAnalysisResult } from './sanitize-result';
import type { StartAiAnalysisInput } from './types';
import { findPerfectHotMap, getPerfectMapFamiliarity, getPerfectMapMetrics, isPerfectMapStrong } from '@platforms/perfect/map-pool';

export const PERFECT_SYSTEM_PROMPT = `你是 CS2 完美世界匹配赛前分析助手。只能基于输入数据做概率判断，不得编造缺失字段。
输出必须是严格 JSON，不要 Markdown 或代码块；winProbability.A + winProbability.B 必须等于 100，confidence 为 0-100 的数据把握度。
以双方和队内相对差异为主，绝不能把任何单项绝对值直接等同于胜率。
优先分析当前地图匹配度、图池专精或短板、组排协同、Rating、近期相对赛季变化、ADR、K/D、RWS 与角色互补。
hotWeapons 只能推断 AWP、突破或步枪倾向，不能单独判定强弱。
地图 familiarityScore 只衡量当前赛季场次与占比，是本赛季熟悉程度的证据，不代表跨赛季经验或强弱；只有 strongPerformance 才表示有足够样本支持的地图表现优势。
recentWe、recentRws 和 eloTrend 只能用于判断近期状态，并应与赛季值、样本量和对手差异共同解释。
shot/victory/breach/snipe/prop 是平台五维风格标签，不得与旧七维雷达混用，也不能直接换算胜率。
当前地图不足 4 场必须显著降权；4-9 场只能作为弱证据，不能称为强图。
统计覆盖不足 8/10，或当前地图有效样本普遍不足时，必须降低 confidence，并在 dataQuality 中说明。
playerNotes 只点评真正影响本局判断的玩家，不为凑数逐人输出。
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
    rating: entry.ratingSum != null && entry.totalMatch > 0 ? round(entry.ratingSum / entry.totalMatch) : undefined,
    adr: entry.totalAdr != null && entry.totalMatch > 0 ? round(entry.totalAdr / entry.totalMatch, 1) : undefined,
    kd: round(metrics.kd),
    rws: round(metrics.rws),
    openingDuelRate: round(metrics.openingDuelRate, 3),
    hsRate: round(metrics.headshotRate, 3),
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
    rating: round(player.seasonRating),
    standardRating: round(player.standardRating),
    recentStandardRating: round(player.recentStandardRating),
    recentRating: round(player.rating),
    recentVsSeason: round(recentDelta),
    recentTrend: recentDelta == null ? undefined : Math.abs(recentDelta) < 0.03 ? 'flat' : recentDelta > 0 ? 'up' : 'down',
    adr: round(player.adpr, 1),
    kd: round(player.kd),
    hsRate: round(player.hsRate, 3),
    rws: round(player.rws),
    recentRws: round(player.recentRws),
    seasonWinRate: round(player.seasonWinRate, 3),
    entryKillRatio: round(player.entryKillRatio, 3),
    clutchWinRate: round(player.clutchWinRate, 3),
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

function summarizeTeam(team: MatchTeam, currentMap?: string, includePlayers = true) {
  const mapSamples = team.players.map((player) => findPerfectHotMap(player, currentMap));
  const validMapSamples = mapSamples.filter((entry) => (entry?.totalMatch ?? 0) >= 3).length;
  const base = compact({
    side: team.side,
    avgElo: round(avg(team.players.map((player) => player.score)), 0),
    avgRating: round(avg(team.players.map((player) => player.seasonRating))),
    avgRecentRating: round(avg(team.players.map((player) => player.rating))),
    avgAdr: round(avg(team.players.map((player) => player.adpr)), 1),
    avgKd: round(avg(team.players.map((player) => player.kd))),
    avgRws: round(avg(team.players.map((player) => player.rws))),
    avgRecentRws: round(avg(team.players.map((player) => player.recentRws))),
    avgRecentWe: round(avg(team.players.map((player) => player.weAvg)), 1),
    currentMapCoverage: `${validMapSamples}/${team.players.length}`,
    parties: partyStructure(team),
  });
  return includePlayers
    ? { ...base, players: team.players.map((player) => summarizePlayer(player, currentMap)) }
    : base;
}

export interface MatchSummaryPayload {
  matchId: string;
  mapName?: string;
  mapFitHint?: string;
  fastSummary: { teams: ReturnType<typeof summarizeTeam>[]; dataQuality: Record<string, unknown> };
  deepContext: { teams: ReturnType<typeof summarizeTeam>[] };
  dataWarnings: string[];
}

export function buildMatchSummary(record: MatchRecord): MatchSummaryPayload {
  const players = record.detail.teams.flatMap((team) => team.players);
  const statsSuccess = players.filter((player) => player.perfectLoadState?.stats === 'loaded' || (
    record.detail.source !== 'ladder-events' && player.seasonRating != null
  )).length;
  const currentMapValid = players.filter((player) => (findPerfectHotMap(player, record.detail.mapName)?.totalMatch ?? 0) >= 3).length;
  const statsErrors = players.flatMap((player) => player.perfectLoadState?.statsError
    ? [{ steamId: player.steamId, error: player.perfectLoadState.statsError }]
    : []);
  const dataQuality = {
    statsSuccess,
    statsTotal: players.length,
    currentMapValidSamples: currentMapValid,
    missingStats: players.length - statsSuccess,
    statsErrors,
  };
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

export function buildPerfectAiAnalysisRequest(record: MatchRecord, locale: AiOutputLocale = 'zh-CN'): StartAiAnalysisInput {
  return {
    matchId: record.id,
    systemPrompt: localizeSystemPrompt(PERFECT_SYSTEM_PROMPT, locale),
    userPrompt: getAiUserPromptSchema(locale) + JSON.stringify(buildMatchSummary(record)),
  };
}

export function buildAiAnalysisRequest(record: MatchRecord, locale: AiOutputLocale = 'zh-CN'): StartAiAnalysisInput {
  if (record.platformId === '5e' || record.detail.platformId === '5e') {
    return buildP5eAiAnalysisRequest(record, locale);
  }
  return buildPerfectAiAnalysisRequest(record, locale);
}

export function parseAiAnalysisResult(raw: string): import('./types').AiAnalysisResult | null {
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '')) as import('./types').AiAnalysisResult;
    if (!parsed.predictedWinner || !parsed.winProbability) return null;
    return sanitizeAiAnalysisResult({
      ...parsed,
      keyFactors: parsed.keyFactors ?? [],
      playerNotes: parsed.playerNotes ?? [],
      risks: parsed.risks ?? [],
      dataQuality: parsed.dataQuality ?? '',
    });
  } catch {
    return null;
  }
}
