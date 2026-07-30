import type { AiPredictedWinner } from './types';

/** 顶部 AI 胶囊等紧凑场景的胜负结论文案 */
export function formatAiWinnerCapsule(
  winner: AiPredictedWinner,
  prob: { A: number; B: number },
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  const en = locale === 'en-US';
  switch (winner) {
    case 'A':
      return en ? `Team A ${prob.A}%` : `A队 ${prob.A}%`;
    case 'B':
      return en ? `Team B ${prob.B}%` : `B队 ${prob.B}%`;
    case 'Even':
      return prob.A === prob.B
        ? (en ? `Even ${prob.A}%` : `势均力敌 ${prob.A}%`)
        : (en ? `Even A ${prob.A}% · B ${prob.B}%` : `势均力敌 A${prob.A}%·B${prob.B}%`);
    case 'Unknown':
      return en ? 'Unclear' : '难以判断';
    default:
      return en ? 'Unclear' : '难以判断';
  }
}
