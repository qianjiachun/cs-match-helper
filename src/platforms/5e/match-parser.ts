import type { LogLine } from '@core/log/types';
import { finalizeMatchDetail } from '@core/match/insights';
import type {
  MatchDetail,
  MatchPlayer,
  MatchRecord,
  MatchSummary,
  MatchTeam,
} from '@core/match/models';
import { formatP5eHomeEnrichError } from './home-api';
import { P5eMatchAggregator } from './aggregator';
import { buildP5ePlayer, resolveMatchMap } from './field-mapper';
import { hasMatchDetailTeams, resolveMapDescFromMatchDetail } from './match-detail-parser';
import { computeP5eReadyDeadline, P5E_READY_COUNTDOWN_MS } from './ready-deadline';
import type { P5eApiPayload, P5eMatchBundle } from './types';

const MODE_LABELS: Record<number, string> = {
  9: '优先排位',
  8: '5v5',
  6: '1v1',
};

/** @deprecated 使用 ready-deadline 模块导出 */
export { P5E_READY_COUNTDOWN_MS } from './ready-deadline';

function buildPlayer(uuid: string, index: number, bundle: P5eMatchBundle, matchMap: string | undefined): MatchPlayer {
  return buildP5ePlayer(uuid, index, bundle, matchMap);
}

function groupByIndexSplit(players: MatchPlayer[]): { teams: MatchTeam[]; unassigned: MatchPlayer[] } {
  const withSides = players.map((p, index) => ({
    ...p,
    teamSide: index < 5 ? 1 : 2,
  }));
  return {
    teams: [
      { side: 'A', id: 1, players: withSides.filter((p) => p.teamSide === 1), singleCount: 0, partyGroups: [] },
      { side: 'B', id: 2, players: withSides.filter((p) => p.teamSide === 2), singleCount: 0, partyGroups: [] },
    ],
    unassigned: [],
  };
}

function groupP5eTeams(players: MatchPlayer[], bundle: P5eMatchBundle): { teams: MatchTeam[]; unassigned: MatchPlayer[] } {
  const team1 = players.filter((p) => p.teamSide === 1);
  const team2 = players.filter((p) => p.teamSide === 2);
  const unassigned = players.filter((p) => p.teamSide !== 1 && p.teamSide !== 2);

  if (team1.length === 5 && team2.length === 5 && unassigned.length === 0) {
    return {
      teams: [
        { side: 'A', id: 1, players: team1, singleCount: 0, partyGroups: [] },
        { side: 'B', id: 2, players: team2, singleCount: 0, partyGroups: [] },
      ],
      unassigned: [],
    };
  }

  if (!hasMatchDetailTeams(bundle)) {
    return groupByIndexSplit(players);
  }

  if (unassigned.length > 0 || team1.length !== 5 || team2.length !== 5) {
    return groupByIndexSplit(players);
  }

  return {
    teams: [
      { side: 'A', id: 1, players: team1, singleCount: 0, partyGroups: [] },
      { side: 'B', id: 2, players: team2, singleCount: 0, partyGroups: [] },
    ],
    unassigned: [],
  };
}

export function buildP5eMatchDetail(bundle: P5eMatchBundle): MatchDetail {
  const warnings: string[] = [];
  if (!bundle.userInfo) warnings.push('缺少 user/info 数据');
  if (!bundle.eloInfo) warnings.push('缺少 elo/info 数据');
  if (!bundle.mapExt) warnings.push('缺少 map-ext 数据');
  if (bundle.incomplete) {
    warnings.push('CDP 采集不完整（部分接口未捕获），数据可能缺失');
  }

  const matchMap = resolveMatchMap(bundle);
  const players = bundle.uuids.map((uuid, i) => buildPlayer(uuid, i, bundle, matchMap));
  const { teams, unassigned } = groupP5eTeams(players, bundle);

  if (!bundle.wsAnchor && !hasMatchDetailTeams(bundle)) {
    warnings.push('未获取 match 详情分队，已按 UUID 顺序临时分队');
  }
  if (bundle.mapConflictWarning) {
    warnings.push(bundle.mapConflictWarning);
  }

  const homeCount = Object.keys(bundle.playerHome ?? {}).length;
  if (homeCount < bundle.uuids.length) {
    const hint = bundle.homeEnrichError
      ? formatP5eHomeEnrichError(bundle.homeEnrichError)
      : 'player/home 拉取不完整';
    warnings.push(
      `缺少 player/home 数据（${homeCount}/${bundle.uuids.length}），Rating 可能不准确：${hint}`,
    );
  }

  const readyDeadlineAt = computeP5eReadyDeadline(bundle);

  const detail: MatchDetail = {
    platformId: '5e',
    platformGameId: bundle.platformGameId,
    mapName: matchMap,
    readyDeadlineAt,
    readyLeftTimeMs: readyDeadlineAt != null
      ? Math.max(0, readyDeadlineAt - Date.now())
      : P5E_READY_COUNTDOWN_MS,
    teams,
    unassigned,
    hasExtraInfo: Boolean(bundle.eloInfo && bundle.mapExt),
    parseWarnings: warnings,
  };

  return finalizeMatchDetail(detail);
}

export function summarizeP5eMatch(bundle: P5eMatchBundle): MatchSummary {
  const modeId = bundle.matchMode?.[0];
  const mapDesc = resolveMapDescFromMatchDetail(bundle);
  return {
    playerCount: bundle.uuids.length,
    mapName: resolveMatchMap(bundle),
    serverName: mapDesc,
    mode: modeId != null ? MODE_LABELS[modeId] ?? `模式 ${modeId}` : '5e',
    platformGameId: bundle.platformGameId,
  };
}

export function createP5eMatchRecord(
  bundle: P5eMatchBundle,
  logLine?: LogLine,
): MatchRecord {
  const line: LogLine = logLine ?? {
    time: new Date(bundle.capturedAt).toLocaleString('zh-CN'),
    level: 'INFO',
    category: '5e-cdp',
    decoded: bundle.platformGameId,
    raw: '',
  };

  return {
    id: bundle.platformGameId,
    platformId: '5e',
    time: line.time,
    level: line.level,
    category: line.category,
    data: { p5eBundle: bundle },
    summary: summarizeP5eMatch(bundle),
    detail: buildP5eMatchDetail(bundle),
  };
}

export function parseP5eMatchInput(
  text: string,
): { bundle: P5eMatchBundle } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '内容为空' };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object') return { error: 'JSON 需为对象' };
    const obj = parsed as Record<string, unknown>;
    if (obj.events && typeof obj.events === 'object') {
      const aggregator = new P5eMatchAggregator();
      const bundle = aggregator.ingestFixtureEvents(obj.events as Record<string, P5eApiPayload>);
      if (!bundle) return { error: 'fixture 数据不完整' };
      if (typeof obj.mapName === 'string') bundle.mapName = obj.mapName;
      if (typeof obj.matchCode === 'string') bundle.matchCode = obj.matchCode;
      return { bundle };
    }
    if (obj.uuids && Array.isArray(obj.uuids)) {
      return { bundle: parsed as P5eMatchBundle };
    }
    if (obj.p5eBundle) {
      return { bundle: obj.p5eBundle as P5eMatchBundle };
    }
    return { error: '无法识别的 5e 数据格式' };
  } catch {
    return { error: 'JSON 解析失败' };
  }
}
