export interface RadarDimension {
  score: number;
  level?: string;
}

export interface MatchPlayer {
  steamId: string;
  nickname: string;
  avatar?: string;
  score?: number;
  teamSide: number;
  slotType?: number;
  isSingle: boolean;
  troopTeamId?: number;
  isGreen?: boolean;
  isVip?: boolean;
  adpr?: number;
  /** 近 10 场 Rating 均值（pw_rating_avg） */
  rating?: number;
  /** 赛季 Rating Pro 均值（season_rating_pro_average）；5E 下为本场 Rating */
  seasonRating?: number;
  kd?: number;
  hsRate?: number;
  firstKillSuccessRate?: number;
  rapidStopSuccessRate?: number;
  reactionTime?: number;
  clutchWinRate?: number;
  weRaw?: number;
  weAvg?: number;
  recentWinRate?: number;
  recentDrawCount?: number;
  seasonWinRate?: number;
  seasonWinNum?: number;
  seasonTotalNum?: number;
  mapWinRate?: number;
  mapWinNum?: number;
  mapTotalNum?: number;
  latest10WinNum?: number;
  latest10TotalNum?: number;
  continuedWins?: number;
  mapSampleLow?: boolean;
  perfectPower?: number;
  rankDesc?: string;
  /** 5E：段位名 / 赛季等级 */
  rankLevel?: string;
  /** 5E：排名（全服） */
  rankNum?: number;
  /** 5E：本场 ELO 变化（sts.change_elo） */
  eloChange?: number;
  radar: Record<string, RadarDimension>;
  recentResults: Array<'win' | 'lose' | 'draw'>;
  recentRatings: number[];
  tags: string[];
}

export type MatchPlatformId = 'perfect' | '5e';

export interface MatchTeam {
  side: 'A' | 'B';
  id: number;
  players: MatchPlayer[];
  avgScore?: number;
  totalScore?: number;
  avgRating?: number;
  avgKd?: number;
  avgWe?: number;
  avgAdpr?: number;
  recentWinRate?: number;
  mapWinRate?: number;
  singleCount: number;
  partyGroups: number[];
  strengthScore?: number;
  teamRadar?: Record<string, number>;
}

export interface MatchInsights {
  strongerSide?: 'A' | 'B';
  scoreDiff: number;
  ratingDiff: number;
  highlights: string[];
  risks: string[];
  topPlayers: MatchPlayer[];
  weakPlayers: MatchPlayer[];
  tendencies: string[];
}

export interface MatchDetail {
  platformId?: MatchPlatformId;
  platformGameId?: string;
  mapName?: string;
  readyLeftTimeMs?: number;
  isGreen?: boolean;
  isSingle?: boolean;
  isGrudgeMatch?: boolean;
  teams: MatchTeam[];
  unassigned: MatchPlayer[];
  hasExtraInfo: boolean;
  parseWarnings: string[];
  insights?: MatchInsights;
}

export interface MatchSummary {
  playerCount: number;
  mapName?: string;
  serverName?: string;
  mode?: string;
  platformGameId?: string;
}

export interface MatchRecord {
  id: string;
  platformId?: MatchPlatformId;
  time?: string;
  level?: string;
  category?: string;
  data: Record<string, unknown>;
  summary: MatchSummary;
  detail: MatchDetail;
}
