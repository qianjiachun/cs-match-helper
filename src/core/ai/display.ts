import type { AiPredictedWinner } from './types';

/** 顶部 AI 胶囊等紧凑场景的胜负结论文案 */
export function formatAiWinnerCapsule(
  winner: AiPredictedWinner,
  prob: { A: number; B: number },
): string {
  switch (winner) {
    case 'A':
      return `A队 ${prob.A}%`;
    case 'B':
      return `B队 ${prob.B}%`;
    case 'Even':
      return prob.A === prob.B ? `势均力敌 ${prob.A}%` : `势均力敌 A${prob.A}%·B${prob.B}%`;
    case 'Unknown':
      return '难以判断';
    default:
      return '难以判断';
  }
}
