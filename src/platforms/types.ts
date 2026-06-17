import type { LogLine } from '@core/log/types';
import type { MatchRecord } from '@core/match/models';

/** 当前已实现的平台 */
export type PlatformId = 'perfect' | '5e';

/**
 * 平台适配器（完美平台当前通过日志监听实现）。
 * 后续 5E / B5 / Steam 等平台可能采用不同接入方式，接口届时再扩展。
 */
export interface PlatformAdapter {
  readonly id: PlatformId;
  readonly label: string;
  buildLogDir(homeDir: string): string;
  buildLogPath(homeDir: string): string;
  parseLogLine(raw: string): LogLine;
  extractMatchEvents(decodedText: string): Record<string, unknown> | null;
  createMatchRecord(id: string, logLine: LogLine, data: Record<string, unknown>): MatchRecord;
  parseMatchInput(text: string): { data: Record<string, unknown> } | { error: string };
}
