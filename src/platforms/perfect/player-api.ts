/**
 * 完美对战平台玩家数据补强服务（预留）
 *
 * 首版默认关闭，仅消费日志中的 playerlist_extrainfo。
 * 后续若确认 HTTP token / IPC 调用方式，可在此实现批量补强。
 */

export interface PlayerEnrichmentRequest {
  steamIds: string[];
  mapName?: string;
}

export interface PlayerEnrichmentResult {
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
}

/** 是否启用远程补强（默认关闭） */
export const ENRICHMENT_ENABLED = false;

/**
 * 批量获取玩家扩展数据
 * 对标反编译源码中的 GET_QUERY_MATCH_PLAYER_REQ({ uid_list })
 */
export async function fetchPlayerEnrichment(
  _req: PlayerEnrichmentRequest,
): Promise<PlayerEnrichmentResult> {
  if (!ENRICHMENT_ENABLED) {
    return { success: false, data: {}, error: 'enrichment disabled' };
  }

  return { success: false, data: {}, error: 'not implemented' };
}

/**
 * 获取玩家近期战绩（预留）
 */
export async function fetchRecentMatches(
  _steamId: string,
): Promise<PlayerEnrichmentResult> {
  if (!ENRICHMENT_ENABLED) {
    return { success: false, data: {}, error: 'enrichment disabled' };
  }

  return { success: false, data: {}, error: 'not implemented' };
}
