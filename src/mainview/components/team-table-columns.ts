/** 队伍数据表列定义（与 docs/response.md 字段对应） */
import { currentLocale, i18n } from '../i18n';

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
  | 'standardRating'
  | 'recentStandardRating'
  | 'commonRating'
  | 'rws'
  | 'recentRws'
  | 'entryKillRatio'
  | 'seasonWe'
  | 'eloTrend'
  | 'kad'
  | 'multiKills'
  | 'mvpCount'
  | 'clutchWins'
  | 'abilityProfile'
  | 'primaryWeapon'
  | 'mapPool'
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

const EN_CATEGORY_LABELS: Record<TeamTableColumnCategory, string> = {
  basic: 'Core', recent: 'Recent form', season: 'Season', combat: 'Combat', radar: 'Radar', other: 'Other',
};

const EN_COLUMN_LABELS: Partial<Record<TeamTableColumnKey, string>> = {
  nickname: 'Player', score: 'ELO', recentWins: 'Recent W/L', adpr: 'ADR', rating: 'Recent rating',
  seasonRating: 'Rating', kd: 'K/D', hsRate: 'HS%', firstKillSuccessRate: 'Opening kill %',
  rapidStopSuccessRate: 'Counter-strafe %', reactionTime: 'Reaction time', weRaw: 'WE', weAvg: 'Recent WE',
  recentWinRate: 'Recent win %', recentDrawCount: 'Recent draws', latest10WinNum: 'Last 10 wins',
  latest10TotalNum: 'Last 10 matches', seasonWinRate: 'Season win %', seasonWinNum: 'Season wins',
  seasonTotalNum: 'Season matches', mapWinRate: 'Map win %', mapWinNum: 'Map wins', mapTotalNum: 'Map matches',
  continuedWins: 'Win streak', eloChange: 'ELO change', clutchWinRate: 'Clutch win %', perfectPower: 'Perfect power',
  rankDesc: 'Regional rank', rankLevel: 'Rank', rankNum: 'Leaderboard', isVip: 'VIP', radar_fire_power: 'Firepower',
  radar_marksmanship: 'Aim', radar_follow_up_shot: 'Trade fragging', radar_first: 'Entry fragging',
  radar_item: 'Utility', radar_1vn: 'Clutch', radar_sniper: 'AWP',
  standardRating: 'Standard rating', recentStandardRating: 'Recent standard rating', rws: 'RWS', entryKillRatio: 'Entry rate',
  commonRating: 'Common rating', recentRws: 'Recent RWS', seasonWe: 'Season WE', eloTrend: 'ELO trend',
  kad: 'K/A/D', multiKills: 'Multi-kills', mvpCount: 'MVPs', clutchWins: 'Clutch wins',
  abilityProfile: 'Playstyle', primaryWeapon: 'Favored weapons', mapPool: 'Map familiarity',
};

const PERFECT_CURRENT_TEAM_TABLE_COLUMN_DEFS: TeamTableColumnDef[] = [
  { key: 'nickname', label: '玩家', category: 'basic', align: 'left', width: 'auto', fixed: true, defaultVisible: true, sortable: true },
  { key: 'score', label: 'ELO', category: 'basic', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  { key: 'seasonRating', label: 'Rating', category: 'season', align: 'center', width: '8%', defaultVisible: true, sortable: true },
  { key: 'rating', label: '近期 Rating', category: 'recent', align: 'center', width: '10%', defaultVisible: true, sortable: true },
  { key: 'adpr', label: 'ADR', category: 'combat', align: 'center', width: '6%', defaultVisible: true, sortable: true },
  { key: 'kd', label: 'K/D', category: 'combat', align: 'center', width: '6%', defaultVisible: true, sortable: true },
  { key: 'hsRate', label: '爆头率', category: 'combat', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  { key: 'rws', label: 'RWS', category: 'combat', align: 'center', width: '6%', defaultVisible: true, sortable: true },
  { key: 'mapPool', label: '地图熟练度', description: '熟练度由当前地图场次与赛季占比计算；达到强图标准时合并显示在熟练度标签中', category: 'season', align: 'left', width: '11%', defaultVisible: true, sortable: false },
  { key: 'primaryWeapon', label: '擅长武器', description: '仅显示击杀最多的武器，重点展示平均击杀耗时与爆头率', category: 'other', align: 'left', width: '13%', defaultVisible: true, sortable: false },
  { key: 'weAvg', label: '近期WE', description: 'weList 最新 10 个有效值的平均值', category: 'recent', align: 'center', width: '7%', defaultVisible: true, sortable: true },
  { key: 'standardRating', label: '标准 Rating', category: 'season', align: 'center', width: '8%', defaultVisible: false, sortable: true },
  { key: 'recentStandardRating', label: '近期标准 Rating', description: 'historyRatings 最新 10 个有效值的平均值', category: 'recent', align: 'center', width: '10%', defaultVisible: false, sortable: true },
  { key: 'commonRating', label: '通用 Rating', category: 'season', align: 'center', width: '8%', defaultVisible: false, sortable: true },
  { key: 'seasonTotalNum', label: '赛季场次', category: 'season', align: 'center', width: '7%', defaultVisible: false, sortable: true },
  { key: 'seasonWinRate', label: '赛季胜率', category: 'season', align: 'center', width: '7%', defaultVisible: false, sortable: true },
  { key: 'entryKillRatio', label: '突破率', category: 'combat', align: 'center', width: '7%', defaultVisible: false, sortable: true },
  { key: 'clutchWinRate', label: '1v1 残局', description: 'vs1WinRate：1v1 残局胜率；同时显示由 vs1 胜场推算的样本局数', category: 'combat', align: 'center', width: '8%', defaultVisible: false, sortable: true },
  { key: 'seasonWe', label: '赛季WE', description: '当前赛季 avgWe', category: 'season', align: 'center', width: '7%', defaultVisible: false, sortable: true },
  { key: 'recentRws', label: '近期 RWS', description: 'historyRws 最新 10 个有效值的平均值', category: 'recent', align: 'center', width: '8%', defaultVisible: false, sortable: true },
  { key: 'eloTrend', label: 'ELO趋势', description: '最新有效 ELO 与近 10 条中最早有效 ELO 的差值', category: 'recent', align: 'center', width: '7%', defaultVisible: false, sortable: true },
  { key: 'kad', label: 'K/A/D', category: 'combat', align: 'center', width: '10%', defaultVisible: false, sortable: true },
  { key: 'multiKills', label: '多杀', description: '三杀、四杀和五杀次数；悬停可看二杀', category: 'combat', align: 'center', width: '12%', defaultVisible: false, sortable: true },
  { key: 'mvpCount', label: 'MVP', category: 'combat', align: 'center', width: '6%', defaultVisible: false, sortable: true },
  { key: 'clutchWins', label: '残局获胜', description: '显示残局获胜总数，并区分 1v1 与难度更高的 1v2 以上残局', category: 'combat', align: 'center', width: '10%', defaultVisible: false, sortable: true },
  { key: 'abilityProfile', label: '打法特点', category: 'other', align: 'left', width: '10%', defaultVisible: false, sortable: false },
];

const EN_DESCRIPTION_BY_ZH: Record<string, string> = {
  '赛季 Rating Pro 均值': 'Average season Rating Pro',
  '近 10 场 Rating 均值': 'Average rating over the last 10 matches',
  '近 5 场 W/L/D': 'W/L/D over the last 5 matches',
  '近 10 场 WE 均值': 'Average WE over the last 10 matches',
  'weList 最新 10 个有效值的平均值': 'Average of the latest 10 valid weList values',
  '当前赛季 avgWe': 'Current-season avgWe',
  'historyRws 最新 10 个有效值的平均值': 'Average of the latest 10 valid historyRws values',
  'historyRatings 最新 10 个有效值的平均值': 'Average of the latest 10 valid historyRatings values',
  '最新有效 ELO 与近 10 条中最早有效 ELO 的差值': 'Latest valid ELO minus the oldest of the latest 10 valid values',
  '三杀、四杀和五杀次数；悬停可看二杀': '3K, 4K and 5K counts; hover for 2K',
  '显示残局获胜总数，并区分 1v1 与难度更高的 1v2 以上残局': 'Shows total clutch wins, split into 1v1 and harder 1v2+ situations',
  '熟练度由当前地图场次与赛季占比计算；达到强图标准时合并显示在熟练度标签中': 'Familiarity uses current-map matches and season share; strong performance is merged into the familiarity badge',
  'vs1WinRate：1v1 残局胜率；同时显示由 vs1 胜场推算的样本局数': 'vs1WinRate: 1v1 clutch win rate, with the sample size inferred from vs1 wins',
  '仅显示击杀最多的武器，重点展示平均击杀耗时与爆头率': 'Shows only the top weapon, emphasizing average time to kill and headshot rate',
  '当前地图胜率（map-ext）': 'Win rate on the current map (map-ext)',
  'level_info.level_name 或赛季 Lv': 'level_info.level_name or season level',
  'sts.rank / elo.rank': 'sts.rank / elo.rank',
  '本场 ELO 变化（sts.change_elo）': 'ELO change for this match (sts.change_elo)',
};

export function getTeamTableColumnCategoryLabel(category: TeamTableColumnCategory): string {
  void i18n.global.locale.value;
  return currentLocale() === 'en-US' ? EN_CATEGORY_LABELS[category] : TEAM_TABLE_COLUMN_CATEGORIES[category];
}

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
  void i18n.global.locale.value;
  const definitions = platformId === '5e' ? P5E_TEAM_TABLE_COLUMN_DEFS : PERFECT_CURRENT_TEAM_TABLE_COLUMN_DEFS;
  if (currentLocale() !== 'en-US') return definitions;
  return definitions.map((definition) => ({
    ...definition,
    label: EN_COLUMN_LABELS[definition.key] ?? definition.label,
    description: definition.description ? EN_DESCRIPTION_BY_ZH[definition.description] ?? definition.description : undefined,
  }));
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
  return `cs-match-helper.team-table-columns-v10.${platformId}`;
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
