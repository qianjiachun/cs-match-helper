import type { MatchPlayer, MatchRecord, MatchTeam } from '@core/match/models';
import { RADAR_LABELS } from '@core/match/insights';
import { AI_USER_PROMPT_SCHEMA, AI_OUTPUT_LANGUAGE_RULES } from './ai-prompt-schema';
import { METRIC_BASELINES_TEXT, mapFitHint } from './baselines';
import { buildP5eAiAnalysisRequest } from './p5e-prompt';
import { sanitizeAiAnalysisResult } from './sanitize-result';
import type { StartAiAnalysisInput } from './types';

export const PERFECT_SYSTEM_PROMPT = `你是 CS2 完美世界匹配赛前分析助手。你只能基于输入数据做概率判断，不要编造缺失字段。
所有 player 在输出文案中必须称为「玩家」，禁止使用「球员」。
请结合 CS2 对局理解：地图控制、首杀/补枪、道具、狙击、残局、组排协同、近期状态与当前地图适配度。
输出必须是严格 JSON，不要 Markdown，不要代码块。
胜率不是确定结果，winProbability.A + winProbability.B 必须等于 100。
confidence 为 0-100 整数，表示你对本次判断的数据把握度（不是胜率），样本不足时必须降低。
判断时同时参考：绝对指标基准线、双方相对差距、地图样本量、组排结构。
不要把单项过线直接等同于胜率；必须说明该项如何影响当前地图与对局结构。
地图适配理解须融入 headline、quickReasons、keyFactors（type: map），不要单独输出地图区块。
keyFactors 最多 5 条，risks 最多 3 条，quickReasons 2-3 条短句。
playerNotes：仅列出对本局判断有实质影响的玩家，数量随对局而定（可 0 人，也可多人）；不要为了凑数强行点评平庸玩家。每名玩家附 1 句具体依据（指标/角色/地图/状态），可选 role 字段标注定位（entry/awp/lurk/anchor/support/risk）。

${AI_OUTPUT_LANGUAGE_RULES}

${METRIC_BASELINES_TEXT}`;

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

function radarSummary(player: MatchPlayer): Record<string, { score: number; level?: string }> {
  const out: Record<string, { score: number; level?: string }> = {};
  for (const [k, v] of Object.entries(player.radar)) {
    if (v?.score != null) {
      out[RADAR_LABELS[k] ?? k] = { score: v.score, level: v.level };
    }
  }
  return out;
}

function topBottomRadar(player: MatchPlayer) {
  const entries = Object.entries(player.radar)
    .filter(([, v]) => v?.score != null)
    .sort((a, b) => (b[1]?.score ?? 0) - (a[1]?.score ?? 0));
  const top = entries.slice(0, 2).map(([k, v]) => `${RADAR_LABELS[k] ?? k}:${v?.score}`);
  const bottom = entries.slice(-1).map(([k, v]) => `${RADAR_LABELS[k] ?? k}:${v?.score}`);
  return { top, bottom };
}

function summarizePlayer(player: MatchPlayer, side: 'A' | 'B') {
  const recent = player.recentResults
    .map((r) => (r === 'win' ? 'W' : r === 'lose' ? 'L' : 'D'))
    .join('');

  const { top, bottom } = topBottomRadar(player);

  return compact({
    steamId: player.steamId,
    nickname: player.nickname,
    side,
    score: player.score,
    rating: round(player.rating),
    adpr: round(player.adpr, 1),
    kd: round(player.kd),
    weAvg: round(player.weAvg, 1),
    weRaw: round(player.weRaw, 1),
    hsRate: formatPct(player.hsRate),
    firstKillSuccessRate: formatPct(player.firstKillSuccessRate),
    rapidStopSuccessRate: formatPct(player.rapidStopSuccessRate),
    clutchWinRate: formatPct(player.clutchWinRate),
    recentWinRate: formatPct(player.recentWinRate),
    seasonWinRate: formatPct(player.seasonWinRate),
    mapWinRate: formatPct(player.mapWinRate),
    mapSampleLow: player.mapSampleLow || undefined,
    isSingle: player.isSingle || undefined,
    isGreen: player.isGreen || undefined,
    isVip: player.isVip || undefined,
    troopTeamId: player.troopTeamId,
    perfectPower: player.perfectPower,
    rankDesc: player.rankDesc,
    tags: player.tags.length ? player.tags : undefined,
    recentForm: recent || undefined,
    recentRatings: player.recentRatings.length ? player.recentRatings.slice(-5) : undefined,
    radarTop: top.length ? top : undefined,
    radarWeak: bottom.length ? bottom : undefined,
    radar: Object.keys(player.radar).length > 4 ? undefined : radarSummary(player),
  });
}

function summarizeParty(team: MatchTeam): string {
  const groups = team.partyGroups;
  if (!groups.length) return '无明显组排';
  const max = Math.max(...groups);
  return `${max} 人组排 ×${groups.length} 组`;
}

function summarizeTeam(team: MatchTeam, compactMode = false) {
  const base = {
    side: team.side,
    avgScore: round(team.avgScore, 0),
    avgRating: round(team.avgRating),
    avgKd: round(team.avgKd),
    avgAdpr: round(team.avgAdpr, 1),
    avgWe: round(team.avgWe, 1),
    recentWinRate: formatPct(team.recentWinRate),
    mapWinRate: formatPct(team.mapWinRate),
    strengthScore: round(team.strengthScore, 0),
    singleCount: team.singleCount,
    party: summarizeParty(team),
    teamRadar: team.teamRadar
      ? Object.fromEntries(
          Object.entries(team.teamRadar).map(([k, v]) => [RADAR_LABELS[k] ?? k, v]),
        )
      : undefined,
  };

  if (compactMode) {
    return base;
  }

  return {
    ...base,
    players: team.players.map((p) => summarizePlayer(p, team.side)),
  };
}

export interface MatchSummaryPayload {
  matchId: string;
  mapName?: string;
  mapFitHint?: string;
  readyLeftSeconds?: number;
  flags: {
    isGreen?: boolean;
    isSingle?: boolean;
    isGrudgeMatch?: boolean;
    hasExtraInfo: boolean;
  };
  dataWarnings: string[];
  localInsights?: {
    strongerSide?: 'A' | 'B';
    scoreDiff: number;
    ratingDiff: number;
    highlights: string[];
    risks: string[];
    tendencies: string[];
  };
  fastSummary: {
    teams: ReturnType<typeof summarizeTeam>[];
    localInsights?: MatchSummaryPayload['localInsights'];
  };
  deepContext?: {
    teams: ReturnType<typeof summarizeTeam>[];
  };
}

export function buildMatchSummary(record: MatchRecord): MatchSummaryPayload {
  const { detail } = record;
  const readyMs = detail.readyLeftTimeMs;
  const mapName = detail.mapName;

  const localInsights = detail.insights
    ? {
        strongerSide: detail.insights.strongerSide,
        scoreDiff: round(detail.insights.scoreDiff, 0) ?? 0,
        ratingDiff: round(detail.insights.ratingDiff) ?? 0,
        highlights: detail.insights.highlights.slice(0, 4),
        risks: detail.insights.risks.slice(0, 4),
        tendencies: detail.insights.tendencies.slice(0, 3),
      }
    : undefined;

  const teamsCompact = detail.teams.map((t) => summarizeTeam(t, true));
  const teamsFull = detail.teams.map((t) => summarizeTeam(t, false));

  return {
    matchId: record.id,
    mapName,
    mapFitHint: mapFitHint(mapName),
    readyLeftSeconds: readyMs ? Math.floor(readyMs / 1000) : undefined,
    flags: compact({
      isGreen: detail.isGreen,
      isSingle: detail.isSingle,
      isGrudgeMatch: detail.isGrudgeMatch,
      hasExtraInfo: detail.hasExtraInfo,
    }) as MatchSummaryPayload['flags'],
    dataWarnings: detail.parseWarnings,
    localInsights,
    fastSummary: {
      teams: teamsCompact,
      localInsights,
    },
    deepContext: {
      teams: teamsFull,
    },
  };
}

export function buildPerfectAiAnalysisRequest(record: MatchRecord): StartAiAnalysisInput {
  const summary = buildMatchSummary(record);
  return {
    matchId: record.id,
    systemPrompt: PERFECT_SYSTEM_PROMPT,
    userPrompt: AI_USER_PROMPT_SCHEMA + JSON.stringify(summary),
  };
}

export function buildAiAnalysisRequest(record: MatchRecord): StartAiAnalysisInput {
  if (record.platformId === '5e' || record.detail.platformId === '5e') {
    return buildP5eAiAnalysisRequest(record);
  }
  return buildPerfectAiAnalysisRequest(record);
}

export function parseAiAnalysisResult(raw: string): import('./types').AiAnalysisResult | null {
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(cleaned) as import('./types').AiAnalysisResult;
    if (!parsed.predictedWinner || !parsed.winProbability) return null;
    return sanitizeAiAnalysisResult({
      ...parsed,
      keyFactors: parsed.keyFactors ?? [],
      playerNotes: parsed.playerNotes ?? [],
      risks: parsed.risks ?? [],
      recommendedFocus: parsed.recommendedFocus,
      dataQuality: parsed.dataQuality ?? '',
    });
  } catch {
    return null;
  }
}
