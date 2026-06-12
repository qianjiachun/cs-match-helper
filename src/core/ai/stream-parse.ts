import type { AiAnalysisResult, AiPredictedWinner } from './types';

function extractJsonStringField(text: string, field: string): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const m = text.match(re);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1];
  }
}

function extractNumberField(text: string, field: string): number | null {
  const re = new RegExp(`"${field}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`);
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

function extractWinProbability(text: string): { A: number; B: number } | null {
  const block = text.match(/"winProbability"\s*:\s*\{([^}]*)\}/);
  if (!block) return null;
  const inner = block[1];
  const a = inner.match(/"A"\s*:\s*(-?\d+(?:\.\d+)?)/);
  const b = inner.match(/"B"\s*:\s*(-?\d+(?:\.\d+)?)/);
  if (!a || !b) return null;
  return { A: Number(a[1]), B: Number(b[1]) };
}

function extractStringArray(text: string, field: string): string[] | null {
  const re = new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)\\]`);
  const m = text.match(re);
  if (!m) return null;
  const items: string[] = [];
  const itemRe = /"((?:\\.|[^"\\])*)"/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(m[1])) !== null) {
    try {
      items.push(JSON.parse(`"${im[1]}"`) as string);
    } catch {
      items.push(im[1]);
    }
  }
  return items.length ? items : null;
}

const VALID_WINNERS = new Set<AiPredictedWinner>(['A', 'B', 'Even', 'Unknown']);

/** 从不完整流式 JSON 中提取可展示字段，用于首屏快速显示 */
export function extractPartialAiResult(text: string): Partial<AiAnalysisResult> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;

  const partial: Partial<AiAnalysisResult> = {};
  let hasAny = false;

  const winner = extractJsonStringField(trimmed, 'predictedWinner');
  if (winner && VALID_WINNERS.has(winner as AiPredictedWinner)) {
    partial.predictedWinner = winner as AiPredictedWinner;
    hasAny = true;
  }

  const winProbability = extractWinProbability(trimmed);
  if (winProbability) {
    partial.winProbability = winProbability;
    hasAny = true;
  }

  const headline = extractJsonStringField(trimmed, 'headline');
  if (headline) {
    partial.headline = headline;
    hasAny = true;
  }

  const confidence = extractNumberField(trimmed, 'confidence');
  if (confidence != null) {
    partial.confidence = confidence;
    hasAny = true;
  }

  const quickReasons = extractStringArray(trimmed, 'quickReasons');
  if (quickReasons) {
    partial.quickReasons = quickReasons;
    hasAny = true;
  }

  const stabilityReason = extractJsonStringField(trimmed, 'stabilityReason');
  if (stabilityReason) {
    partial.stabilityReason = stabilityReason;
    hasAny = true;
  }

  return hasAny ? partial : null;
}

export function mergePartialResult(
  current: AiAnalysisResult | null,
  partial: Partial<AiAnalysisResult>,
): AiAnalysisResult {
  return {
    predictedWinner: partial.predictedWinner ?? current?.predictedWinner ?? 'Unknown',
    winProbability: partial.winProbability ?? current?.winProbability ?? { A: 50, B: 50 },
    confidence: partial.confidence ?? current?.confidence ?? 0,
    headline: partial.headline ?? current?.headline ?? '',
    quickReasons: partial.quickReasons ?? current?.quickReasons,
    keyFactors: current?.keyFactors ?? [],
    playerNotes: current?.playerNotes ?? [],
    risks: current?.risks ?? [],
    dataQuality: current?.dataQuality ?? '',
    recommendedFocus: current?.recommendedFocus,
    mapFitNotes: current?.mapFitNotes,
    teamSummary: current?.teamSummary,
    stabilityReason: partial.stabilityReason ?? current?.stabilityReason,
  };
}
