import type { LogLine } from '@core/log/types';
import { finalizeMatchDetail } from '@core/match/insights';
import type { MatchPlayer, MatchRecord, MatchTeam, PerfectPlayerLoadState } from '@core/match/models';
import type { PerfectMatchEvent, PerfectPlayerStats } from './types';
import { createMatchRecord } from './match-parser';
import { findPerfectHotMap } from './map-pool';
import { createPerfectReadyDeadline, PERFECT_READY_WINDOW_MS } from './ready-deadline';

export const PERFECT_EXPECTED_PLAYERS = 10;
export const PERFECT_UNASSIGNED_EXPIRES_MS = 2 * 60 * 1000;

export interface PerfectSessionUpdate {
  record: MatchRecord | null;
  newPlayerIds: string[];
  newSession: boolean;
  assignedNow: boolean;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function initialLoadState(): PerfectPlayerLoadState {
  return {
    stats: 'idle',
    internalComments: 'idle',
    boardIdentity: 'idle',
    platformComments: 'idle',
  };
}

export function createReadyPlayer(steamId: string): MatchPlayer {
  return {
    steamId,
    nickname: `Steam ...${steamId.slice(-6)}`,
    teamSide: 0,
    isSingle: false,
    radar: {},
    recentResults: [],
    recentRatings: [],
    tags: [],
    perfectLoadState: initialLoadState(),
  };
}

function playersFromGameInfo(gameInfo: Record<string, unknown>): Record<string, unknown>[] {
  const raw = gameInfo.players ?? gameInfo.player_list ?? gameInfo.players_list;
  return Array.isArray(raw)
    ? raw.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
    : [];
}

function mapFromGameInfo(gameInfo: Record<string, unknown>): string | undefined {
  return stringValue(gameInfo.map_name ?? gameInfo.mapName ?? gameInfo.map ?? gameInfo.map_id);
}

function sessionRecord(id: string, logLine: LogLine, now: number): MatchRecord {
  return {
    id,
    platformId: 'perfect',
    time: logLine.time,
    level: logLine.level,
    category: logLine.category,
    data: {},
    summary: { playerCount: 0, platformGameId: id.startsWith('perfect-') ? undefined : id },
    detail: {
      platformId: 'perfect',
      platformGameId: id.startsWith('perfect-') ? undefined : id,
      teams: [],
      unassigned: [],
      hasExtraInfo: false,
      parseWarnings: [],
      perfectSessionPhase: 'accepting',
      readyCount: 0,
      expectedPlayerCount: PERFECT_EXPECTED_PLAYERS,
      statsLoadedCount: 0,
      statsSettledCount: 0,
      statsSettled: false,
      source: 'ladder-events',
      readyDeadlineAt: createPerfectReadyDeadline(now),
      readyLeftTimeMs: PERFECT_READY_WINDOW_MS,
    },
  };
}

function allPlayers(record: MatchRecord): MatchPlayer[] {
  return [...record.detail.teams.flatMap((team) => team.players), ...record.detail.unassigned];
}

/**
 * The session mutates its working record in place. Publish detached collection
 * references so shallow Vue consumers observe every progressive update.
 */
export function snapshotPerfectMatchRecord(record: MatchRecord): MatchRecord {
  return {
    ...record,
    data: { ...record.data },
    summary: { ...record.summary },
    detail: {
      ...record.detail,
      parseWarnings: [...record.detail.parseWarnings],
      unassigned: [...record.detail.unassigned],
      teams: record.detail.teams.map((team) => ({
        ...team,
        players: [...team.players],
        partyGroups: [...team.partyGroups],
        teamRadar: team.teamRadar ? { ...team.teamRadar } : undefined,
      })),
    },
  };
}

function refreshProgress(record: MatchRecord) {
  const players = allPlayers(record);
  const loaded = players.filter((player) => player.perfectLoadState?.stats === 'loaded').length;
  const settled = players.filter((player) => {
    const state = player.perfectLoadState?.stats;
    return state === 'loaded' || state === 'error';
  }).length;
  record.summary.playerCount = players.length;
  record.summary.mapName = record.detail.mapName;
  record.detail.readyCount = players.length;
  record.detail.statsLoadedCount = loaded;
  record.detail.statsSettledCount = settled;
  record.detail.statsSettled = players.length >= PERFECT_EXPECTED_PLAYERS && settled >= players.length;
}

function replacePlayer(record: MatchRecord, steamId: string, update: (player: MatchPlayer) => MatchPlayer) {
  const withCurrentMap = (player: MatchPlayer) => {
    const next = update(player);
    const map = findPerfectHotMap(next, record.detail.mapName);
    return map ? {
      ...next,
      mapTotalNum: map.totalMatch,
      mapWinNum: map.winCount,
      mapWinRate: map.totalMatch > 0 ? map.winCount / map.totalMatch : undefined,
      mapSampleLow: map.totalMatch < 3,
    } : { ...next, mapSampleLow: Boolean(record.detail.mapName) };
  };
  record.detail.unassigned = record.detail.unassigned.map((player) => player.steamId === steamId ? withCurrentMap(player) : player);
  record.detail.teams = record.detail.teams.map((team) => ({
    ...team,
    players: team.players.map((player) => player.steamId === steamId ? withCurrentMap(player) : player),
  }));
  refreshProgress(record);
  finalizeMatchDetail(record.detail);
}

export function mergePerfectStats(player: MatchPlayer, stats: PerfectPlayerStats): MatchPlayer {
  return {
    ...player,
    nickname: stats.name ?? player.nickname,
    avatar: stats.avatar ?? player.avatar,
    score: player.score ?? stats.pvpScore,
    seasonTotalNum: stats.seasonMatches,
    kd: stats.kd,
    seasonWinRate: stats.winRate,
    standardRating: stats.standardRating,
    recentStandardRating: stats.recentStandardRating,
    commonRating: stats.commonRating,
    seasonRating: stats.pwRating,
    rating: stats.recentPwRating,
    recentRatings: stats.recentPwRatings,
    rws: stats.rws,
    recentRws: stats.recentRws,
    adpr: stats.adr,
    hsRate: stats.headShotRatio,
    entryKillRatio: stats.entryKillRatio,
    clutchWinRate: stats.vs1WinRate,
    weAvg: stats.recentWe,
    seasonWe: stats.avgWe,
    eloTrend: stats.eloTrend,
    kills: stats.kills,
    deaths: stats.deaths,
    assists: stats.assists,
    mvpCount: stats.mvpCount,
    clutchWins: stats.clutchWins,
    clutch1v1: stats.clutch1v1,
    clutch1v2: stats.clutch1v2,
    clutch1v3: stats.clutch1v3,
    clutch1v4: stats.clutch1v4,
    clutch1v5: stats.clutch1v5,
    multiKill2: stats.multiKill2,
    multiKill3: stats.multiKill3,
    multiKill4: stats.multiKill4,
    multiKill5: stats.multiKill5,
    hotMaps: stats.hotMaps,
    abilityProfile: stats.abilityProfile,
    primaryWeapons: stats.primaryWeapons,
    perfectLoadState: { ...player.perfectLoadState!, stats: 'loaded', statsError: undefined },
  };
}

export class PerfectMatchSession {
  private record: MatchRecord | null = null;
  private pendingMatchId: string | undefined;
  private lastEventAt = 0;
  private sequence = 0;

  get current(): MatchRecord | null {
    return this.record;
  }

  get token(): number {
    return this.sequence;
  }

  isExpired(now = Date.now()): boolean {
    return Boolean(
      this.record
      && this.record.detail.perfectSessionPhase !== 'assigned'
      && this.lastEventAt > 0
      && now - this.lastEventAt > PERFECT_UNASSIGNED_EXPIRES_MS,
    );
  }

  clearIfExpired(now = Date.now()): boolean {
    if (!this.isExpired(now)) return false;
    this.record = null;
    this.sequence += 1;
    return true;
  }

  apply(event: PerfectMatchEvent, logLine: LogLine, now = Date.now()): PerfectSessionUpdate {
    const result: PerfectSessionUpdate = { record: this.record, newPlayerIds: [], newSession: false, assignedNow: false };
    if (event.kind === 'match-id') {
      this.pendingMatchId = event.matchId;
      if (this.record && this.record.detail.perfectSessionPhase !== 'assigned') {
        this.record.id = event.matchId;
        this.record.detail.platformGameId = event.matchId;
        this.record.summary.platformGameId = event.matchId;
      }
      result.record = this.record;
      return result;
    }

    if (event.kind === 'legacy-create-game') {
      this.sequence += 1;
      const id = stringValue(event.data.platform_game_id ?? event.data.platformGameId) ?? `perfect-${now}`;
      this.record = createMatchRecord(id, logLine, event.data);
      this.record.detail.source = 'legacy-create-game';
      this.record.detail.perfectSessionPhase = this.record.detail.teams.length >= 2 ? 'assigned' : 'accepting';
      this.lastEventAt = now;
      return { record: this.record, newPlayerIds: [], newSession: true, assignedNow: this.record.detail.teams.length >= 2 };
    }

    if (event.kind === 'match-success') {
      this.sequence += 1;
      this.record = sessionRecord(event.matchId ?? this.pendingMatchId ?? `perfect-${now}`, logLine, now);
      this.lastEventAt = now;
      return { record: this.record, newPlayerIds: [], newSession: true, assignedNow: false };
    }

    if (!this.record || this.isExpired(now)) {
      this.sequence += 1;
      this.record = sessionRecord(event.matchId ?? this.pendingMatchId ?? `perfect-${now}`, logLine, now);
      result.newSession = true;
    }
    this.lastEventAt = now;

    if (event.kind === 'ready') {
      if (!allPlayers(this.record).some((player) => player.steamId === event.steamId)) {
        this.record.detail.unassigned.push(createReadyPlayer(event.steamId));
        result.newPlayerIds.push(event.steamId);
      }
      refreshProgress(this.record);
      this.record.detail.perfectSessionPhase = allPlayers(this.record).length >= PERFECT_EXPECTED_PLAYERS
        ? 'all-ready'
        : 'accepting';
      if (this.record.detail.perfectSessionPhase === 'all-ready') {
        this.record.detail.readyDeadlineAt = undefined;
        this.record.detail.readyLeftTimeMs = 0;
      } else {
        this.record.detail.readyLeftTimeMs = Math.max(0, (this.record.detail.readyDeadlineAt ?? now) - now);
      }
    }

    if (event.kind === 'game-start') {
      const known = new Map(allPlayers(this.record).map((player) => [player.steamId, player]));
      for (const raw of playersFromGameInfo(event.gameInfo)) {
        const steamId = stringValue(raw.player_id ?? raw.steam_id ?? raw.uid);
        if (!steamId) continue;
        const previous = known.get(steamId) ?? createReadyPlayer(steamId);
        if (!known.has(steamId)) result.newPlayerIds.push(steamId);
        known.set(steamId, {
          ...previous,
          score: numberValue(raw.score) ?? previous.score,
          slotType: numberValue(raw.slot_type),
          teamSide: numberValue(raw.roll_team_id) ?? previous.teamSide,
          isSingle: numberValue(raw.is_single) === 1,
          troopTeamId: numberValue(raw.troop_team_id),
          isGreen: numberValue(raw.is_green) === 1,
        });
      }
      const bySide = new Map<number, MatchPlayer[]>();
      const unassigned: MatchPlayer[] = [];
      for (const player of known.values()) {
        if (player.teamSide > 0) {
          bySide.set(player.teamSide, [...(bySide.get(player.teamSide) ?? []), player]);
        } else {
          unassigned.push(player);
        }
      }
      this.record.detail.teams = [...bySide.entries()].sort(([a], [b]) => a - b).slice(0, 2).map(([id, players], index): MatchTeam => ({
        id,
        side: index === 0 ? 'A' : 'B',
        players,
        singleCount: 0,
        partyGroups: [],
      }));
      this.record.detail.unassigned = unassigned;
      this.record.detail.mapName = mapFromGameInfo(event.gameInfo) ?? this.record.detail.mapName;
      this.record.detail.perfectSessionPhase = this.record.detail.teams.length >= 2 ? 'assigned' : 'all-ready';
      this.record.detail.readyDeadlineAt = undefined;
      this.record.detail.readyLeftTimeMs = 0;
      this.record.data = { game_info: event.gameInfo };
      for (const steamId of known.keys()) this.patchPlayer(steamId, {});
      refreshProgress(this.record);
      finalizeMatchDetail(this.record.detail);
      result.assignedNow = this.record.detail.perfectSessionPhase === 'assigned';
    }

    result.record = this.record;
    return result;
  }

  setStatsLoading(steamId: string) {
    if (!this.record) return;
    replacePlayer(this.record, steamId, (player) => ({
      ...player,
      perfectLoadState: { ...player.perfectLoadState!, stats: 'loading', statsError: undefined },
    }));
  }

  setStats(steamId: string, stats: PerfectPlayerStats) {
    if (!this.record) return;
    replacePlayer(this.record, steamId, (player) => mergePerfectStats(player, stats));
  }

  setStatsError(steamId: string, message: string) {
    if (!this.record) return;
    replacePlayer(this.record, steamId, (player) => ({
      ...player,
      perfectLoadState: { ...player.perfectLoadState!, stats: 'error', statsError: message },
    }));
  }

  patchPlayer(steamId: string, patch: Partial<MatchPlayer>) {
    if (!this.record) return;
    replacePlayer(this.record, steamId, (player) => ({ ...player, ...patch }));
  }
}
