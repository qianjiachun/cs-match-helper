/** Tauri IPC 载荷类型（跨平台通用） */
export interface LogLinePayload {
  raw: string;
}

export interface MatchEventPayload {
  id: string;
  time?: string;
  level?: string;
  category?: string;
  decoded: string;
  data?: Record<string, unknown>;
}

export interface WatcherStatus {
  running: boolean;
  logPath: string;
  fileExists: boolean;
  fileSize: number;
  linesReceived: number;
  lastError?: string;
  /** 曾监听的日志文件丢失且未恢复 */
  logSourceLost?: boolean;
  logSourceLostMessage?: string;
}
