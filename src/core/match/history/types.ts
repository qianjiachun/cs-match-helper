/** 文档信封当前版本 */
export const CURRENT_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const CURRENT_MATCH_SECTION_VERSION = 1 as const;
export const CURRENT_AI_SECTION_VERSION = 1 as const;

/** 索引目录版本：v2 仅存定位/排序元数据 */
export const CURRENT_INDEX_SCHEMA_VERSION = 2 as const;

/** @deprecated 已取消条数上限 */
export const DEFAULT_MAX_HISTORY_ENTRIES = 0;

export const HISTORY_SECTION_MATCH = 'match';
export const HISTORY_SECTION_AI = 'ai';

export type HistorySectionName = typeof HISTORY_SECTION_MATCH | typeof HISTORY_SECTION_AI | string;

export interface VersionedSection<T = unknown> {
  schemaVersion: number;
  updatedAt: number;
  payload: T;
}

/** 磁盘 index 条目：仅元数据 */
export interface MatchHistoryIndexItemV2 {
  id: string;
  platformId: string;
  savedAt: number;
  updatedAt: number;
}

export interface MatchHistoryIndexV2 {
  schemaVersion: 2;
  entries: MatchHistoryIndexItemV2[];
}

/** @deprecated 旧索引类型别名，迁移后不再使用派生字段 */
export type MatchHistoryIndexItemV1 = MatchHistoryIndexItemV2 & {
  schemaVersion?: 1;
  matchTime?: string;
  mapName?: string;
  playerCount?: number;
  mode?: string;
  preview?: Record<string, unknown>;
  sectionsPresent?: string[];
};

export type MatchHistoryIndexV1 = MatchHistoryIndexV2;

export interface MatchSectionPayloadV1 {
  summary: Record<string, unknown>;
  detail: Record<string, unknown>;
  /** AI 复现所需的平台原始子集（如 5E p5eBundle）；完美通常省略 */
  data?: Record<string, unknown>;
}

export type AiHistoryStatus = 'none' | 'done' | 'error' | 'cancelled';

export interface AiSectionPayloadV1 {
  status: AiHistoryStatus;
  analyzedAt?: number;
  model?: string;
  providerMode?: string;
  usage?: Record<string, unknown>;
  elapsedMs?: number;
  error?: string;
  result?: Record<string, unknown>;
}

export interface MatchHistoryDocumentV1 {
  schemaVersion: 1;
  id: string;
  platformId: string;
  savedAt: number;
  updatedAt: number;
  matchTime?: string;
  sections: Record<string, VersionedSection>;
}

/** 列表展示 ViewModel（内存计算，不落盘） */
export interface MatchHistoryListItem {
  id: string;
  platformId: string;
  savedAt: number;
  updatedAt: number;
  matchTime?: string;
  mapName?: string;
  playerCount?: number;
  mode?: string;
  teamAAvgScore?: number;
  teamBAvgScore?: number;
  /** 当局均分：两侧取平均，或仅有一侧时用该侧 */
  matchAvgScore?: number;
  aiStatus?: AiHistoryStatus;
  aiPredictedWinner?: string;
  aiWinProbA?: number;
  aiWinProbB?: number;
  unsupportedSections?: string[];
}

export interface SectionMigrateResult {
  section: VersionedSection;
  /** 节版本高于当前客户端能处理的版本 */
  unsupported?: boolean;
}
