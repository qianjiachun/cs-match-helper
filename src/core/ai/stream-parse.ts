import type { AiAnalysisResult, AiPredictedWinner } from './types';
import { sanitizeAiAnalysisResult, sanitizeAiText } from './sanitize-result';

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
  const block = text.match(/"(?:modelWinProbability|winProbability)"\s*:\s*\{([^}]*)\}/);
  if (!block) return null;
  const inner = block[1];
  const a = inner.match(/"A"\s*:\s*(-?\d+(?:\.\d+)?)/);
  const b = inner.match(/"B"\s*:\s*(-?\d+(?:\.\d+)?)/);
  if (!a || !b) return null;
  return { A: Number(a[1]), B: Number(b[1]) };
}

const VALID_WINNERS = new Set<AiPredictedWinner>(['A', 'B', 'Even', 'Unknown']);

/** 从不完整流式 JSON 中提取可展示字段，用于首屏快速显示 */
export function extractPartialAiResult(text: string): Partial<AiAnalysisResult> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '');
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
    partial.modelWinProbability = winProbability;
    partial.winProbability = winProbability;
    hasAny = true;
  }

  const headline = extractJsonStringField(trimmed, 'headline');
  if (headline) {
    partial.headline = sanitizeAiText(headline);
    hasAny = true;
  }

  const confidence = extractNumberField(trimmed, 'confidence');
  if (confidence != null) {
    partial.confidence = confidence;
    hasAny = true;
  }

  return hasAny ? partial : null;
}

export function mergePartialResult(
  current: AiAnalysisResult | null,
  partial: Partial<AiAnalysisResult>,
): AiAnalysisResult {
  return sanitizeAiAnalysisResult({
    schemaVersion: 3,
    predictedWinner: partial.predictedWinner ?? current?.predictedWinner ?? 'Unknown',
    modelWinProbability: partial.modelWinProbability ?? current?.modelWinProbability ?? partial.winProbability ?? { A: 50, B: 50 },
    winProbability: partial.winProbability ?? current?.winProbability ?? { A: 50, B: 50 },
    confidence: partial.confidence ?? current?.confidence ?? 0,
    dataCoverage: current?.dataCoverage ?? 0,
    headline: partial.headline ?? current?.headline ?? '',
    decisiveFactors: current?.decisiveFactors ?? [],
    playerSignals: current?.playerSignals ?? [],
    teamPlans: current?.teamPlans ?? {
      A: { winConditions: [], risks: [] },
      B: { winConditions: [], risks: [] },
    },
    uncertainties: current?.uncertainties ?? [],
    inputFingerprint: current?.inputFingerprint,
    dataQuality: current?.dataQuality ?? '',
  });
}
