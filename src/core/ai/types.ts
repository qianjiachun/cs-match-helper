export type AiProviderMode = 'deepseek' | 'openai_compatible';

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_API_KEYS_URL = 'https://platform.deepseek.com/api_keys';

export interface AiProviderOption {
  value: AiProviderMode;
  label: string;
  description: string;
}

export const AI_PROVIDER_OPTIONS: readonly AiProviderOption[] = [
  {
    value: 'deepseek',
    label: 'DeepSeek 预设',
    description: '官方 API，含模型选择与思考模式',
  },
  {
    value: 'openai_compatible',
    label: 'OpenAI 兼容',
    description: '自定义模型',
  },
] as const;

export function isDeepSeekProvider(mode: AiProviderMode | string | undefined): boolean {
  return mode !== 'openai_compatible';
}

export function getApiKeyLabel(mode: AiProviderMode | string | undefined): string {
  return isDeepSeekProvider(mode) ? 'DeepSeek API Key' : 'API Key';
}

export function getMissingApiKeyMessage(
  mode: AiProviderMode | string | undefined,
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (locale === 'en-US') {
    return isDeepSeekProvider(mode)
      ? 'Configure a DeepSeek API key in Settings first'
      : 'Configure an API key in Settings first';
  }
  return isDeepSeekProvider(mode)
    ? '请先在设置中配置 DeepSeek API Key'
    : '请先在设置中配置 API Key';
}

export interface AiSettingsPublic {
  analysisEnabled: boolean;
  providerMode: AiProviderMode;
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
  /** 仅提交需要更新的字段，未提交字段保留本地已有值 */
  analysisEnabled?: boolean;
  providerMode?: AiProviderMode;
  /** 传空字符串表示清除已保存的 Key */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: string;
  autoAnalyze?: boolean;
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

export type AiEvidenceScope = 'team' | 'player' | 'map' | 'context';
export type AiEvidenceReliability = 'high' | 'medium' | 'low';
export type AiEvidenceDirection = 'positive' | 'negative' | 'mixed' | 'neutral';

export interface AiEvidenceComparison {
  rawValue: number;
  lobbyMedian?: number;
  teamMedian?: number;
  lobbyDelta?: number;
  teamDelta?: number;
  higherIsBetter: boolean;
}

export interface AiEvidenceSnapshot {
  id: string;
  scope: AiEvidenceScope;
  metric: string;
  label: string;
  side?: 'A' | 'B';
  steamId?: string;
  value?: string;
  valueA?: string;
  valueB?: string;
  sampleSize?: number;
  reliability: AiEvidenceReliability;
  direction?: AiEvidenceDirection;
  comparison?: AiEvidenceComparison;
}

export type AiMatchupDimension =
  | 'strength'
  | 'aim'
  | 'opening'
  | 'utility'
  | 'clutch'
  | 'map'
  | 'form'
  | 'party';

export interface AiMatchupEdge {
  id: string;
  dimension: AiMatchupDimension;
  advantage: 'A' | 'B' | 'Even';
  impact: 1 | 2 | 3;
  title: string;
  summary: string;
  evidence: AiEvidenceSnapshot[];
}

export type AiPlayerMarkerKind = 'threat' | 'key' | 'risk';

export interface AiPlayerMarker {
  steamId: string;
  nickname: string;
  side: 'A' | 'B';
  kind: AiPlayerMarkerKind;
  impact: 1 | 2 | 3;
  title: string;
  summary: string;
  evidence: AiEvidenceSnapshot[];
  source?: 'model' | 'legacy';
}

export interface AiWinCondition {
  text: string;
  evidence: AiEvidenceSnapshot[];
}

export type AiPlayerSignalKind =
  | 'carry'
  | 'anchor'
  | 'specialist'
  | 'weakLink'
  | 'volatile'
  | 'watch';

export interface AiPlayerSignal {
  steamId: string;
  nickname: string;
  side: 'A' | 'B';
  kind: AiPlayerSignalKind;
  impact: 1 | 2 | 3;
  title: string;
  summary: string;
  evidence: AiEvidenceSnapshot[];
  source?: 'model' | 'legacy';
}

export interface AiDecisiveFactor {
  id: string;
  dimension: AiMatchupDimension;
  advantage: 'A' | 'B' | 'Even';
  impact: 1 | 2 | 3;
  title: string;
  summary: string;
  evidence: AiEvidenceSnapshot[];
}

export interface AiEvidenceClaim {
  text: string;
  evidence: AiEvidenceSnapshot[];
}

export interface AiTeamPlan {
  winConditions: AiEvidenceClaim[];
  risks: AiEvidenceClaim[];
}

export interface AiAnalysisResultV3 {
  schemaVersion: 3;
  predictedWinner: AiPredictedWinner;
  modelWinProbability: { A: number; B: number };
  winProbability: { A: number; B: number };
  confidence: number;
  dataCoverage: number;
  headline: string;
  decisiveFactors: AiDecisiveFactor[];
  playerSignals: AiPlayerSignal[];
  teamPlans: { A: AiTeamPlan; B: AiTeamPlan };
  uncertainties: string[];
  inputFingerprint?: string;
  /** Local coverage summary shown only in the collapsed run details. */
  dataQuality: string;
}

export interface AiAnalysisResultV2 {
  schemaVersion: 2;
  predictedWinner: AiPredictedWinner;
  /** 模型原始概率，仅用于校准说明与调试。 */
  modelWinProbability: { A: number; B: number };
  /** 按本地数据覆盖率校准后的最终展示概率。 */
  winProbability: { A: number; B: number };
  /** 70% 本地覆盖率 + 30% 模型自评。 */
  confidence: number;
  dataCoverage: number;
  headline: string;
  matchupEdges: AiMatchupEdge[];
  playerMarkers: AiPlayerMarker[];
  winConditions: { A: AiWinCondition[]; B: AiWinCondition[] };
  uncertainties: string[];
  inputFingerprint?: string;
  /** 流式优先输出的 2-3 条核心依据 */
  quickReasons?: string[];
  /** @deprecated V2 使用 matchupEdges，保留供旧历史与 5E 补充兼容。 */
  keyFactors: AiKeyFactor[];
  /** @deprecated V2 使用 playerMarkers，保留供旧历史兼容。 */
  playerNotes: AiPlayerNote[];
  /** @deprecated V2 使用 uncertainties，保留供旧历史兼容。 */
  risks: string[];
  dataQuality: string;
  /** @deprecated UI 不再展示，兼容旧 JSON */
  recommendedFocus?: string[];
  /** @deprecated UI 不再展示，兼容旧 JSON */
  mapFitNotes?: string[];
  teamSummary?: { A: string; B: string };
  stabilityReason?: string;
}

/** Current normalized analysis result. V1/V2 payloads are converted in memory. */
export type AiAnalysisResult = AiAnalysisResultV3;

export interface AiAnalysisStartEvent {
  matchId: string;
  jobId: number;
  startedAt: number;
}

export interface AiAnalysisDeltaEvent {
  matchId: string;
  jobId: number;
  delta: string;
  fullText: string;
}

export interface AiAnalysisDoneEvent {
  matchId: string;
  jobId: number;
  fullText: string;
  usage: AiTokenUsage | null;
  elapsedMs: number;
}

export interface AiAnalysisErrorEvent {
  matchId: string;
  jobId: number;
  error: string;
}

export interface AiAnalysisCancelledEvent {
  matchId: string;
  jobId: number;
  elapsedMs: number;
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
};

export const AI_MODEL_OPTIONS: readonly AiModelOption[] = [
  {
    value: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash（推荐，快速）',
  },
  {
    value: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro（更准确，较慢）',
  },
];

export function resolveModelOption(model: string): AiModelOption | null {
  return AI_MODEL_OPTIONS.find((opt) => opt.value === model) ?? null;
}

export function hasKnownModelPricing(model: string): boolean {
  return resolveModelOption(model) !== null;
}

export const REASONING_EFFORT_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
] as const;
