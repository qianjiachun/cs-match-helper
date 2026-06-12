/** 解析后的日志行（跨平台通用） */
export interface LogLine {
  time?: string;
  level?: string;
  category?: string;
  message?: string;
  decoded: string;
  raw: string;
}

/** 调试面板展示的日志条目 */
export interface DebugLogEntry {
  id: string;
  receivedAt: string;
  parsed: LogLine;
  isMatchEvent: boolean;
}
