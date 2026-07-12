import type { AiAnalysisResult, AiProviderMode, AiTokenUsage } from '@core/ai/types';
import type { MatchRecord, MatchTeam } from '../models';
import {
  buildMatchRecordFromSection,
  normalizeAiResult,
  normalizeAiSectionPayload,
  normalizeAiUsage,
} from './normalize';
import {
  CURRENT_AI_SECTION_VERSION,
  CURRENT_DOCUMENT_SCHEMA_VERSION,
  CURRENT_MATCH_SECTION_VERSION,
  HISTORY_SECTION_AI,
  HISTORY_SECTION_MATCH,
  type AiHistoryStatus,
  type AiSectionPayloadV1,
  type MatchHistoryDocumentV1,
  type MatchHistoryIndexItemV2,
  type MatchHistoryListItem,
  type MatchSectionPayloadV1,
  type VersionedSection,
} from './types';

function teamAvgScore(team: MatchTeam | undefined): number | undefined {
  if (!team) return undefined;
  if (team.avgScore != null) return Math.round(team.avgScore);
  const scores = team.players.map((p) => p.score).filter((s): s is number => s != null && s > 0);
  if (!scores.length) return undefined;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function computeMatchAvgScore(a?: number, b?: number): number | undefined {
  if (a != null && b != null) return Math.round((a + b) / 2);
  if (a != null) return a;
  if (b != null) return b;
  return undefined;
}

export function matchRecordToMatchSection(
  record: MatchRecord,
  now = Date.now(),
): VersionedSection<MatchSectionPayloadV1> {
  const payload: MatchSectionPayloadV1 = {
    summary: JSON.parse(JSON.stringify(record.summary)) as Record<string, unknown>,
    detail: JSON.parse(JSON.stringify(record.detail)) as Record<string, unknown>,
  };
  const p5eBundle = record.data?.p5eBundle;
  if (p5eBundle && typeof p5eBundle === 'object') {
    payload.data = {
      p5eBundle: JSON.parse(JSON.stringify(p5eBundle)) as Record<string, unknown>,
    };
  }
  return {
    schemaVersion: CURRENT_MATCH_SECTION_VERSION,
    updatedAt: now,
    payload,
  };
}

export function buildEmptyAiSection(now = Date.now()): VersionedSection<AiSectionPayloadV1> {
  return {
    schemaVersion: CURRENT_AI_SECTION_VERSION,
    updatedAt: now,
    payload: { status: 'none' },
  };
}

export function aiResultToAiSection(input: {
  status: AiHistoryStatus;
  result?: AiAnalysisResult | null;
  usage?: AiTokenUsage | null;
  elapsedMs?: number | null;
  error?: string | null;
  model?: string;
  providerMode?: AiProviderMode | string;
  analyzedAt?: number;
  now?: number;
}): VersionedSection<AiSectionPayloadV1> {
  const now = input.now ?? Date.now();
  const payload: AiSectionPayloadV1 = {
    status: input.status,
    analyzedAt: input.analyzedAt ?? now,
    model: input.model,
    providerMode: input.providerMode,
    usage: input.usage ? { ...input.usage } : undefined,
    elapsedMs: input.elapsedMs ?? undefined,
    error: input.error ?? undefined,
    result: input.result
      ? (JSON.parse(JSON.stringify(input.result)) as Record<string, unknown>)
      : undefined,
  };
  return {
    schemaVersion: CURRENT_AI_SECTION_VERSION,
    updatedAt: now,
    payload,
  };
}

export function buildDocumentFromMatch(
  record: MatchRecord,
  options?: { includeEmptyAi?: boolean; now?: number },
): MatchHistoryDocumentV1 {
  const now = options?.now ?? Date.now();
  const platformId = record.platformId ?? record.detail.platformId ?? 'unknown';
  const sections: Record<string, VersionedSection> = {
    [HISTORY_SECTION_MATCH]: matchRecordToMatchSection(record, now),
  };
  if (options?.includeEmptyAi !== false) {
    sections[HISTORY_SECTION_AI] = buildEmptyAiSection(now);
  }
  return {
    schemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
    id: record.id,
    platformId,
    savedAt: now,
    updatedAt: now,
    matchTime: record.time,
    sections,
  };
}

/** 磁盘 index 只用的瘦元数据 */
export function documentToIndexMeta(doc: MatchHistoryDocumentV1): MatchHistoryIndexItemV2 {
  return {
    id: doc.id,
    platformId: doc.platformId,
    savedAt: doc.savedAt,
    updatedAt: doc.updatedAt,
  };
}

/** 从文档实时计算列表展示字段（不落盘） */
export function documentToListItem(
  document: MatchHistoryDocumentV1,
  unsupportedSections: string[] = [],
): MatchHistoryListItem {
  const matchUnsupported = unsupportedSections.includes(HISTORY_SECTION_MATCH);
  const matchSec = document.sections[HISTORY_SECTION_MATCH];
  const record = matchUnsupported
    ? null
    : buildMatchRecordFromSection(document.id, document.platformId, document.matchTime, matchSec);

  const teamA = record?.detail.teams.find((t) => t.side === 'A');
  const teamB = record?.detail.teams.find((t) => t.side === 'B');
  const teamAAvg = teamAvgScore(teamA);
  const teamBAvg = teamAvgScore(teamB);

  const aiUnsupported = unsupportedSections.includes(HISTORY_SECTION_AI);
  const aiSec = document.sections[HISTORY_SECTION_AI];
  const aiPayload = !aiUnsupported && aiSec ? normalizeAiSectionPayload(aiSec.payload) : null;
  const aiResult = aiPayload?.result ? normalizeAiResult(aiPayload.result) : null;

  return {
    id: document.id,
    platformId: document.platformId,
    savedAt: document.savedAt,
    updatedAt: document.updatedAt,
    matchTime: document.matchTime,
    mapName: record?.detail.mapName ?? record?.summary.mapName,
    playerCount: record?.summary.playerCount,
    mode: record?.summary.mode,
    teamAAvgScore: teamAAvg,
    teamBAvgScore: teamBAvg,
    matchAvgScore: computeMatchAvgScore(teamAAvg, teamBAvg),
    aiStatus: aiPayload?.status,
    aiPredictedWinner: aiResult?.predictedWinner,
    aiWinProbA: aiResult?.winProbability.A,
    aiWinProbB: aiResult?.winProbability.B,
    unsupportedSections: unsupportedSections.length ? unsupportedSections : undefined,
  };
}

export interface MatchHistoryViewModel {
  document: MatchHistoryDocumentV1;
  record: MatchRecord | null;
  ai: {
    status: AiHistoryStatus;
    result: AiAnalysisResult | null;
    usage: AiTokenUsage | null;
    elapsedMs: number | null;
    error: string | null;
    model?: string;
    providerMode?: string;
    analyzedAt?: number;
  };
  unsupportedSections: string[];
}

export function documentToViewModel(
  document: MatchHistoryDocumentV1,
  unsupportedSections: string[] = [],
): MatchHistoryViewModel {
  const matchSec = document.sections[HISTORY_SECTION_MATCH];
  const record = unsupportedSections.includes(HISTORY_SECTION_MATCH)
    ? null
    : buildMatchRecordFromSection(document.id, document.platformId, document.matchTime, matchSec);

  const aiUnsupported = unsupportedSections.includes(HISTORY_SECTION_AI);
  const aiSec = document.sections[HISTORY_SECTION_AI];
  const aiPayload = !aiUnsupported && aiSec ? normalizeAiSectionPayload(aiSec.payload) : null;

  return {
    document,
    record,
    ai: {
      status: aiPayload?.status ?? 'none',
      result: aiPayload?.result ? normalizeAiResult(aiPayload.result) : null,
      usage: aiPayload?.usage ? normalizeAiUsage(aiPayload.usage) : null,
      elapsedMs: aiPayload?.elapsedMs ?? null,
      error: aiPayload?.error ?? null,
      model: aiPayload?.model,
      providerMode: aiPayload?.providerMode,
      analyzedAt: aiPayload?.analyzedAt,
    },
    unsupportedSections,
  };
}
