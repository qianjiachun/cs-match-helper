import type { MatchDetail, MatchInsights, MatchPlayer, MatchTeam } from './models';

const RADAR_LABELS: Record<string, string> = {
  fire_power: '火力',
  marksmanship: '枪法',
  follow_up_shot: '补枪',
  first: '突破',
  item: '道具',
  '1vn': '残局',
  sniper: '狙击',
};

/** 队伍雷达图五维（与完美平台展示一致） */
const TEAM_RADAR_DIMS = [
  { key: 'fire_power', label: '火力' },
  { key: 'first', label: '突破' },
  { key: 'follow_up_shot', label: '防守' },
  { key: '1vn', label: '残局' },
  { key: 'item', label: '道具' },
] as const;

function avg(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sumTeamStats(team: MatchTeam): void {
  const players = team.players;
  team.avgScore = avg(players.map((p) => p.score).filter((n): n is number => n != null));
  team.avgRating = avg(players.map((p) => p.rating).filter((n): n is number => n != null));
  team.avgWe = avg(players.map((p) => p.weAvg).filter((n): n is number => n != null));
  team.avgAdpr = avg(players.map((p) => p.adpr).filter((n): n is number => n != null));
  team.recentWinRate = avg(players.map((p) => p.recentWinRate).filter((n): n is number => n != null));
  team.mapWinRate = avg(players.map((p) => p.mapWinRate).filter((n): n is number => n != null));
  team.singleCount = players.filter((p) => p.isSingle).length;

  const groups = new Map<number, number>();
  for (const p of players) {
    if (p.troopTeamId != null) {
      groups.set(p.troopTeamId, (groups.get(p.troopTeamId) ?? 0) + 1);
    }
  }
  team.partyGroups = [...groups.values()].filter((c) => c > 1);

  const scores = players.map((p) => p.score).filter((n): n is number => n != null);
  team.totalScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) : undefined;
  team.avgKd = avg(players.map((p) => p.kd).filter((n): n is number => n != null));

  const teamRadar: Record<string, number> = {};
  for (const { key } of TEAM_RADAR_DIMS) {
    const v = teamRadarAvg(team, key);
    if (v != null) teamRadar[key] = Math.round(v);
  }
  team.teamRadar = Object.keys(teamRadar).length > 0 ? teamRadar : undefined;

  team.strengthScore = computeStrengthScore(team);
}

function computeStrengthScore(team: MatchTeam): number {
  let score = 0;
  let weight = 0;
  if (team.avgScore != null) {
    score += team.avgScore * 0.25;
    weight += 0.25;
  }
  if (team.avgRating != null) {
    score += team.avgRating * 2000 * 0.25;
    weight += 0.25;
  }
  if (team.avgWe != null) {
    score += team.avgWe * 200 * 0.15;
    weight += 0.15;
  }
  if (team.avgAdpr != null) {
    score += team.avgAdpr * 25 * 0.1;
    weight += 0.1;
  }
  if (team.recentWinRate != null) {
    score += team.recentWinRate * 2000 * 0.15;
    weight += 0.15;
  }
  if (team.mapWinRate != null) {
    score += team.mapWinRate * 1500 * 0.1;
    weight += 0.1;
  }
  return weight > 0 ? score / weight : 0;
}

function readPlayerNumber(player: MatchPlayer, key: keyof MatchPlayer): number | undefined {
  const value = player[key];
  return typeof value === 'number' ? value : undefined;
}

function topPlayers(players: MatchPlayer[], key: keyof MatchPlayer, limit = 2): MatchPlayer[] {
  return [...players]
    .filter((p) => readPlayerNumber(p, key) != null)
    .sort((a, b) => (readPlayerNumber(b, key) ?? 0) - (readPlayerNumber(a, key) ?? 0))
    .slice(0, limit);
}

function weakPlayers(players: MatchPlayer[], key: keyof MatchPlayer, limit = 2): MatchPlayer[] {
  return [...players]
    .filter((p) => readPlayerNumber(p, key) != null)
    .sort((a, b) => (readPlayerNumber(a, key) ?? 0) - (readPlayerNumber(b, key) ?? 0))
    .slice(0, limit);
}

function teamRadarAvg(team: MatchTeam, dim: string): number | undefined {
  const vals = team.players
    .map((p) => p.radar[dim]?.score)
    .filter((n): n is number => n != null);
  return avg(vals);
}

export function finalizeMatchDetail(detail: MatchDetail): MatchDetail {
  for (const team of detail.teams) {
    sumTeamStats(team);
  }

  if (detail.teams.length >= 2) {
    detail.insights = buildInsights(detail.teams[0], detail.teams[1]);
  } else if (detail.teams.length === 1) {
    detail.insights = buildSingleTeamInsights(detail.teams[0]);
  }

  return detail;
}

function buildSingleTeamInsights(team: MatchTeam): MatchInsights {
  return {
    strongerSide: team.side,
    scoreDiff: 0,
    ratingDiff: 0,
    highlights: collectHighlights(team, null),
    risks: collectRisks(team, null),
    topPlayers: topPlayers(team.players, 'rating'),
    weakPlayers: weakPlayers(team.players, 'rating'),
    tendencies: collectTendencies(team),
  };
}

function buildInsights(teamA: MatchTeam, teamB: MatchTeam): MatchInsights {
  const scoreDiff = (teamA.strengthScore ?? 0) - (teamB.strengthScore ?? 0);
  const ratingDiff = (teamA.avgRating ?? 0) - (teamB.avgRating ?? 0);
  const strongerSide =
    Math.abs(scoreDiff) < 50 ? undefined : scoreDiff > 0 ? teamA.side : teamB.side;

  return {
    strongerSide,
    scoreDiff,
    ratingDiff,
    highlights: [
      ...collectHighlights(teamA, 'A'),
      ...collectHighlights(teamB, 'B'),
    ],
    risks: [
      ...collectRisks(teamA, 'A'),
      ...collectRisks(teamB, 'B'),
    ],
    topPlayers: [
      ...topPlayers(teamA.players, 'rating', 1),
      ...topPlayers(teamB.players, 'rating', 1),
    ],
    weakPlayers: [
      ...weakPlayers(teamA.players, 'rating', 1),
      ...weakPlayers(teamB.players, 'rating', 1),
    ],
    tendencies: [
      ...collectTendencies(teamA),
      ...collectTendencies(teamB),
    ],
  };
}

function sideLabel(side: 'A' | 'B' | null): string {
  if (side === 'A') return '队伍 A';
  if (side === 'B') return '队伍 B';
  return '本队';
}

function collectHighlights(team: MatchTeam, side: 'A' | 'B' | null): string[] {
  const label = sideLabel(side);
  const tips: string[] = [];

  if (team.avgRating != null && team.avgRating >= 1.15) {
    tips.push(`${label} 近期 Rating 偏高 (${team.avgRating.toFixed(2)})`);
  }
  if (team.avgWe != null && team.avgWe >= 10) {
    tips.push(`${label} WE 均值较高 (${team.avgWe.toFixed(1)})`);
  }
  const fire = teamRadarAvg(team, 'fire_power');
  if (fire != null && fire >= 70) {
    tips.push(`${label} 火力维度突出`);
  }
  const sniper = teamRadarAvg(team, 'sniper');
  if (sniper != null && sniper >= 70) {
    tips.push(`${label} 狙击能力较强`);
  }
  if (team.partyGroups.length > 0) {
    const maxParty = Math.max(...team.partyGroups);
    tips.push(`${label} 疑似 ${maxParty} 人组排`);
  }

  return tips;
}

function collectRisks(team: MatchTeam, side: 'A' | 'B' | null): string[] {
  const label = sideLabel(side);
  const tips: string[] = [];

  if (team.avgRating != null && team.avgRating < 0.95) {
    tips.push(`${label} 近期 Rating 偏低 (${team.avgRating.toFixed(2)})`);
  }
  const lowMapSamples = team.players.filter((p) => p.mapSampleLow).length;
  if (lowMapSamples >= 3) {
    tips.push(`${label} 多人地图样本偏少`);
  }
  const highScoreLowForm = team.players.filter(
    (p) => p.score != null && p.score >= 2050 && p.rating != null && p.rating < 1.0,
  );
  if (highScoreLowForm.length > 0) {
    tips.push(`${label} 存在高分但近期低迷玩家`);
  }
  if (team.singleCount >= 4) {
    tips.push(`${label} 单排玩家较多 (${team.singleCount}/5)`);
  }

  return tips;
}

function collectTendencies(team: MatchTeam): string[] {
  const tips: string[] = [];
  const dims = Object.keys(RADAR_LABELS);
  let bestDim = '';
  let bestScore = 0;
  for (const dim of dims) {
    const v = teamRadarAvg(team, dim);
    if (v != null && v > bestScore) {
      bestScore = v;
      bestDim = dim;
    }
  }
  if (bestDim && bestScore >= 65) {
    tips.push(`队伍 ${team.side} 倾向 ${RADAR_LABELS[bestDim]}`);
  }
  return tips;
}

export { RADAR_LABELS, TEAM_RADAR_DIMS };
