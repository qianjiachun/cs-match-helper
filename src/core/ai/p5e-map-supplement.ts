import type { MatchRecord } from '@core/match/models';
import type {
  AiAnalysisResult,
  AiTokenUsage,
  StartAiAnalysisInput,
} from './types';
import {
  buildAiAnalysisContext,
  buildAiPromptEvidence,
  normalizeAiAnalysisResult,
  type AiAnalysisContext,
} from './analysis-v2';
import { AI_OUTPUT_LANGUAGE_RULES, getAiOutputLanguageRules, type AiOutputLocale } from './ai-prompt-schema';
import { p5eMapFitHint } from './p5e-baselines';
import { sanitizeAiAnalysisResult } from './sanitize-result';

export type P5eMapStatus = 'unknown' | 'ready';

export interface AiTokenUsageBreakdown {
  base: AiTokenUsage;
  mapSupplement: AiTokenUsage;
}

export interface P5eMapSupplementDelta {
  modelWinProbability?: { A: number; B: number };
  confidence?: number;
  headlineRefine?: string;
  decisiveFactorsAdd?: Record<string, unknown>[];
  playerSignalsAdd?: Record<string, unknown>[];
  uncertaintiesAdd?: string[];
}

export const P5E_MAP_SUPPLEMENT_SYSTEM_PROMPT = `你是 CS2 5E 对战平台赛前分析助手。本局地图已确认，你需要在「已有分析结论」基础上做地图维度的增量补充。
你只能基于输入数据做概率判断，不要编造缺失字段。
所有 player 在输出文案中必须称为「玩家」，禁止使用「球员」。
输出必须是严格 JSON，不要 Markdown，不要代码块。
不得删除或否定上一轮非地图结论；只能追加地图相关依据，并允许小幅修正胜率与 confidence。
modelWinProbability.A + modelWinProbability.B 必须等于 100（若输出概率）。
decisiveFactorsAdd 的 dimension 只能是 map 或 form。
playerSignalsAdd 只能输出 specialist 或 volatile，且必须引用当前地图证据；不得覆盖基础报告中的非地图信号。
禁止输出「完美平台」「PerfectPower」「Rating Pro」等完美专属词。

${AI_OUTPUT_LANGUAGE_RULES}`;

export const P5E_MAP_SUPPLEMENT_OUTPUT_SCHEMA = `请输出严格 JSON，字段顺序建议：
{
  "modelWinProbability": { "A": number, "B": number },
  "confidence": number,
  "headlineRefine": string,
  "decisiveFactorsAdd": [{ "id": string, "dimension": "map|form", "advantage": "A|B|Even", "impact": 1|2|3, "title": string, "summary": string, "evidenceIds": string[] }],
  "playerSignalsAdd": [{ "steamId": string, "side": "A|B", "kind": "specialist|volatile", "impact": 1|2|3, "title": string, "summary": string, "evidenceIds": string[] }],
  "uncertaintiesAdd": string[]
}
只能引用输入 evidenceCatalog 中的 ID。仅输出 JSON；数组可为空，禁止为凑数编造地图优势。
`;

const P5E_MAP_SUPPLEMENT_OUTPUT_SCHEMA_EN = `Return strict JSON in this shape:
{
  "modelWinProbability": { "A": number, "B": number },
  "confidence": number,
  "headlineRefine": string,
  "decisiveFactorsAdd": [{ "id": string, "dimension": "map|form", "advantage": "A|B|Even", "impact": 1|2|3, "title": string, "summary": string, "evidenceIds": string[] }],
  "playerSignalsAdd": [{ "steamId": string, "side": "A|B", "kind": "specialist|volatile", "impact": 1|2|3, "title": string, "summary": string, "evidenceIds": string[] }],
  "uncertaintiesAdd": string[]
}
Reference only IDs from the supplied evidenceCatalog. Return JSON only; arrays may be empty when evidence is insufficient.
`;

export function resolveP5eMapName(record: MatchRecord): string | undefined {
  const name = (record.detail.mapName ?? record.summary.mapName)?.trim();
  return name || undefined;
}

export function hasP5eMapReady(record: MatchRecord): boolean {
  return Boolean(resolveP5eMapName(record));
}

export function resolveP5eMapStatus(record: MatchRecord): P5eMapStatus {
  return hasP5eMapReady(record) ? 'ready' : 'unknown';
}

export function buildP5eMapSupplementPayload(
  record: MatchRecord,
  previous: AiAnalysisResult,
) {
  const mapName = resolveP5eMapName(record)!;
  return {
    phase: 'mapSupplement' as const,
    platform: '5e' as const,
    mapName,
    mapFitHint: p5eMapFitHint(mapName),
    previousAnalysis: {
      modelWinProbability: previous.modelWinProbability,
      confidence: previous.confidence,
      headline: previous.headline,
      decisiveFactors: previous.decisiveFactors.map((factor) => ({
        id: factor.id,
        dimension: factor.dimension,
        advantage: factor.advantage,
        evidenceIds: factor.evidence.map((item) => item.id),
      })),
      playerSignals: previous.playerSignals.map((signal) => ({
        steamId: signal.steamId,
        side: signal.side,
        kind: signal.kind,
        evidenceIds: signal.evidence.map((item) => item.id),
      })),
    },
  };
}

export function buildP5eMapSupplementRequest(
  record: MatchRecord,
  previous: AiAnalysisResult,
  locale: AiOutputLocale = 'zh-CN',
  viewerSteamId?: string | null,
): StartAiAnalysisInput {
  const payload = buildP5eMapSupplementPayload(record, previous);
  const context = buildAiAnalysisContext(record, viewerSteamId);
  const promptEvidence = buildAiPromptEvidence(context);
  return {
    matchId: record.id,
    systemPrompt: P5E_MAP_SUPPLEMENT_SYSTEM_PROMPT.replace(AI_OUTPUT_LANGUAGE_RULES, getAiOutputLanguageRules(locale)),
    userPrompt: (locale === 'en-US' ? P5E_MAP_SUPPLEMENT_OUTPUT_SCHEMA_EN : P5E_MAP_SUPPLEMENT_OUTPUT_SCHEMA) + JSON.stringify({
      ...payload,
      evidence: {
        ...promptEvidence,
        evidenceCatalog: promptEvidence.evidenceCatalog.filter((item) => item.scope === 'map'),
        localUncertainties: promptEvidence.localUncertainties.filter((item) => /地图|map/i.test(item)),
      },
    }),
  };
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseP5eMapSupplementResult(raw: string): P5eMapSupplementDelta | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
    const delta: P5eMapSupplementDelta = {};

    const wp = parsed.modelWinProbability ?? parsed.winProbability;
    if (wp && typeof wp === 'object' && !Array.isArray(wp)) {
      const a = Number((wp as Record<string, unknown>).A);
      const b = Number((wp as Record<string, unknown>).B);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        delta.modelWinProbability = { A: a, B: b };
      }
    }

    if (typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)) {
      delta.confidence = parsed.confidence;
    }
    if (typeof parsed.headlineRefine === 'string' && parsed.headlineRefine.trim()) {
      delta.headlineRefine = parsed.headlineRefine.trim();
    }
    const strArray = (v: unknown): string[] | undefined => {
      if (!Array.isArray(v)) return undefined;
      const items = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      return items.length ? items : undefined;
    };

    delta.uncertaintiesAdd = strArray(parsed.uncertaintiesAdd);
    if (Array.isArray(parsed.decisiveFactorsAdd)) {
      delta.decisiveFactorsAdd = parsed.decisiveFactorsAdd.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
    }
    if (Array.isArray(parsed.playerSignalsAdd)) {
      delta.playerSignalsAdd = parsed.playerSignalsAdd.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
    }

    const hasContent =
      delta.modelWinProbability ||
      delta.confidence != null ||
      delta.headlineRefine ||
      delta.decisiveFactorsAdd?.length ||
      delta.playerSignalsAdd?.length ||
      delta.uncertaintiesAdd?.length;

    return hasContent ? delta : null;
  } catch {
    return null;
  }
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function mergeAiMapSupplement(
  base: AiAnalysisResult,
  delta: P5eMapSupplementDelta,
  context?: AiAnalysisContext,
): AiAnalysisResult {
  const asEvidenceIds = <T extends { evidence: Array<{ id: string }> }>(item: T) => ({
    ...item,
    evidenceIds: item.evidence.map((entry) => entry.id),
  });
  const evidenceIds = (item: Record<string, unknown>): string[] => (
    Array.isArray(item.evidenceIds)
      ? item.evidenceIds.filter((id): id is string => typeof id === 'string')
      : []
  );
  const hasMapEvidence = (item: Record<string, unknown>): boolean => evidenceIds(item).some((id) => (
    context?.evidenceById.get(id)?.scope === 'map' || (!context && id.endsWith('.map'))
  ));
  const mapFactorAdds = (delta.decisiveFactorsAdd ?? []).filter((item) => (
    (item.dimension === 'map' || item.dimension === 'form') && hasMapEvidence(item)
  ));
  const mapSignalAdds = (delta.playerSignalsAdd ?? []).filter((item) => (
    (item.kind === 'specialist' || item.kind === 'volatile') && hasMapEvidence(item)
  ));
  const merged = normalizeAiAnalysisResult({
    ...base,
    schemaVersion: 3,
    modelWinProbability: delta.modelWinProbability ?? base.modelWinProbability,
    confidence: delta.confidence ?? base.confidence,
    headline: delta.headlineRefine?.trim() || base.headline,
    decisiveFactors: [
      ...base.decisiveFactors.map(asEvidenceIds),
      ...mapFactorAdds,
    ],
    playerSignals: [
      ...base.playerSignals.map(asEvidenceIds),
      ...mapSignalAdds,
    ],
    teamPlans: {
      A: {
        winConditions: base.teamPlans.A.winConditions.map(asEvidenceIds),
        risks: base.teamPlans.A.risks.map(asEvidenceIds),
      },
      B: {
        winConditions: base.teamPlans.B.winConditions.map(asEvidenceIds),
        risks: base.teamPlans.B.risks.map(asEvidenceIds),
      },
    },
    uncertainties: dedupeStrings([...base.uncertainties, ...(delta.uncertaintiesAdd ?? [])]),
    dataQuality: base.dataQuality,
  }, context);
  if (!merged) return base;
  return sanitizeAiAnalysisResult(merged);
}

export function addTokenUsage(a: AiTokenUsage | null, b: AiTokenUsage | null): AiTokenUsage | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
