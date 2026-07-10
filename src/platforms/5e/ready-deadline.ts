import type { P5eApiPayload, P5eMatchBundle } from './types';

/** 5E 匹配数据就绪后的确认倒计时（与 5E 客户端 30s 确认窗口一致） */
export const P5E_READY_COUNTDOWN_MS = 30_000;

function extractApiTimestamp(payload?: P5eApiPayload): number | undefined {
  const ts = (payload?.responseBody as { timestamp?: unknown } | undefined)?.timestamp;
  return typeof ts === 'number' && ts > 0 ? ts * 1000 : undefined;
}

export function computeP5eReadyDeadline(bundle: P5eMatchBundle): number | undefined {
  const anchors = [
    bundle.wsAnchor?.capturedAt ? Date.parse(bundle.wsAnchor.capturedAt) : undefined,
    extractApiTimestamp(bundle.userInfo),
    extractApiTimestamp(bundle.eloInfo),
    extractApiTimestamp(bundle.mapExt),
  ].filter((v): v is number => v != null && Number.isFinite(v));

  const anchor = anchors.length
    ? Math.max(...anchors)
    : Date.parse(bundle.capturedAt);

  if (!Number.isFinite(anchor)) return undefined;
  return anchor + P5E_READY_COUNTDOWN_MS;
}
