import type { MatchRecord } from '@core/match/models';
import type {
  AiAnalysisResult,
  AiKeyFactor,
  AiPlayerNote,
  AiTokenUsage,
  StartAiAnalysisInput,
} from './types';
import { AI_OUTPUT_LANGUAGE_RULES } from './ai-prompt-schema';
import { p5eMapFitHint } from './p5e-baselines';
import { sanitizeAiAnalysisResult } from './sanitize-result';

export type P5eMapStatus = 'unknown' | 'ready';

export interface AiTokenUsageBreakdown {
  base: AiTokenUsage;
  mapSupplement: AiTokenUsage;
}

export interface P5eMapSupplementDelta {
  winProbability?: { A: number; B: number };
  confidence?: number;
  headlineRefine?: string;
  quickReasonsAdd?: string[];
  keyFactorsAdd?: AiKeyFactor[];
  playerNotesAdd?: AiPlayerNote[];
  risksAdd?: string[];
  dataQuality?: string;
}

export const P5E_MAP_SUPPLEMENT_SYSTEM_PROMPT = `你是 CS2 5E 对战平台赛前分析助手。本局地图已确认，你需要在「已有分析结论」基础上做地图维度的增量补充。
你只能基于输入数据做概率判断，不要编造缺失字段。
所有 player 在输出文案中必须称为「玩家」，禁止使用「球员」。
输出必须是严格 JSON，不要 Markdown，不要代码块。
不得删除或否定上一轮非地图结论；只能追加地图相关依据，并允许小幅修正胜率与 confidence。
winProbability.A + winProbability.B 必须等于 100（若输出 winProbability）。
keyFactorsAdd 的 type 应为 map 或 form（地图适配相关）。
禁止输出「完美平台」「PerfectPower」「Rating Pro」等完美专属词。

${AI_OUTPUT_LANGUAGE_RULES}`;

export const P5E_MAP_SUPPLEMENT_OUTPUT_SCHEMA = `请输出严格 JSON，字段顺序建议：
{
  "winProbability": { "A": number, "B": number },
  "confidence": number,
  "headlineRefine": string,
  "quickReasonsAdd": string[],
  "keyFactorsAdd": [{ "side": "A|B|Both", "type": "map|form|risk", "text": string, "weight": number }],
  "playerNotesAdd": [{ "steamId": string, "nickname": string, "side": "A|B", "text": string, "role": string }],
  "risksAdd": string[],
  "dataQuality": string
}
仅输出 JSON。winProbability、confidence、headlineRefine 为可选；其余数组可为空但建议至少提供 keyFactorsAdd 或 quickReasonsAdd。
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

function summarizeMapPlayersForSupplement(record: MatchRecord) {
  const mapName = resolveP5eMapName(record);
  return record.detail.teams.flatMap((team) =>
    team.players.map((player) => ({
      steamId: player.steamId,
      nickname: player.nickname,
      side: team.side,
      mapWinRate:
        player.mapWinRate != null ? `${Math.round(player.mapWinRate * 100)}%` : undefined,
      mapMatches: player.mapTotalNum,
      mapSampleLow: player.mapSampleLow || undefined,
    })),
  );
}

function summarizeMapTeamsForSupplement(record: MatchRecord) {
  return record.detail.teams.map((team) => {
    const mapRates = team.players
      .map((p) => p.mapWinRate)
      .filter((n): n is number => n != null);
    const mapWinRate =
      mapRates.length > 0
        ? `${Math.round((mapRates.reduce((a, b) => a + b, 0) / mapRates.length) * 100)}%`
        : undefined;
    return {
      side: team.side,
      mapWinRate,
      lowMapSampleCount: team.players.filter((p) => p.mapSampleLow).length || undefined,
    };
  });
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
    previousAnalysis: previous,
    mapPlayerStats: summarizeMapPlayersForSupplement(record),
    teams: summarizeMapTeamsForSupplement(record),
  };
}

export function buildP5eMapSupplementRequest(
  record: MatchRecord,
  previous: AiAnalysisResult,
): StartAiAnalysisInput {
  const payload = buildP5eMapSupplementPayload(record, previous);
  return {
    matchId: record.id,
    systemPrompt: P5E_MAP_SUPPLEMENT_SYSTEM_PROMPT,
    userPrompt: P5E_MAP_SUPPLEMENT_OUTPUT_SCHEMA + JSON.stringify(payload),
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

    const wp = parsed.winProbability;
    if (wp && typeof wp === 'object' && !Array.isArray(wp)) {
      const a = Number((wp as Record<string, unknown>).A);
      const b = Number((wp as Record<string, unknown>).B);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        delta.winProbability = { A: a, B: b };
      }
    }

    if (typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)) {
      delta.confidence = parsed.confidence;
    }
    if (typeof parsed.headlineRefine === 'string' && parsed.headlineRefine.trim()) {
      delta.headlineRefine = parsed.headlineRefine.trim();
    }
    if (typeof parsed.dataQuality === 'string' && parsed.dataQuality.trim()) {
      delta.dataQuality = parsed.dataQuality.trim();
    }

    const strArray = (v: unknown): string[] | undefined => {
      if (!Array.isArray(v)) return undefined;
      const items = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      return items.length ? items : undefined;
    };

    delta.quickReasonsAdd = strArray(parsed.quickReasonsAdd);
    delta.risksAdd = strArray(parsed.risksAdd);

    if (Array.isArray(parsed.keyFactorsAdd)) {
      const factors: AiKeyFactor[] = [];
      for (const item of parsed.keyFactorsAdd) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const text = typeof row.text === 'string' ? row.text.trim() : '';
        if (!text) continue;
        const side = row.side === 'A' || row.side === 'B' || row.side === 'Both' ? row.side : 'Both';
        const type =
          row.type === 'strength' ||
          row.type === 'risk' ||
          row.type === 'map' ||
          row.type === 'party' ||
          row.type === 'form'
            ? row.type
            : 'map';
        const weight = typeof row.weight === 'number' && Number.isFinite(row.weight) ? row.weight : 0.5;
        factors.push({ side, type, text, weight });
      }
      if (factors.length) delta.keyFactorsAdd = factors;
    }

    if (Array.isArray(parsed.playerNotesAdd)) {
      const notes: AiPlayerNote[] = [];
      for (const item of parsed.playerNotesAdd) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const text = typeof row.text === 'string' ? row.text.trim() : '';
        const steamId = typeof row.steamId === 'string' ? row.steamId : '';
        const nickname = typeof row.nickname === 'string' ? row.nickname : '';
        const side = row.side === 'A' || row.side === 'B' ? row.side : 'A';
        if (!text) continue;
        notes.push({
          steamId,
          nickname,
          side,
          text,
          role: typeof row.role === 'string' ? row.role : undefined,
        });
      }
      if (notes.length) delta.playerNotesAdd = notes;
    }

    const hasContent =
      delta.winProbability ||
      delta.confidence != null ||
      delta.headlineRefine ||
      delta.quickReasonsAdd?.length ||
      delta.keyFactorsAdd?.length ||
      delta.playerNotesAdd?.length ||
      delta.risksAdd?.length ||
      delta.dataQuality;

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

function dedupeFactors(items: AiKeyFactor[]): AiKeyFactor[] {
  const seen = new Set<string>();
  const out: AiKeyFactor[] = [];
  for (const item of items) {
    const key = `${item.side}|${item.type}|${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function dedupePlayerNotes(items: AiPlayerNote[]): AiPlayerNote[] {
  const seen = new Set<string>();
  const out: AiPlayerNote[] = [];
  for (const item of items) {
    const key = `${item.steamId}|${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function mergeAiMapSupplement(
  base: AiAnalysisResult,
  delta: P5eMapSupplementDelta,
): AiAnalysisResult {
  const merged: AiAnalysisResult = {
    ...base,
    winProbability: delta.winProbability ?? base.winProbability,
    confidence: delta.confidence ?? base.confidence,
    headline: delta.headlineRefine?.trim() || base.headline,
    quickReasons: dedupeStrings([...(base.quickReasons ?? []), ...(delta.quickReasonsAdd ?? [])]),
    keyFactors: dedupeFactors([...base.keyFactors, ...(delta.keyFactorsAdd ?? [])]),
    playerNotes: dedupePlayerNotes([...base.playerNotes, ...(delta.playerNotesAdd ?? [])]),
    risks: dedupeStrings([...base.risks, ...(delta.risksAdd ?? [])]),
    dataQuality: delta.dataQuality
      ? `${base.dataQuality} ${delta.dataQuality}`.trim()
      : base.dataQuality,
  };
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
