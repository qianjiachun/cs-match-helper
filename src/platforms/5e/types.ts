/** 5e CDP 脱敏 HTTP 事件（Rust → 前端） */
export interface P5eHttpEvent {
  kind: 'http';
  url: string;
  method: string;
  capturedAt: string;
  requestBody?: unknown;
  responseBody?: unknown;
}

export type P5eRawEvent = P5eHttpEvent;

export type P5eApiKind = 'userInfo' | 'eloInfo' | 'mapExt';

export interface P5eApiPayload {
  url: string;
  requestBody: unknown;
  responseBody: unknown;
}

/** 聚合完成后的匹配数据包 */
export interface P5eMatchBundle {
  platformGameId: string;
  uuids: string[];
  matchMode?: number[];
  /** 来自 match API 或 elo specialData */
  matchCode?: string;
  mapName?: string;
  matchDetail?: unknown;
  capturedAt: string;
  userInfo?: P5eApiPayload;
  eloInfo?: P5eApiPayload;
  mapExt?: P5eApiPayload;
}

export interface P5eProbeResult {
  externalRunning: boolean;
  fiveEProcessRunning: boolean;
  cdpPort?: number;
  installed: boolean;
  clientRoot?: string;
  message: string;
}

export interface P5eLaunchResult {
  launched: boolean;
  port: number;
  clientRoot?: string;
  pid?: number;
  cdpReady: boolean;
  message: string;
}

export type P5eCdpPhase =
  | 'idle'
  | 'launching'
  | 'cdpReady'
  | 'collecting'
  | 'reconnecting'
  | 'stopped'
  | 'error';

export interface P5eCdpStatus {
  running: boolean;
  port: number;
  phase: P5eCdpPhase;
  clientRoot?: string;
  targetUrl?: string;
  targetTitle?: string;
  eventsEmitted: number;
  lastError?: string;
}
