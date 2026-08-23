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
    decisiveFactors: result.decisiveFactors.map((factor) => ({
      ...factor,
      title: sanitizeAiText(factor.title),
      summary: sanitizeAiText(factor.summary),
    })),
    playerSignals: result.playerSignals.map((signal) => ({
      ...signal,
      title: sanitizeAiText(signal.title),
      summary: sanitizeAiText(signal.summary),
    })),
    teamPlans: {
      A: {
        winConditions: result.teamPlans.A.winConditions.map((item) => ({ ...item, text: sanitizeAiText(item.text) })),
        risks: result.teamPlans.A.risks.map((item) => ({ ...item, text: sanitizeAiText(item.text) })),
      },
      B: {
        winConditions: result.teamPlans.B.winConditions.map((item) => ({ ...item, text: sanitizeAiText(item.text) })),
        risks: result.teamPlans.B.risks.map((item) => ({ ...item, text: sanitizeAiText(item.text) })),
      },
    },
    uncertainties: result.uncertainties.map(sanitizeAiText),
  };
}
