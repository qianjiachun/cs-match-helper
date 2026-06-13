export interface AiSettingsPublic {
  analysisEnabled: boolean;
  hasApiKey: boolean;
  /** 本机设置面板回显用，HTTP 请求不在前端携带 */
  apiKey: string;
  apiKeyMasked: string;
  baseUrl: string;
  model: string;
  thinkingEnabled: boolean;
  reasoningEffort: string;
  autoAnalyze: boolean;
  timeoutMs: number;
}

/** 用户开启且已配置 Key 时，AI 分析才真正可用 */
export function isAiAnalysisActive(
  settings: AiSettingsPublic | null | undefined,
): boolean {
  return Boolean(settings?.analysisEnabled && settings?.hasApiKey);
}

export interface SaveAiSettingsInput {
  analysisEnabled: boolean;
  /** 传空字符串表示清除已保存的 Key */
  apiKey: string;
  baseUrl: string;
  model: string;
  thinkingEnabled: boolean;
  reasoningEffort: string;
  autoAnalyze: boolean;
}

export interface StartAiAnalysisInput {
  matchId: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type AiPredictedWinner = 'A' | 'B' | 'Even' | 'Unknown';

export type AiFactorType = 'strength' | 'risk' | 'map' | 'party' | 'form';
export type AiFactorSide = 'A' | 'B' | 'Both';

export interface AiKeyFactor {
  side: AiFactorSide;
  type: AiFactorType;
  text: string;
  weight: number;
}

export interface AiPlayerNote {
  steamId: string;
  nickname: string;
  side: 'A' | 'B';
  text: string;
  /** 对局角色/定位，如 entry / awp / lurk / anchor / support / risk */
  role?: string;
}

export interface AiAnalysisResult {
  predictedWinner: AiPredictedWinner;
  winProbability: { A: number; B: number };
  /** 模型对判断稳定性的自评，UI 展示为「数据把握度」 */
  confidence: number;
  headline: string;
  /** 流式优先输出的 2-3 条核心依据 */
  quickReasons?: string[];
  keyFactors: AiKeyFactor[];
  playerNotes: AiPlayerNote[];
  risks: string[];
  dataQuality: string;
  /** @deprecated UI 不再展示，兼容旧 JSON */
  recommendedFocus?: string[];
  /** @deprecated UI 不再展示，兼容旧 JSON */
  mapFitNotes?: string[];
  teamSummary?: { A: string; B: string };
  stabilityReason?: string;
}

export interface AiAnalysisStartEvent {
  matchId: string;
  startedAt: number;
}

export interface AiAnalysisDeltaEvent {
  matchId: string;
  delta: string;
  fullText: string;
}

export interface AiAnalysisDoneEvent {
  matchId: string;
  fullText: string;
  usage: AiTokenUsage | null;
  elapsedMs: number;
}

export interface AiAnalysisErrorEvent {
  matchId: string;
  error: string;
}

export type AiAnalysisStatus =
  | 'idle'
  | 'loading'
  | 'streaming'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'no-key';

export type AiModelOption = {
  value: string;
  label: string;
  /** 单次分析参考耗时（秒） */
  durationSec: number;
  /** 单次分析参考费用 */
  costLabel: string;
};

export const AI_MODEL_OPTIONS: readonly AiModelOption[] = [
  {
    value: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash（推荐，快速）',
    durationSec: 15,
    costLabel: '¥0.006',
  },
  {
    value: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro（更准确，较慢）',
    durationSec: 40,
    costLabel: '¥0.02',
  },
];

export function formatModelBudgetHint(opt: Pick<AiModelOption, 'durationSec' | 'costLabel'>): string {
  return `约 ${opt.durationSec} 秒 · ${opt.costLabel}/次`;
}

export const REASONING_EFFORT_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
] as const;
