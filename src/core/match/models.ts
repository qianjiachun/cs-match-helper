export interface RadarDimension {
  score: number;
  level?: string;
}

export type PlayerLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface PerfectPlayerLoadState {
  stats: PlayerLoadStatus;
  internalComments: PlayerLoadStatus;
  boardIdentity: PlayerLoadStatus;
  platformComments: PlayerLoadStatus;
  statsError?: string;
  boardIdentityError?: string;
  internalCommentsError?: string;
  platformCommentsError?: string;
}

export interface PerfectHotMap {
  map: string;
  mapName?: string;
  mapImage?: string;
  mapLogo?: string;
  totalMatch: number;
  winCount: number;
  totalKill?: number;
  /** New season-stats map ADR is already an average. */
  adr?: number;
  /** New season-stats map PW Rating is already an average. */
  rating?: number;
  /** New season-stats map RWS is already an average. */
  rws?: number;
  /** Legacy aggregate fields retained for older history records. */
  totalAdr?: number;
  ratingSum?: number;
  rwsSum?: number;
  deathNum?: number;
  firstKillNum?: number;
  firstDeathNum?: number;
  headshotKillNum?: number;
  matchMvpNum?: number;
  threeKillNum?: number;
  fourKillNum?: number;
  fiveKillNum?: number;
  twoKillNum?: number;
  roundCount?: number;
  winRoundCount?: number;
  ctRoundCount?: number;
  ctWinRoundCount?: number;
  tRoundCount?: number;
  tWinRoundCount?: number;
  sniperKillNum?: number;
  teamKillNum?: number;
  firePower?: number;
  priAvg?: number;
  pistolWeSum?: number;
  clutch1v1?: number;
  clutch1v2?: number;
  clutch1v3?: number;
  clutch1v4?: number;
  clutch1v5?: number;
}

export interface PerfectSideSplit {
  rating?: number;
}

export interface PerfectOpeningSummary {
  firstKillRate?: number;
  openingDuelRate?: number;
  firstHurtPerMatch?: number;
  winAfterOpeningKill?: number;
}

export interface PerfectUtilitySummary {
  flashAssistPerRound?: number;
  flashRate?: number;
  enemyFlashTimePerRound?: number;
  utilDmgPerRound?: number;
  itemRate?: number;
}

export interface PerfectAimSummary {
  avgTimeToKillMs?: number;
  sprayHitRate?: number;
  killsPerRound?: number;
  killsPerWinRound?: number;
  dmgPerRound?: number;
  dmgPerWinRound?: number;
  roundsWithAKill?: number;
  pistolRating?: number;
}

export interface PerfectSniperSummary {
  killShare?: number;
  firstKills?: number;
  killsPerSniperRound?: number;
  multiKillRoundRate?: number;
  holdRounds?: number;
  reactionMs?: number;
}

export interface PerfectClutchAttempt {
  wins?: number;
  attempts?: number;
  rate?: number;
}

export interface PerfectClutchSummary {
  allRate?: number;
  v1?: PerfectClutchAttempt;
  v2plus?: PerfectClutchAttempt;
  lastAliveRate?: number;
  savesPerLossRound?: number;
  timeAlivePerRound?: number;
}

export interface PerfectFormSummary {
  ratingChange?: number;
  adrChange?: number;
  kdChange?: number;
  winRateChange?: number;
  rwsChange?: number;
}

export interface PerfectSeasonCombat {
  kast?: number;
  tradeFragRate?: number;
  clutch1v1Rate?: number;
  clutch1v1Attempts?: number;
  matchMvpCount?: number;
  roundMvpCount?: number;
  seasonWinNum?: number;
  seasonDrawNum?: number;
  sides?: { ct?: PerfectSideSplit; t?: PerfectSideSplit };
  opening?: PerfectOpeningSummary;
  utility?: PerfectUtilitySummary;
  aim?: PerfectAimSummary;
  sniper?: PerfectSniperSummary;
  clutch?: PerfectClutchSummary;
  form?: PerfectFormSummary;
}

export interface PerfectAbilityProfile {
  shot?: number;
  victory?: number;
  breach?: number;
  snipe?: number;
  prop?: number;
  summary?: string;
}

export interface PerfectWeaponSummary {
  name: string;
  nameZh?: string;
  image?: string;
  killNum: number;
  matchNum?: number;
  headshotSum?: number;
  headshotRate?: number;
  damageSum?: number;
  avgDamage?: number;
  avgKillNum?: number;
  firstShotAccuracy?: number;
  avgTimeToKill?: number;
  sprayAccuracy?: number;
  rapidStopSuccessRate?: number;
  levelAvgTimeToKill?: string;
  levelAccuracy?: string;
  levelAvgDamage?: string;
  levelHeadshotRate?: string;
  levelAvgKillNum?: string;
  levelRapidStopSuccessRate?: string;
  avgKillsPerRound?: number;
}

export interface MatchPlayer {
  steamId: string;
  nickname: string;
  avatar?: string;
  score?: number;
  /** Current-season S-rank stars; meaningful once score reaches 2400. */
  currentSStars?: number;
  /** Lifetime peak score and S-rank stars from season-stats top-level fields. */
  peakScore?: number;
  peakSStars?: number;
  peakSeason?: string;
  teamSide: number;
  slotType?: number;
  isSingle: boolean;
  troopTeamId?: number;
  isGreen?: boolean;
  isVip?: boolean;
  adpr?: number;
  /** 近 10 场 Rating 均值（pw_rating_avg）；5E 下为 season.rating_data 近 10 场均 */
  rating?: number;
  /** 赛季 Rating；5E 下为 player/home season_data.rating，完美为 Rating Pro 均值 */
  seasonRating?: number;
  /** Perfect current-season standard Rating (pvpDetailDataStats.rating). */
  standardRating?: number;
  /** Average of the latest ten valid historyRatings values. */
  recentStandardRating?: number;
  /** Perfect cross-mode baseline Rating (pvpDetailDataStats.commonRating). */
  commonRating?: number;
  /** Perfect current-season RWS. */
  rws?: number;
  /** Average of the latest ten valid historyRws values. */
  recentRws?: number;
  /** Perfect entry kill ratio. */
  entryKillRatio?: number;
  kd?: number;
  hsRate?: number;
  firstKillSuccessRate?: number;
  rapidStopSuccessRate?: number;
  reactionTime?: number;
  clutchWinRate?: number;
  clutch1v1Rate?: number;
  clutch1v1Attempts?: number;
  kast?: number;
  tradeFragRate?: number;
  roundMvpCount?: number;
  combat?: PerfectSeasonCombat;
  weRaw?: number;
  /** Recent WE average. Perfect derives it from weList. */
  weAvg?: number;
  /** Perfect current-season WE (radar_new.fire_power.detail.we_raw). */
  seasonWe?: number;
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
  clutch1v1Total?: number;
  clutch1v2Total?: number;
  clutch1v3Total?: number;
  clutch1v4Total?: number;
  clutch1v5Total?: number;
  multiKill2?: number;
  multiKill3?: number;
  multiKill4?: number;
  multiKill5?: number;
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
  hotMaps?: PerfectHotMap[];
  abilityProfile?: PerfectAbilityProfile;
  primaryWeapons?: PerfectWeaponSummary[];
  perfectLoadState?: PerfectPlayerLoadState;
  /** Offline debug replay only; omitted from live records. */
  mockInternalCommentCount?: number;
  /** Offline debug replay only; omitted from live records. */
  mockPlatformCommentCount?: number;
  /** 平台留言板 ID：完美为 zq_id，5E 为 domain */
  platformBoardId?: string;
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
  /** 准备阶段截止 Unix 毫秒；UI 用 max(0, readyDeadlineAt - Date.now()) */
  readyDeadlineAt?: number;
  readyLeftTimeMs?: number;
  isGreen?: boolean;
  isSingle?: boolean;
  isGrudgeMatch?: boolean;
  teams: MatchTeam[];
  unassigned: MatchPlayer[];
  hasExtraInfo: boolean;
  parseWarnings: string[];
  insights?: MatchInsights;
  perfectSessionPhase?: 'accepting' | 'all-ready' | 'assigned';
  readyCount?: number;
  expectedPlayerCount?: number;
  statsLoadedCount?: number;
  statsSettledCount?: number;
  statsSettled?: boolean;
  source?: 'legacy-create-game' | 'ladder-events';
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
