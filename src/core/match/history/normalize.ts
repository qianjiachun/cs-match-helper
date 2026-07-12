import type { AiAnalysisResult, AiPredictedWinner, AiTokenUsage } from '@core/ai/types';
import { sanitizeAiAnalysisResult } from '@core/ai/sanitize-result';
import type {
  MatchDetail,
  MatchInsights,
  MatchPlayer,
  MatchRecord,
  MatchSummary,
  MatchTeam,
  RadarDimension,
} from '../models';
import type {
  AiHistoryStatus,
  AiSectionPayloadV1,
  MatchSectionPayloadV1,
  VersionedSection,
} from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function normalizeRadar(raw: unknown): Record<string, RadarDimension> {
  const obj = asRecord(raw);
  if (!obj) return {};
  const out: Record<string, RadarDimension> = {};
  for (const [key, value] of Object.entries(obj)) {
    const dim = asRecord(value);
    if (!dim) continue;
    const score = asNumber(dim.score);
    if (score == null) continue;
    out[key] = { score, level: asString(dim.level) };
  }
  return out;
}

function normalizeRecentResults(raw: unknown): Array<'win' | 'lose' | 'draw'> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is 'win' | 'lose' | 'draw' => v === 'win' || v === 'lose' || v === 'draw');
}

function normalizePlayer(raw: unknown): MatchPlayer | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const steamId = asString(obj.steamId) ?? '';
  const nickname = asString(obj.nickname) ?? '未知玩家';
  return {
    steamId,
    nickname,
    avatar: asString(obj.avatar),
    score: asNumber(obj.score),
    teamSide: asNumber(obj.teamSide) ?? 0,
    slotType: asNumber(obj.slotType),
    isSingle: Boolean(obj.isSingle),
    troopTeamId: asNumber(obj.troopTeamId),
    isGreen: asBoolean(obj.isGreen),
    isVip: asBoolean(obj.isVip),
    adpr: asNumber(obj.adpr),
    rating: asNumber(obj.rating),
    seasonRating: asNumber(obj.seasonRating),
    kd: asNumber(obj.kd),
    hsRate: asNumber(obj.hsRate),
    firstKillSuccessRate: asNumber(obj.firstKillSuccessRate),
    rapidStopSuccessRate: asNumber(obj.rapidStopSuccessRate),
    reactionTime: asNumber(obj.reactionTime),
    clutchWinRate: asNumber(obj.clutchWinRate),
    weRaw: asNumber(obj.weRaw),
    weAvg: asNumber(obj.weAvg),
    recentWinRate: asNumber(obj.recentWinRate),
    recentDrawCount: asNumber(obj.recentDrawCount),
    seasonWinRate: asNumber(obj.seasonWinRate),
    seasonWinNum: asNumber(obj.seasonWinNum),
    seasonTotalNum: asNumber(obj.seasonTotalNum),
    mapWinRate: asNumber(obj.mapWinRate),
    mapWinNum: asNumber(obj.mapWinNum),
    mapTotalNum: asNumber(obj.mapTotalNum),
    latest10WinNum: asNumber(obj.latest10WinNum),
    latest10TotalNum: asNumber(obj.latest10TotalNum),
    continuedWins: asNumber(obj.continuedWins),
    mapSampleLow: asBoolean(obj.mapSampleLow),
    perfectPower: asNumber(obj.perfectPower),
    rankDesc: asString(obj.rankDesc),
    rankLevel: asString(obj.rankLevel),
    rankNum: asNumber(obj.rankNum),
    eloChange: asNumber(obj.eloChange),
    radar: normalizeRadar(obj.radar),
    recentResults: normalizeRecentResults(obj.recentResults),
    recentRatings: Array.isArray(obj.recentRatings)
      ? obj.recentRatings.filter((n): n is number => typeof n === 'number')
      : [],
    tags: asStringArray(obj.tags),
    platformBoardId: asString(obj.platformBoardId),
  };
}

function normalizeTeam(raw: unknown): MatchTeam | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const side = obj.side === 'B' ? 'B' : 'A';
  const playersRaw = Array.isArray(obj.players) ? obj.players : [];
  const players = playersRaw.map(normalizePlayer).filter((p): p is MatchPlayer => p != null);
  return {
    side,
    id: asNumber(obj.id) ?? 0,
    players,
    avgScore: asNumber(obj.avgScore),
    totalScore: asNumber(obj.totalScore),
    avgRating: asNumber(obj.avgRating),
    avgKd: asNumber(obj.avgKd),
    avgWe: asNumber(obj.avgWe),
    avgAdpr: asNumber(obj.avgAdpr),
    recentWinRate: asNumber(obj.recentWinRate),
    mapWinRate: asNumber(obj.mapWinRate),
    singleCount: asNumber(obj.singleCount) ?? 0,
    partyGroups: Array.isArray(obj.partyGroups)
      ? obj.partyGroups.filter((n): n is number => typeof n === 'number')
      : [],
    strengthScore: asNumber(obj.strengthScore),
    teamRadar: asRecord(obj.teamRadar)
      ? Object.fromEntries(
          Object.entries(obj.teamRadar as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
        )
      : undefined,
  };
}

function normalizeInsights(raw: unknown): MatchInsights | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;
  const strongerSide =
    obj.strongerSide === 'A' || obj.strongerSide === 'B' ? obj.strongerSide : undefined;
  return {
    strongerSide,
    scoreDiff: asNumber(obj.scoreDiff) ?? 0,
    ratingDiff: asNumber(obj.ratingDiff) ?? 0,
    highlights: asStringArray(obj.highlights),
    risks: asStringArray(obj.risks),
    topPlayers: (Array.isArray(obj.topPlayers) ? obj.topPlayers : [])
      .map(normalizePlayer)
      .filter((p): p is MatchPlayer => p != null),
    weakPlayers: (Array.isArray(obj.weakPlayers) ? obj.weakPlayers : [])
      .map(normalizePlayer)
      .filter((p): p is MatchPlayer => p != null),
    tendencies: asStringArray(obj.tendencies),
  };
}

export function normalizeSummary(raw: unknown): MatchSummary {
  const obj = asRecord(raw) ?? {};
  return {
    playerCount: asNumber(obj.playerCount) ?? 0,
    mapName: asString(obj.mapName) ?? asString(obj.map_name) ?? asString(obj.map) ?? asString(obj.map_id),
    serverName: asString(obj.serverName),
    mode: asString(obj.mode),
    platformGameId: asString(obj.platformGameId),
  };
}

export function normalizeDetail(raw: unknown): MatchDetail {
  const obj = asRecord(raw) ?? {};
  const teamsRaw = Array.isArray(obj.teams) ? obj.teams : [];
  const unassignedRaw = Array.isArray(obj.unassigned) ? obj.unassigned : [];
  const platformId =
    obj.platformId === 'perfect' || obj.platformId === '5e' ? obj.platformId : undefined;

  return {
    platformId,
    platformGameId: asString(obj.platformGameId),
    mapName:
      asString(obj.mapName) ?? asString(obj.map_name) ?? asString(obj.map) ?? asString(obj.map_id),
    readyDeadlineAt: asNumber(obj.readyDeadlineAt),
    readyLeftTimeMs: asNumber(obj.readyLeftTimeMs),
    isGreen: asBoolean(obj.isGreen),
    isSingle: asBoolean(obj.isSingle),
    isGrudgeMatch: asBoolean(obj.isGrudgeMatch),
    teams: teamsRaw.map(normalizeTeam).filter((t): t is MatchTeam => t != null),
    unassigned: unassignedRaw.map(normalizePlayer).filter((p): p is MatchPlayer => p != null),
    hasExtraInfo: Boolean(obj.hasExtraInfo),
    parseWarnings: asStringArray(obj.parseWarnings),
    insights: normalizeInsights(obj.insights),
  };
}

export function normalizeMatchSectionPayload(payload: unknown): MatchSectionPayloadV1 {
  const obj = asRecord(payload) ?? {};
  const dataRaw = asRecord(obj.data);
  const data: Record<string, unknown> | undefined = dataRaw
    ? (() => {
        const out: Record<string, unknown> = {};
        const p5eBundle = asRecord(dataRaw.p5eBundle);
        if (p5eBundle) out.p5eBundle = p5eBundle;
        return Object.keys(out).length ? out : undefined;
      })()
    : undefined;
  return {
    summary: asRecord(obj.summary) ?? {},
    detail: asRecord(obj.detail) ?? {},
    ...(data ? { data } : {}),
  };
}

export function normalizeAiSectionPayload(payload: unknown): AiSectionPayloadV1 {
  const obj = asRecord(payload) ?? {};
  const statusRaw = asString(obj.status);
  const status: AiHistoryStatus =
    statusRaw === 'done' ||
    statusRaw === 'error' ||
    statusRaw === 'cancelled' ||
    statusRaw === 'none'
      ? statusRaw
      : 'none';

  return {
    status,
    analyzedAt: asNumber(obj.analyzedAt),
    model: asString(obj.model),
    providerMode: asString(obj.providerMode),
    usage: asRecord(obj.usage) ?? undefined,
    elapsedMs: asNumber(obj.elapsedMs),
    error: asString(obj.error),
    result: asRecord(obj.result) ?? undefined,
  };
}

export function normalizeAiResult(raw: unknown): AiAnalysisResult | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const winner = asString(obj.predictedWinner);
  const predictedWinner: AiPredictedWinner =
    winner === 'A' || winner === 'B' || winner === 'Even' || winner === 'Unknown'
      ? winner
      : 'Unknown';
  const winProb = asRecord(obj.winProbability);
  const A = asNumber(winProb?.A) ?? 50;
  const B = asNumber(winProb?.B) ?? 50;
  return sanitizeAiAnalysisResult({
    predictedWinner,
    winProbability: { A, B },
    confidence: asNumber(obj.confidence) ?? 0,
    headline: asString(obj.headline) ?? '',
    quickReasons: asStringArray(obj.quickReasons),
    keyFactors: Array.isArray(obj.keyFactors)
      ? (obj.keyFactors.filter((f) => asRecord(f)) as AiAnalysisResult['keyFactors'])
      : [],
    playerNotes: Array.isArray(obj.playerNotes)
      ? (obj.playerNotes.filter((n) => asRecord(n)) as AiAnalysisResult['playerNotes'])
      : [],
    risks: asStringArray(obj.risks),
    dataQuality: asString(obj.dataQuality) ?? '',
    teamSummary: asRecord(obj.teamSummary)
      ? {
          A: asString((obj.teamSummary as Record<string, unknown>).A) ?? '',
          B: asString((obj.teamSummary as Record<string, unknown>).B) ?? '',
        }
      : undefined,
    stabilityReason: asString(obj.stabilityReason),
  });
}

export function normalizeAiUsage(raw: unknown): AiTokenUsage | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  return {
    promptTokens: asNumber(obj.promptTokens) ?? 0,
    completionTokens: asNumber(obj.completionTokens) ?? 0,
    totalTokens: asNumber(obj.totalTokens) ?? 0,
  };
}

export function buildMatchRecordFromSection(
  id: string,
  platformId: string,
  matchTime: string | undefined,
  section: VersionedSection | undefined,
): MatchRecord | null {
  if (!section) return null;
  const payload = normalizeMatchSectionPayload(section.payload);
  const summary = normalizeSummary(payload.summary);
  const detail = normalizeDetail(payload.detail);
  const resolvedPlatform =
    platformId === 'perfect' || platformId === '5e'
      ? platformId
      : detail.platformId;

  return {
    id,
    platformId: resolvedPlatform,
    time: matchTime,
    data: payload.data ? { ...payload.data } : {},
    summary,
    detail,
  };
}
