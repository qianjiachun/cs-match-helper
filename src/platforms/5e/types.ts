/** 5e CDP 脱敏 HTTP 事件（Rust → 前端） */
export interface P5eHttpEvent {
  kind: 'http';
  url: string;
  method: string;
  capturedAt: string;
  requestBody?: unknown;
  responseBody?: unknown;
  /** gate.5eplay.com 调试采集，不参与匹配聚合 */
  gateDebug?: boolean;
  /** CDP getResponseBody 失败时的错误摘要 */
  captureError?: string;
}

export interface P5eWsOpenEvent {
  kind: 'ws_open';
  requestId: string;
  url: string;
  capturedAt: string;
}

export interface P5eWsCloseEvent {
  kind: 'ws_close';
  requestId: string;
  url: string;
  capturedAt: string;
}

export interface P5eWsFrameEvent {
  kind: 'ws_frame';
  requestId: string;
  url: string;
  capturedAt: string;
  opcode: number;
  payloadRaw?: string;
  decodedText?: string;
  decodedJson?: unknown;
  innerBase64Text?: string;
  innerJson?: unknown;
  eventHint?: string;
  parseError?: string;
  truncated?: boolean;
}

export type P5eWsEvent = P5eWsOpenEvent | P5eWsCloseEvent | P5eWsFrameEvent;
export type P5eCdpEvent = P5eHttpEvent | P5eWsEvent;
export type P5eRawEvent = P5eCdpEvent;

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
  /** WS game_ctx.id，定锚主键 */
  gameId?: string;
  /** WS 定锚元数据（10 人 UUID、分队、接受状态） */
  wsAnchor?: import('./game-context').P5eWsGameAnchor;
  matchMode?: number[];
  /** Gate match detail 确认后的 match_code（与 gameId 校验关联） */
  matchCode?: string;
  mapName?: string;
  /** WS 地图候选与 Gate 不一致时的调试告警 */
  mapConflictWarning?: string;
  matchDetail?: unknown;
  capturedAt: string;
  userInfo?: P5eApiPayload;
  eloInfo?: P5eApiPayload;
  mapExt?: P5eApiPayload;
  /** uuid → player/home 原始响应 */
  playerHome?: Record<string, P5eApiPayload>;
  /** home enrich 失败时的错误信息（调试用） */
  homeEnrichError?: string;
  /** 三份 CDP API 未全部到齐 */
  incomplete?: boolean;
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
  | 'needsRelaunch'
  | 'stopped'
  | 'error';

export type P5eCdpStatusReason = 'cdp_lost_process_alive' | 'client_exited';

export interface P5eCdpStatus {
  running: boolean;
  port: number;
  phase: P5eCdpPhase;
  clientRoot?: string;
  targetUrl?: string;
  targetTitle?: string;
  eventsEmitted: number;
  lastError?: string;
  gateDebugMode?: boolean;
  wsDebugMode?: boolean;
  clientExited?: boolean;
  needsRelaunch?: boolean;
  cdpLostSince?: string;
  reason?: P5eCdpStatusReason | string;
}
