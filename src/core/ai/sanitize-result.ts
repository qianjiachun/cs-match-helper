import type { AiAnalysisResult } from './types';

/** 模型偶发将游戏参与者称为「球员」，统一纠正为「玩家」 */
export function sanitizeAiText(text: string): string {
  return text.replace(/球员/g, '玩家');
}

export function sanitizeAiAnalysisResult(result: AiAnalysisResult): AiAnalysisResult {
  return {
    ...result,
    headline: sanitizeAiText(result.headline),
    dataQuality: sanitizeAiText(result.dataQuality),
    stabilityReason: result.stabilityReason
      ? sanitizeAiText(result.stabilityReason)
      : result.stabilityReason,
    quickReasons: result.quickReasons?.map(sanitizeAiText),
    risks: result.risks.map(sanitizeAiText),
    keyFactors: result.keyFactors.map((f) => ({ ...f, text: sanitizeAiText(f.text) })),
    playerNotes: result.playerNotes.map((n) => ({ ...n, text: sanitizeAiText(n.text) })),
    teamSummary: result.teamSummary
      ? {
          A: sanitizeAiText(result.teamSummary.A),
          B: sanitizeAiText(result.teamSummary.B),
        }
      : result.teamSummary,
    recommendedFocus: result.recommendedFocus?.map(sanitizeAiText),
    mapFitNotes: result.mapFitNotes?.map(sanitizeAiText),
  };
}
