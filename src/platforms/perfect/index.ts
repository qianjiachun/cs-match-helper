import type { PlatformAdapter } from '../types';
import { buildLogDir, buildLogPath } from './log-path';
import { extractMatchEvents, parseLogLine } from './log-parser';
import { createMatchRecord, parseMatchInput } from './match-parser';

export const perfectAdapter: PlatformAdapter = {
  id: 'perfect',
  label: '完美对战平台',
  buildLogDir,
  buildLogPath,
  parseLogLine,
  extractMatchEvents,
  createMatchRecord,
  parseMatchInput,
};

export { buildLogDir, buildLogPath } from './log-path';
export { decodeLogLine, decodePayload } from './log-decrypt';
export { BOOTSTRAP_MATCH_MAX_AGE_MS, extractMatchEvents, findLastMatchEventInLogLines, isLogLineWithinMaxAge, parseLogLine, parseLogLineTime } from './log-parser';
export { buildMatchDetail, createMatchRecord, parseMatchInput, summarizeMatch } from './match-parser';
export { normalizeMediaUrl, pickPlayerAvatar } from './media-url';
export * from './player-api';
