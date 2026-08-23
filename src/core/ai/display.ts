import type { AiPredictedWinner } from './types';
import { sideRelationshipLabel, type AiSide } from './perspective';

/** 顶部 AI 胶囊等紧凑场景的胜负结论文案 */
export function formatAiWinnerCapsule(
  winner: AiPredictedWinner,
  prob: { A: number; B: number },
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
  selfSide?: AiSide | null,
): string {
  const en = locale === 'en-US';
  const labelA = selfSide ? sideRelationshipLabel('A', selfSide, locale) : en ? 'Team A' : 'A队';
  const labelB = selfSide ? sideRelationshipLabel('B', selfSide, locale) : en ? 'Team B' : 'B队';
  switch (winner) {
    case 'A':
      return `${labelA} ${prob.A}%`;
    case 'B':
      return `${labelB} ${prob.B}%`;
    case 'Even':
      return prob.A === prob.B
        ? (en ? `Even ${prob.A}%` : `势均力敌 ${prob.A}%`)
        : (en
          ? `Even ${labelA} ${prob.A}% · ${labelB} ${prob.B}%`
          : selfSide
            ? `势均力敌 ${labelA}${prob.A}%·${labelB}${prob.B}%`
            : `势均力敌 A${prob.A}%·B${prob.B}%`);
    case 'Unknown':
      return en ? 'Unclear' : '难以判断';
    default:
      return en ? 'Unclear' : '难以判断';
  }
}
