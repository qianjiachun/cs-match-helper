import type { P5eApiPayload, P5eMatchBundle } from './types';

/** 5E 匹配数据就绪后的确认倒计时（与 5E 客户端 30s 确认窗口一致） */
export const P5E_READY_COUNTDOWN_MS = 30_000;

/** Rust CDP 下发的毫秒数字串、秒级 epoch 或 ISO 时间 */
export function parseP5eCapturedAtMs(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n > 1e12 ? n : n * 1000;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractApiTimestamp(payload?: P5eApiPayload): number | undefined {
  const ts = (payload?.responseBody as { timestamp?: unknown } | undefined)?.timestamp;
  return typeof ts === 'number' && ts > 0 ? ts * 1000 : undefined;
}

export function computeP5eReadyDeadline(bundle: P5eMatchBundle): number | undefined {
  const anchors = [
    parseP5eCapturedAtMs(bundle.wsAnchor?.capturedAt),
    extractApiTimestamp(bundle.userInfo),
    extractApiTimestamp(bundle.eloInfo),
    extractApiTimestamp(bundle.mapExt),
  ].filter((v): v is number => v != null && Number.isFinite(v));

  const anchor = anchors.length
    ? Math.max(...anchors)
    : parseP5eCapturedAtMs(bundle.capturedAt);

  if (anchor == null || !Number.isFinite(anchor)) return undefined;
  return anchor + P5E_READY_COUNTDOWN_MS;
}
