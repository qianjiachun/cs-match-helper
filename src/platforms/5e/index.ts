import type { LogLine } from '@core/log/types';
import type { PlatformAdapter } from '../types';
import { createP5eMatchRecord, parseP5eMatchInput } from './match-parser';
import type { P5eMatchBundle } from './types';

function emptyLogLine(): LogLine {
  return {
    time: new Date().toLocaleString('zh-CN'),
    level: 'INFO',
    category: '5e',
    decoded: '',
    raw: '',
  };
}

export const p5eAdapter: PlatformAdapter = {
  id: '5e',
  label: '5E 对战平台',
  buildLogDir: () => '',
  buildLogPath: () => '',
  parseLogLine: (raw) => ({
    ...emptyLogLine(),
    raw,
    decoded: raw,
  }),
  extractMatchEvents: () => null,
  createMatchRecord(id, logLine, data) {
    const bundle = (data.p5eBundle ?? data) as P5eMatchBundle;
    if (bundle?.uuids?.length) {
      return createP5eMatchRecord({ ...bundle, platformGameId: bundle.platformGameId ?? id }, logLine);
    }
    return createP5eMatchRecord(
      {
        platformGameId: id,
        uuids: [],
        capturedAt: new Date().toISOString(),
      },
      logLine,
    );
  },
  parseMatchInput(text) {
    const result = parseP5eMatchInput(text);
    if ('error' in result) return result;
    return { data: { p5eBundle: result.bundle } };
  },
};

export { P5eMatchAggregator } from './aggregator';
export { P5eMatchSession, type P5eCaptureProgress } from './match-session';
export { parseGameContextFromJson, parseGameContextFromWsEvent } from './game-context';
export { classifyP5eUrl, isP5eWhitelistedUrl, parseP5eNdjsonLine, sanitizeP5eHttpEvent } from './events';
export { buildP5eMatchDetail, createP5eMatchRecord, parseP5eMatchInput, summarizeP5eMatch } from './match-parser';
export { buildP5ePlayer, resolveMatchMap } from './field-mapper';
export * from './p5e-dev-overrides';
export * from './client-root-storage';
export * from './paths';
export * from './types';
