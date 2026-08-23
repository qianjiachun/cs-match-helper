import type {
  PerfectAbilityProfile,
  PerfectHotMap,
  PerfectSeasonCombat,
  PerfectWeaponSummary,
  RadarDimension,
} from '@core/match/models';

export interface PerfectPlayerStats {
  steamId: string;
  zqId?: string;
  partialFailure?: string;
  seasonId?: string;
  name?: string;
  avatar?: string;
  pvpScore?: number;
  currentSStars?: number;
  allSeasonMaxScore?: number;
  allSeasonMaxStars?: number;
  allSeasonMaxScoreSeason?: string;
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
  firstKillSuccessRate?: number;
  rapidStopSuccessRate?: number;
  reactionTime?: number;
  entryKillRatio?: number;
  vs1WinRate?: number;
  kast?: number;
  tradeFragRate?: number;
  clutch1v1Rate?: number;
  clutch1v1Attempts?: number;
  matchMvpCount?: number;
  roundMvpCount?: number;
  seasonWinNum?: number;
  seasonDrawNum?: number;
  combat?: PerfectSeasonCombat;
  /** Current-season WE from radar_new.fire_power.detail.we_raw; avgWe is a legacy fallback. */
  avgWe?: number;
  recentWe?: number;
  recentWeValues: number[];
  recentScores: number[];
  eloTrend?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  mvpCount?: number;
  clutch1v1Total?: number;
  clutch1v2Total?: number;
  clutch1v3Total?: number;
  clutch1v4Total?: number;
  clutch1v5Total?: number;
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
  radar?: Record<string, RadarDimension>;
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
