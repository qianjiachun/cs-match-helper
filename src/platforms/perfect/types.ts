import type {
  PerfectAbilityProfile,
  PerfectHotMap,
  PerfectWeaponSummary,
} from '@core/match/models';

export interface PerfectPlayerStats {
  steamId: string;
  seasonId?: string;
  name?: string;
  avatar?: string;
  pvpScore?: number;
  seasonMatches?: number;
  kd?: number;
  winRate?: number;
  standardRating?: number;
  recentStandardRating?: number;
  recentStandardRatings: number[];
  commonRating?: number;
  pwRating?: number;
  recentPwRating?: number;
  recentPwRatings: number[];
  ratingTrend?: 'up' | 'down' | 'flat';
  rws?: number;
  recentRws?: number;
  recentRwsValues: number[];
  adr?: number;
  headShotRatio?: number;
  entryKillRatio?: number;
  vs1WinRate?: number;
  avgWe?: number;
  recentWe?: number;
  recentWeValues: number[];
  recentScores: number[];
  eloTrend?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  mvpCount?: number;
  clutchWins?: number;
  clutch1v1?: number;
  clutch1v2?: number;
  clutch1v3?: number;
  clutch1v4?: number;
  clutch1v5?: number;
  multiKill2?: number;
  multiKill3?: number;
  multiKill4?: number;
  multiKill5?: number;
  hotMaps: PerfectHotMap[];
  abilityProfile?: PerfectAbilityProfile;
  primaryWeapons: PerfectWeaponSummary[];
}

export interface PerfectBoardUser {
  steamId: string;
  wanmeiId: string;
  name?: string;
  avatar?: string;
}

export type PerfectMatchEvent =
  | { kind: 'match-id'; matchId: string }
  | { kind: 'match-success'; matchId?: string }
  | { kind: 'ready'; steamId: string; matchId?: string }
  | { kind: 'game-start'; matchId?: string; gameInfo: Record<string, unknown> }
  | { kind: 'legacy-create-game'; data: Record<string, unknown> };
