import type { MatchPlayer } from '@core/match/models';
import {
  RADAR_COLUMN_DIM,
  type TeamTableColumnKey,
} from './team-table-columns';

export type { TeamTableColumnKey } from './team-table-columns';
export type TeamTableSortKey = TeamTableColumnKey;

export type SortDir = 'asc' | 'desc';

/** 近 5 场胜负：从 recent_10_stats.win_stats 取最后 5 条，左→右，最右为最近一场 */
export function getRecentFiveResults(
  results: Array<'win' | 'lose' | 'draw'> = [],
): Array<'win' | 'lose' | 'draw'> {
  return results.slice(-5);
}

export function getRecentWinCount(player: MatchPlayer): number {
  return getRecentFiveResults(player.recentResults).filter((r) => r === 'win').length;
}

function getRadarScore(player: MatchPlayer, key: TeamTableColumnKey): number | undefined {
  const dim = RADAR_COLUMN_DIM[key];
  if (!dim) return undefined;
  return player.radar[dim]?.score;
}

function getSortValue(player: MatchPlayer, key: TeamTableColumnKey): string | number {
  switch (key) {
    case 'nickname':
      return player.nickname;
    case 'score':
      return player.score ?? -Infinity;
    case 'recentWins':
      return getRecentWinCount(player);
    case 'adpr':
      return player.adpr ?? -Infinity;
    case 'rating':
      return player.rating ?? -Infinity;
    case 'seasonRating':
      return player.seasonRating ?? -Infinity;
    case 'kd':
      return player.kd ?? -Infinity;
    case 'hsRate':
      return player.hsRate ?? -Infinity;
    case 'firstKillSuccessRate':
      return player.firstKillSuccessRate ?? -Infinity;
    case 'rapidStopSuccessRate':
      return player.rapidStopSuccessRate ?? -Infinity;
    case 'reactionTime':
      return player.reactionTime ?? Infinity;
    case 'weRaw':
      return player.weRaw ?? -Infinity;
    case 'weAvg':
      return player.weAvg ?? -Infinity;
    case 'recentWinRate':
      return player.recentWinRate ?? -Infinity;
    case 'recentDrawCount':
      return player.recentDrawCount ?? -Infinity;
    case 'latest10WinNum':
      return player.latest10WinNum ?? -Infinity;
    case 'latest10TotalNum':
      return player.latest10TotalNum ?? -Infinity;
    case 'seasonWinRate':
      return player.seasonWinRate ?? -Infinity;
    case 'seasonWinNum':
      return player.seasonWinNum ?? -Infinity;
    case 'seasonTotalNum':
      return player.seasonTotalNum ?? -Infinity;
    case 'mapWinRate':
      return player.mapWinRate ?? -Infinity;
    case 'mapWinNum':
      return player.mapWinNum ?? -Infinity;
    case 'mapTotalNum':
      return player.mapTotalNum ?? -Infinity;
    case 'continuedWins':
      return player.continuedWins ?? -Infinity;
    case 'eloChange':
      return player.eloChange ?? -Infinity;
    case 'clutchWinRate':
      return player.clutchWinRate ?? -Infinity;
    case 'perfectPower':
      return player.perfectPower ?? -Infinity;
    case 'rankDesc':
      return player.rankDesc ?? '';
    case 'rankLevel':
      return player.rankLevel ?? '';
    case 'rankNum':
      return player.rankNum ?? -Infinity;
    case 'isVip':
      return player.isVip ? 1 : 0;
    default:
      return getRadarScore(player, key) ?? -Infinity;
  }
}

function compareSortValues(
  a: string | number,
  b: string | number,
  dir: SortDir,
): number {
  if (typeof a === 'string' && typeof b === 'string') {
    const cmp = a.localeCompare(b, 'zh-CN');
    return dir === 'asc' ? cmp : -cmp;
  }
  const na = a as number;
  const nb = b as number;
  if (na === -Infinity && nb === -Infinity) return 0;
  if (na === -Infinity) return 1;
  if (nb === -Infinity) return -1;
  if (na === Infinity && nb === Infinity) return 0;
  if (na === Infinity) return 1;
  if (nb === Infinity) return -1;
  return dir === 'asc' ? na - nb : nb - na;
}

export function sortTeamPlayers(
  players: MatchPlayer[],
  key: TeamTableColumnKey,
  dir: SortDir,
): MatchPlayer[] {
  return [...players].sort((a, b) =>
    compareSortValues(getSortValue(a, key), getSortValue(b, key), dir),
  );
}

export function defaultSortDir(key: TeamTableColumnKey): SortDir {
  if (key === 'nickname' || key === 'reactionTime' || key === 'rankDesc' || key === 'rankLevel') return 'asc';
  if (key === 'rankNum') return 'asc';
  return 'desc';
}

export function sortHeaderClass(active: boolean): string {
  return active
    ? 'text-slate-900 font-semibold'
    : 'text-slate-500 font-medium hover:text-slate-700';
}

export function formatNum(n: number | undefined, decimals = 2): string {
  if (n === undefined || n === null) return '—';
  return n.toFixed(decimals);
}

export function formatPct(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return `${Math.round(n * 100)}%`;
}

export function formatWeAvg(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return n.toFixed(1);
}

export function formatMs(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return `${Math.round(n)}ms`;
}

export function formatInteger(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return String(Math.round(n));
}

export function formatWinLoss(win?: number, total?: number): string {
  if (win == null && total == null) return '—';
  if (win != null && total != null) return `${win}/${total}`;
  return formatInteger(win ?? total);
}

export function getResultColor(result: 'win' | 'lose' | 'draw') {
  switch (result) {
    case 'win':
      return 'bg-emerald-500 text-white';
    case 'lose':
      return 'bg-rose-500 text-white';
    case 'draw':
      return 'bg-slate-400 text-white';
    default:
      return 'bg-slate-300 text-white';
  }
}

export function getResultText(result: 'win' | 'lose' | 'draw') {
  switch (result) {
    case 'win':
      return 'W';
    case 'lose':
      return 'L';
    case 'draw':
      return 'D';
    default:
      return '—';
  }
}

function statThresholdClass(value?: number) {
  if (value == null) return 'text-slate-600';
  const rounded = Math.round(value * 100) / 100;
  if (rounded > 1) return 'text-emerald-600 font-semibold';
  if (rounded < 1) return 'text-rose-500 font-semibold';
  return 'text-slate-900 font-semibold';
}

export function ratingClass(rating?: number) {
  return statThresholdClass(rating);
}

export function kdClass(kd?: number) {
  return statThresholdClass(kd);
}

export function weClass(we?: number) {
  if (we == null) return 'text-slate-600';
  const rounded = Math.round(we * 10) / 10;
  if (rounded > 8) return 'text-emerald-600 font-semibold';
  if (rounded < 8) return 'text-rose-500 font-semibold';
  return 'text-slate-900 font-semibold';
}

export function cellClassForColumn(key: TeamTableColumnKey): string {
  switch (key) {
    case 'rating':
    case 'seasonRating':
      return 'font-medium';
    case 'rankDesc':
    case 'rankLevel':
      return 'text-slate-600 text-[12px]';
    default:
      return 'text-slate-700';
  }
}

export function cellValueClass(key: TeamTableColumnKey, player: MatchPlayer): string {
  switch (key) {
    case 'rating':
      return ratingClass(player.rating);
    case 'seasonRating':
      return ratingClass(player.seasonRating);
    case 'kd':
    case 'weRaw':
    case 'weAvg':
      return cellClassForColumn(key);
    default:
      return cellClassForColumn(key);
  }
}

export function formatCellValue(key: TeamTableColumnKey, player: MatchPlayer): string {
  switch (key) {
    case 'score':
      return player.score != null ? String(Math.round(player.score)) : '—';
    case 'adpr':
      return player.adpr != null ? String(player.adpr) : '—';
    case 'rating':
      return formatNum(player.rating, 2);
    case 'seasonRating':
      return formatNum(player.seasonRating, 2);
    case 'kd':
      return formatNum(player.kd, 2);
    case 'hsRate':
    case 'firstKillSuccessRate':
    case 'rapidStopSuccessRate':
    case 'clutchWinRate':
    case 'recentWinRate':
    case 'seasonWinRate':
    case 'mapWinRate':
      return formatPct(player[key]);
    case 'reactionTime':
      return formatMs(player.reactionTime);
    case 'weRaw':
      return formatWeAvg(player.weRaw);
    case 'weAvg':
      return formatWeAvg(player.weAvg);
    case 'recentDrawCount':
    case 'latest10WinNum':
    case 'latest10TotalNum':
    case 'seasonWinNum':
    case 'seasonTotalNum':
    case 'mapWinNum':
    case 'mapTotalNum':
    case 'continuedWins':
    case 'eloChange':
    case 'perfectPower':
      return formatInteger(player[key]);
    case 'rankDesc':
    case 'rankLevel':
      return player[key]?.trim() || '—';
    case 'rankNum':
      return player.rankNum != null ? `#${player.rankNum.toLocaleString('zh-CN')}` : '—';
    case 'isVip':
      return player.isVip ? '是' : '—';
    default: {
      const score = getRadarScore(player, key);
      return score != null ? formatInteger(score) : '—';
    }
  }
}

/** 开黑组颜色条调色板（相同 troopTeamId 共用一色） */
export const PARTY_BAR_COLORS = [
  '#E8A838',
  '#5BA4D9',
  '#C4A574',
  '#A78BFA',
  '#34D399',
  '#FB7185',
] as const;

export type PartyBarPosition = 'none' | 'single' | 'top' | 'middle' | 'bottom';

export interface PartyBarInfo {
  show: boolean;
  color?: string;
  position: PartyBarPosition;
}

/** 统计队内各 troopTeamId 人数（用于判断是否存在开黑队友） */
export function buildTroopTeamSizes(players: MatchPlayer[]): Map<number, number> {
  const sizes = new Map<number, number>();
  for (const p of players) {
    if (p.troopTeamId == null) continue;
    sizes.set(p.troopTeamId, (sizes.get(p.troopTeamId) ?? 0) + 1);
  }
  return sizes;
}

/** 队内至少 2 人同 troopTeamId 才算组排；is_single=1 或队内无队友均视为单排 */
export function isPartyPlayer(player: MatchPlayer, troopSizes: Map<number, number>): boolean {
  if (player.isSingle || player.troopTeamId == null) return false;
  return (troopSizes.get(player.troopTeamId) ?? 0) >= 2;
}

export function buildTroopColorMap(players: MatchPlayer[]): Map<number, string> {
  const troopSizes = buildTroopTeamSizes(players);
  const ids = [
    ...new Set(
      players
        .filter((p) => isPartyPlayer(p, troopSizes))
        .map((p) => p.troopTeamId!),
    ),
  ];
  const map = new Map<number, string>();
  ids.forEach((id, i) => {
    map.set(id, PARTY_BAR_COLORS[i % PARTY_BAR_COLORS.length]);
  });
  return map;
}

function sameParty(
  a: MatchPlayer,
  b: MatchPlayer,
  troopSizes: Map<number, number>,
): boolean {
  return (
    isPartyPlayer(a, troopSizes)
    && isPartyPlayer(b, troopSizes)
    && a.troopTeamId === b.troopTeamId
  );
}

export function getPartyBarInfo(
  players: MatchPlayer[],
  index: number,
  colorMap: Map<number, string>,
  troopSizes: Map<number, number>,
): PartyBarInfo {
  const player = players[index];
  const troopTeamId = player.troopTeamId;
  if (!isPartyPlayer(player, troopSizes) || troopTeamId == null) {
    return { show: false, position: 'none' };
  }

  const prev = index > 0 ? players[index - 1] : null;
  const next = index < players.length - 1 ? players[index + 1] : null;
  const prevSame = prev != null && sameParty(player, prev, troopSizes);
  const nextSame = next != null && sameParty(player, next, troopSizes);

  let position: PartyBarPosition;
  if (!prevSame && !nextSame) position = 'single';
  else if (!prevSame && nextSame) position = 'top';
  else if (prevSame && nextSame) position = 'middle';
  else position = 'bottom';

  return {
    show: true,
    color: colorMap.get(troopTeamId),
    position,
  };
}

export type PlayerNumericKey = {
  [K in keyof MatchPlayer]-?: MatchPlayer[K] extends number | undefined ? K : never;
}[keyof MatchPlayer];

export function avgPlayerStat(players: MatchPlayer[], key: PlayerNumericKey): number {
  const values = players
    .map((player) => player[key])
    .filter((value): value is number => typeof value === 'number');
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 两队对比进度条宽度百分比，避免 0/0 产生 NaN% */
export function ratioWidth(a: number, b: number, fallback = 50): string {
  const sum = a + b;
  if (!Number.isFinite(sum) || sum <= 0) return `${fallback}%`;
  return `${(a / sum) * 100}%`;
}
