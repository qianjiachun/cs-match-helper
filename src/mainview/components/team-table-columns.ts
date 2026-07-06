/** 队伍数据表列定义（与 docs/response.md 字段对应） */

export type TeamTableColumnKey =
  | 'nickname'
  | 'score'
  | 'recentWins'
  | 'adpr'
  | 'rating'
  | 'seasonRating'
  | 'kd'
  | 'hsRate'
  | 'firstKillSuccessRate'
  | 'rapidStopSuccessRate'
  | 'reactionTime'
  | 'weRaw'
  | 'weAvg'
  | 'recentWinRate'
  | 'recentDrawCount'
  | 'latest10WinNum'
  | 'latest10TotalNum'
  | 'seasonWinRate'
  | 'seasonWinNum'
  | 'seasonTotalNum'
  | 'mapWinRate'
  | 'mapWinNum'
  | 'mapTotalNum'
  | 'continuedWins'
  | 'eloChange'
  | 'clutchWinRate'
  | 'perfectPower'
  | 'rankDesc'
  | 'rankLevel'
  | 'rankNum'
  | 'isVip'
  | 'radar_fire_power'
  | 'radar_marksmanship'
  | 'radar_follow_up_shot'
  | 'radar_first'
  | 'radar_item'
  | 'radar_1vn'
  | 'radar_sniper';

export type TeamTableColumnCategory =
  | 'basic'
  | 'recent'
  | 'season'
  | 'combat'
  | 'radar'
  | 'other';

export interface TeamTableColumnDef {
  key: TeamTableColumnKey;
  label: string;
  description?: string;
  category: TeamTableColumnCategory;
  align: 'left' | 'center';
  width: string;
  fixed?: boolean;
  defaultVisible: boolean;
  sortable: boolean;
}

export const TEAM_TABLE_COLUMN_CATEGORIES: Record<TeamTableColumnCategory, string> = {
  basic: '基础',
  recent: '近期',
  season: '赛季',
  combat: '战斗',
  radar: '雷达',
  other: '其他',
};

export const PERFECT_TEAM_TABLE_COLUMN_DEFS: TeamTableColumnDef[] = [
  {
    key: 'nickname',
    label: '玩家',
    category: 'basic',
    align: 'left',
    width: 'auto',
    fixed: true,
    defaultVisible: true,
    sortable: true,
  },
  { key: 'score', label: 'ELO', category: 'basic', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  {
    key: 'seasonRating',
    label: 'Rating',
    description: '赛季 Rating Pro 均值',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: true,
    sortable: true,
  },
  {
    key: 'rating',
    label: '近期Rating',
    description: '近 10 场 Rating 均值',
    category: 'recent',
    align: 'center',
    width: '8%',
    defaultVisible: true,
    sortable: true,
  },
  { key: 'adpr', label: 'ADR', category: 'combat', align: 'center', width: '6%', defaultVisible: true, sortable: true },
  { key: 'kd', label: 'K/D', category: 'combat', align: 'center', width: '6%', defaultVisible: true, sortable: true },
  { key: 'hsRate', label: '爆头率', category: 'combat', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  {
    key: 'rapidStopSuccessRate',
    label: '急停成功率',
    category: 'combat',
    align: 'center',
    width: '8%',
    defaultVisible: true,
    sortable: true,
  },
  {
    key: 'reactionTime',
    label: '反应时间',
    category: 'combat',
    align: 'center',
    width: '7%',
    defaultVisible: true,
    sortable: true,
  },
  {
    key: 'recentWins',
    label: '近期胜负',
    description: '近 5 场 W/L/D',
    category: 'recent',
    align: 'center',
    width: '11%',
    defaultVisible: true,
    sortable: true,
  },
  { key: 'weRaw', label: 'WE', category: 'combat', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  {
    key: 'firstKillSuccessRate',
    label: '首杀成功率',
    category: 'combat',
    align: 'center',
    width: '8%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'weAvg',
    label: '近期WE',
    description: '近 10 场 WE 均值',
    category: 'recent',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'recentWinRate',
    label: '近期胜率',
    category: 'recent',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'recentDrawCount',
    label: '近期平局',
    category: 'recent',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'latest10WinNum',
    label: '近10胜场',
    category: 'recent',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'latest10TotalNum',
    label: '近10场次',
    category: 'recent',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'seasonWinRate',
    label: '赛季胜率',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'seasonWinNum',
    label: '赛季胜场',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'seasonTotalNum',
    label: '赛季场次',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'mapWinRate',
    label: '地图胜率',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'mapWinNum',
    label: '地图胜场',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'mapTotalNum',
    label: '地图场次',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'continuedWins',
    label: '连胜',
    category: 'season',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'clutchWinRate',
    label: '残局胜率',
    category: 'combat',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'perfectPower',
    label: '完美战力',
    category: 'other',
    align: 'center',
    width: '8%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'rankDesc',
    label: '地区排名',
    category: 'other',
    align: 'center',
    width: '10%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'isVip',
    label: 'VIP',
    category: 'other',
    align: 'center',
    width: '5%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'radar_fire_power',
    label: '火力',
    category: 'radar',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'radar_marksmanship',
    label: '枪法',
    category: 'radar',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'radar_follow_up_shot',
    label: '补枪',
    category: 'radar',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'radar_first',
    label: '突破',
    category: 'radar',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'radar_item',
    label: '道具',
    category: 'radar',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'radar_1vn',
    label: '残局',
    category: 'radar',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'radar_sniper',
    label: '狙击',
    category: 'radar',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
];

/** 5E 专属默认列（不含完美雷达/急停/反应时间等） */
export const P5E_TEAM_TABLE_COLUMN_DEFS: TeamTableColumnDef[] = [
  {
    key: 'nickname',
    label: '玩家',
    category: 'basic',
    align: 'left',
    width: 'auto',
    fixed: true,
    defaultVisible: true,
    sortable: true,
  },
  { key: 'score', label: 'ELO', category: 'basic', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  {
    key: 'seasonRating',
    label: 'Rating',
    description: '优先排位赛季 Rating（player/home season_data）',
    category: 'combat',
    align: 'center',
    width: '7%',
    defaultVisible: true,
    sortable: true,
  },
  {
    key: 'rating',
    label: '近期Rating',
    description: '赛季场均 Rating（player/home season_data.avg_rating）',
    category: 'recent',
    align: 'center',
    width: '8%',
    defaultVisible: true,
    sortable: true,
  },
  { key: 'adpr', label: 'ADR', category: 'combat', align: 'center', width: '6%', defaultVisible: true, sortable: true },
  { key: 'weRaw', label: 'RWS', category: 'combat', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  { key: 'kd', label: 'K/D', category: 'combat', align: 'center', width: '6%', defaultVisible: true, sortable: true },
  { key: 'hsRate', label: '爆头率', category: 'combat', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  {
    key: 'recentWins',
    label: '近期胜负',
    description: '近 5 场 W/L/D',
    category: 'recent',
    align: 'center',
    width: '11%',
    defaultVisible: true,
    sortable: true,
  },
  {
    key: 'mapWinRate',
    label: '地图胜率',
    description: '当前地图胜率（map-ext）',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'rankLevel',
    label: '段位',
    description: 'level_info.level_name 或赛季 Lv',
    category: 'other',
    align: 'center',
    width: '9%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'rankNum',
    label: '排名',
    description: 'sts.rank / elo.rank',
    category: 'other',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'firstKillSuccessRate',
    label: '首杀成功率',
    category: 'combat',
    align: 'center',
    width: '8%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'mapTotalNum',
    label: '地图场次',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'recentWinRate',
    label: '近期胜率',
    category: 'recent',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'seasonTotalNum',
    label: '赛季场次',
    description: '优先排位本赛季场次（contrast_data.match_total）',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'seasonWinRate',
    label: '赛季胜率',
    description: '优先排位本赛季胜率（contrast_data.per_win_match）',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'eloChange',
    label: 'ELO变化',
    description: '本场 ELO 变化（sts.change_elo）',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'mapWinNum',
    label: '地图胜场',
    category: 'season',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'latest10WinNum',
    label: '近10胜场',
    category: 'recent',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'latest10TotalNum',
    label: '近10场次',
    category: 'recent',
    align: 'center',
    width: '7%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'continuedWins',
    label: '连胜',
    category: 'season',
    align: 'center',
    width: '6%',
    defaultVisible: false,
    sortable: true,
  },
  {
    key: 'isVip',
    label: 'VIP',
    category: 'other',
    align: 'center',
    width: '5%',
    defaultVisible: false,
    sortable: true,
  },
];

/** @deprecated 使用 getTeamTableColumnDefs(platformId) */
export const TEAM_TABLE_COLUMN_DEFS = PERFECT_TEAM_TABLE_COLUMN_DEFS;

export type TeamTablePlatformId = 'perfect' | '5e';

export function getTeamTableColumnDefs(platformId: TeamTablePlatformId = 'perfect'): TeamTableColumnDef[] {
  return platformId === '5e' ? P5E_TEAM_TABLE_COLUMN_DEFS : PERFECT_TEAM_TABLE_COLUMN_DEFS;
}

export function getTeamTableColumnMap(platformId: TeamTablePlatformId = 'perfect'): Map<TeamTableColumnKey, TeamTableColumnDef> {
  return new Map(getTeamTableColumnDefs(platformId).map((def) => [def.key, def]));
}

export const TEAM_TABLE_COLUMN_MAP = getTeamTableColumnMap('perfect');

export function getDefaultColumnOrder(platformId: TeamTablePlatformId = 'perfect'): TeamTableColumnKey[] {
  return getTeamTableColumnDefs(platformId).map((def) => def.key);
}

export function getDefaultVisibleColumnKeys(platformId: TeamTablePlatformId = 'perfect'): TeamTableColumnKey[] {
  return getTeamTableColumnDefs(platformId).filter((def) => def.defaultVisible).map((def) => def.key);
}

export function getStorageKeyForPlatform(platformId: TeamTablePlatformId): string {
  return `cs-match-helper.team-table-columns-v7.${platformId}`;
}

export const RADAR_COLUMN_DIM: Partial<Record<TeamTableColumnKey, string>> = {
  radar_fire_power: 'fire_power',
  radar_marksmanship: 'marksmanship',
  radar_follow_up_shot: 'follow_up_shot',
  radar_first: 'first',
  radar_item: 'item',
  radar_1vn: '1vn',
  radar_sniper: 'sniper',
};
