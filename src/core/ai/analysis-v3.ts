import type { MatchPlayer, MatchRecord } from '@core/match/models';
import { findPerfectHotMap, getPerfectMapMetrics } from '@platforms/perfect/map-pool';
import { sanitizeAiText } from './sanitize-result';
import { canonicalizePerspectiveText, resolveSelfSide, type AiSide } from './perspective';
import type {
  AiAnalysisResult,
  AiDecisiveFactor,
  AiEvidenceClaim,
  AiEvidenceDirection,
  AiEvidenceReliability,
  AiEvidenceSnapshot,
  AiFactorType,
  AiMatchupDimension,
  AiPlayerSignal,
  AiPlayerSignalKind,
  AiPredictedWinner,
  AiTeamPlan,
} from './types';

export interface AiAnalysisContext {
  inputFingerprint: string;
  dataCoverage: number;
  dataQuality: string;
  localUncertainties: string[];
  evidenceCatalog: AiEvidenceSnapshot[];
  evidenceById: Map<string, AiEvidenceSnapshot>;
  roster: Map<string, { nickname: string; side: 'A' | 'B' }>;
  selfSide: AiSide | null;
}

type JsonRecord = Record<string, unknown>;

type PlayerMetricSpec = {
  key: string;
  label: string;
  dimension: AiMatchupDimension;
  higherIsBetter: boolean;
  threshold: number;
};

const PLAYER_METRICS: readonly PlayerMetricSpec[] = [
  { key: 'elo', label: 'ELO', dimension: 'strength', higherIsBetter: true, threshold: 0.03 },
  { key: 'rating', label: 'Rating', dimension: 'strength', higherIsBetter: true, threshold: 0.04 },
  { key: 'adr', label: 'ADR', dimension: 'aim', higherIsBetter: true, threshold: 0.05 },
  { key: 'kd', label: 'K/D', dimension: 'aim', higherIsBetter: true, threshold: 0.06 },
  { key: 'hsRate', label: '爆头率', dimension: 'aim', higherIsBetter: true, threshold: 0.08 },
  { key: 'rws', label: 'RWS', dimension: 'aim', higherIsBetter: true, threshold: 0.07 },
  { key: 'seasonWe', label: 'WE', dimension: 'aim', higherIsBetter: true, threshold: 0.07 },
  { key: 'opening', label: '首杀转化率', dimension: 'opening', higherIsBetter: true, threshold: 0.08 },
  { key: 'assistPerMatch', label: '场均助攻', dimension: 'utility', higherIsBetter: true, threshold: 0.1 },
  { key: 'clutchWinRate', label: '残局胜率', dimension: 'clutch', higherIsBetter: true, threshold: 0.1 },
  { key: 'counterStrafe', label: '急停成功率', dimension: 'aim', higherIsBetter: true, threshold: 0.06 },
  { key: 'reaction', label: '反应时间', dimension: 'aim', higherIsBetter: false, threshold: 0.06 },
  { key: 'kast', label: 'KAST', dimension: 'aim', higherIsBetter: true, threshold: 0.05 },
  { key: 'tradeFragRate', label: '补枪成功率', dimension: 'utility', higherIsBetter: true, threshold: 0.08 },
  { key: 'avgTimeToKill', label: '击杀耗时', dimension: 'aim', higherIsBetter: false, threshold: 0.08 },
  { key: 'clutch1v1Rate', label: '1v1 胜率', dimension: 'clutch', higherIsBetter: true, threshold: 0.1 },
  { key: 'recentWinRate', label: '近期胜率', dimension: 'form', higherIsBetter: true, threshold: 0.1 },
  { key: 'eloTrend', label: '近期 ELO 变化', dimension: 'form', higherIsBetter: true, threshold: 0.08 },
] as const;

const SIGNAL_KINDS = new Set<AiPlayerSignalKind>([
  'carry', 'anchor', 'specialist', 'weakLink', 'volatile', 'watch',
]);
const DIMENSIONS = new Set<AiMatchupDimension>([
  'strength', 'aim', 'opening', 'utility', 'clutch', 'map', 'form', 'party',
]);
const ANCHOR_METRICS = new Set(['opening', 'assistPerMatch', 'clutchWinRate', 'clutch1v1Rate', 'tradeFragRate', 'recentWinRate']);
const COMBAT_CONTEXT_METRICS = new Set(['sides', 'openingProfile', 'utilityProfile', 'aimProfile', 'sniperProfile', 'clutchProfile', 'formProfile']);

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asString)
    .filter((item): item is string => Boolean(item))
    .map(sanitizeAiText)
    .slice(0, limit);
}

function contextText(
  value: string,
  context?: AiAnalysisContext,
  maxLength = 64,
): string {
  return canonicalizePerspectiveText(sanitizeAiText(value), context?.selfSide).slice(0, maxLength);
}

function contextTextArray(value: unknown, context?: AiAnalysisContext, limit = 4): string[] {
  return asStringArray(value, limit).map((item) => contextText(item, context, 48));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!valid.length) return undefined;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function median(values: Array<number | undefined>): number | undefined {
  const valid = values
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!valid.length) return undefined;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function numberLabel(value: number, digits = 2): string {
  return value.toFixed(digits).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function metricValue(metric: string, value: number): string {
  if (/Rate|rate|hs|win|Success|kast/.test(metric)) return pct(value);
  if (/elo|score|adr|reaction|TimeToKill|timeToKill/i.test(metric)) return numberLabel(value, 0);
  return numberLabel(value, 2);
}

function playerMetric(player: MatchPlayer, metric: string): number | undefined {
  switch (metric) {
    case 'elo': return player.score;
    case 'rating': return player.seasonRating ?? player.rating;
    case 'adr': return player.adpr;
    case 'kd': return player.kd;
    case 'hsRate': return player.hsRate;
    case 'rws': return player.rws;
    case 'seasonWe': return player.seasonWe;
    case 'opening': return player.firstKillSuccessRate;
    case 'assistPerMatch': return player.assists != null && player.seasonTotalNum
      ? player.assists / player.seasonTotalNum
      : undefined;
    case 'clutchWinRate': return player.clutchWinRate;
    case 'counterStrafe': return player.rapidStopSuccessRate;
    case 'reaction': return player.reactionTime;
    case 'kast': return player.kast;
    case 'tradeFragRate': return player.tradeFragRate;
    case 'avgTimeToKill': return player.combat?.aim?.avgTimeToKillMs;
    case 'clutch1v1Rate': return player.clutch1v1Rate;
    case 'recentWinRate': return player.recentWinRate;
    case 'eloTrend': return player.eloTrend;
    default: return undefined;
  }
}

function reliabilityForSample(sampleSize?: number): AiEvidenceReliability {
  if (sampleSize == null) return 'medium';
  if (sampleSize >= 10) return 'high';
  if (sampleSize >= 4) return 'medium';
  return 'low';
}

function teamPlayers(record: MatchRecord, side: 'A' | 'B'): MatchPlayer[] {
  return record.detail.teams.find((team) => team.side === side)?.players ?? [];
}

function platformId(record: MatchRecord): string | undefined {
  return record.platformId ?? record.detail.platformId;
}

function comparisonDirection(
  value: number,
  lobbyMedian: number | undefined,
  teamMedian: number | undefined,
  higherIsBetter: boolean,
  threshold: number,
): AiEvidenceDirection {
  const classify = (baseline: number | undefined): -1 | 0 | 1 => {
    if (baseline == null) return 0;
    const signed = (higherIsBetter ? 1 : -1) * (value - baseline);
    const ratio = signed / Math.max(Math.abs(baseline), 0.01);
    if (ratio >= threshold) return 1;
    if (ratio <= -threshold) return -1;
    return 0;
  };
  const lobby = classify(lobbyMedian);
  const team = classify(teamMedian);
  if (lobby && team && lobby !== team) return 'mixed';
  if (lobby > 0 || team > 0) return 'positive';
  if (lobby < 0 || team < 0) return 'negative';
  return 'neutral';
}

function buildComparisonEvidence(
  player: MatchPlayer,
  side: 'A' | 'B',
  spec: PlayerMetricSpec,
  allPlayers: MatchPlayer[],
  ownTeam: MatchPlayer[],
): AiEvidenceSnapshot | null {
  const value = playerMetric(player, spec.key);
  if (value == null) return null;
  const lobbyMedian = median(allPlayers.map((item) => playerMetric(item, spec.key)));
  const teamMedian = median(ownTeam.map((item) => playerMetric(item, spec.key)));
  const direction = comparisonDirection(
    value,
    lobbyMedian,
    teamMedian,
    spec.higherIsBetter,
    spec.threshold,
  );
  return {
    id: `player.${player.steamId}.${spec.key}`,
    scope: 'player',
    metric: spec.key,
    label: spec.label,
    side,
    steamId: player.steamId,
    value: metricValue(spec.key, value),
    sampleSize: player.seasonTotalNum,
    reliability: reliabilityForSample(player.seasonTotalNum),
    direction,
    comparison: {
      rawValue: value,
      lobbyMedian,
      teamMedian,
      lobbyDelta: lobbyMedian == null ? undefined : round(value - lobbyMedian, 3),
      teamDelta: teamMedian == null ? undefined : round(value - teamMedian, 3),
      higherIsBetter: spec.higherIsBetter,
    },
  };
}

function joinEvidenceParts(parts: Array<string | undefined>): string | undefined {
  const valid = parts.filter((item): item is string => Boolean(item));
  return valid.length ? valid.join(' · ') : undefined;
}

function pushCombatContext(
  target: AiEvidenceSnapshot[],
  player: MatchPlayer,
  side: 'A' | 'B',
  metric: string,
  label: string,
  value: string | undefined,
  sampleSize?: number,
) {
  if (!value) return;
  target.push({
    id: `player.${player.steamId}.${metric}`,
    scope: 'player',
    metric,
    label,
    side,
    steamId: player.steamId,
    value,
    sampleSize,
    reliability: reliabilityForSample(sampleSize),
    direction: 'neutral',
  });
}

function addPerfectCombatEvidence(
  evidence: AiEvidenceSnapshot[],
  player: MatchPlayer,
  side: 'A' | 'B',
  mapName?: string,
) {
  const combat = player.combat;
  const current = findPerfectHotMap(player, mapName);
  const metrics = current ? getPerfectMapMetrics(player, current) : undefined;
  pushCombatContext(evidence, player, side, 'sides', '赛季 CT/T Rating', joinEvidenceParts([
    combat?.sides?.ct?.rating != null ? `CT ${numberLabel(combat.sides.ct.rating)}` : undefined,
    combat?.sides?.t?.rating != null ? `T ${numberLabel(combat.sides.t.rating)}` : undefined,
    metrics?.ctRoundWinRate != null ? `本图 CT 回合 ${pct(metrics.ctRoundWinRate)} (${current?.ctRoundCount ?? 0})` : undefined,
    metrics?.tRoundWinRate != null ? `本图 T 回合 ${pct(metrics.tRoundWinRate)} (${current?.tRoundCount ?? 0})` : undefined,
  ]), player.seasonTotalNum);
  pushCombatContext(evidence, player, side, 'openingProfile', '开局', joinEvidenceParts([
    combat?.opening?.firstKillRate != null ? `突破 ${pct(combat.opening.firstKillRate)}` : undefined,
    combat?.opening?.openingDuelRate != null ? `对枪 ${pct(combat.opening.openingDuelRate)}` : undefined,
    combat?.opening?.winAfterOpeningKill != null ? `开完胜 ${pct(combat.opening.winAfterOpeningKill)}` : undefined,
  ]), player.seasonTotalNum);
  pushCombatContext(evidence, player, side, 'utilityProfile', '道具', joinEvidenceParts([
    combat?.utility?.flashAssistPerRound != null ? `闪助 ${numberLabel(combat.utility.flashAssistPerRound, 3)}` : undefined,
    combat?.utility?.flashRate != null ? `致盲 ${pct(combat.utility.flashRate)}` : undefined,
    combat?.utility?.utilDmgPerRound != null ? `道具伤 ${numberLabel(combat.utility.utilDmgPerRound, 1)}` : undefined,
  ]), player.seasonTotalNum);
  pushCombatContext(evidence, player, side, 'aimProfile', '对枪结构', joinEvidenceParts([
    combat?.aim?.avgTimeToKillMs != null ? `TTK ${Math.round(combat.aim.avgTimeToKillMs)}ms` : undefined,
    combat?.aim?.sprayHitRate != null ? `扫射 ${pct(combat.aim.sprayHitRate)}` : undefined,
    combat?.aim?.pistolRating != null ? `手枪 ${numberLabel(combat.aim.pistolRating, 1)}` : undefined,
    combat?.aim?.killsPerWinRound != null && combat?.aim?.killsPerRound != null
      ? `击杀 ${numberLabel(combat.aim.killsPerRound)}/${numberLabel(combat.aim.killsPerWinRound)}胜回合`
      : undefined,
  ]), player.seasonTotalNum);
  pushCombatContext(evidence, player, side, 'sniperProfile', '狙击', joinEvidenceParts([
    combat?.sniper?.killShare != null ? `占比 ${pct(combat.sniper.killShare)}` : undefined,
    combat?.sniper?.firstKills != null ? `首杀 ${combat.sniper.firstKills}` : undefined,
    combat?.sniper?.holdRounds != null ? `持枪 ${combat.sniper.holdRounds} 回合` : undefined,
  ]), player.seasonTotalNum);
  pushCombatContext(evidence, player, side, 'clutchProfile', '残局结构', joinEvidenceParts([
    combat?.clutch?.allRate != null ? `1vx ${pct(combat.clutch.allRate)}` : undefined,
    combat?.clutch?.v1?.rate != null
      ? `1v1 ${pct(combat.clutch.v1.rate)} (${combat.clutch.v1.wins ?? 0}/${combat.clutch.v1.attempts ?? 0})`
      : undefined,
    combat?.clutch?.lastAliveRate != null ? `最后存活 ${pct(combat.clutch.lastAliveRate)}` : undefined,
  ]), combat?.clutch?.v1?.attempts ?? player.seasonTotalNum);
  pushCombatContext(evidence, player, side, 'formProfile', '赛季变化', joinEvidenceParts([
    combat?.form?.ratingChange != null ? `Rating ${numberLabel(combat.form.ratingChange, 3)}` : undefined,
    combat?.form?.adrChange != null ? `ADR ${numberLabel(combat.form.adrChange, 1)}` : undefined,
    combat?.form?.winRateChange != null ? `胜率 ${numberLabel(combat.form.winRateChange, 3)}` : undefined,
  ]), player.seasonTotalNum);
}

function addTeamEvidence(
  target: AiEvidenceSnapshot[],
  metric: string,
  label: string,
  a: number | undefined,
  b: number | undefined,
) {
  if (a == null || b == null) return;
  target.push({
    id: `team.${metric}`,
    scope: 'team',
    metric,
    label,
    valueA: metricValue(metric, a),
    valueB: metricValue(metric, b),
    reliability: 'high',
    direction: 'neutral',
  });
}

function buildEvidenceCatalog(record: MatchRecord): AiEvidenceSnapshot[] {
  const evidence: AiEvidenceSnapshot[] = [];
  const allPlayers = record.detail.teams.flatMap((team) => team.players);
  const aPlayers = teamPlayers(record, 'A');
  const bPlayers = teamPlayers(record, 'B');

  addTeamEvidence(evidence, 'elo', '平均 ELO', average(aPlayers.map((p) => p.score)), average(bPlayers.map((p) => p.score)));
  addTeamEvidence(evidence, 'rating', '平均 Rating', average(aPlayers.map((p) => p.seasonRating ?? p.rating)), average(bPlayers.map((p) => p.seasonRating ?? p.rating)));
  addTeamEvidence(evidence, 'adr', '平均 ADR', average(aPlayers.map((p) => p.adpr)), average(bPlayers.map((p) => p.adpr)));
  addTeamEvidence(evidence, 'kd', '平均 K/D', average(aPlayers.map((p) => p.kd)), average(bPlayers.map((p) => p.kd)));
  addTeamEvidence(evidence, 'rws', '平均 RWS', average(aPlayers.map((p) => p.rws)), average(bPlayers.map((p) => p.rws)));
  if (platformId(record) === 'perfect') {
    addTeamEvidence(evidence, 'seasonWe', '平均 WE', average(aPlayers.map((p) => p.seasonWe)), average(bPlayers.map((p) => p.seasonWe)));
    addTeamEvidence(
      evidence,
      'ctRating',
      '平均 CT Rating',
      average(aPlayers.map((p) => p.combat?.sides?.ct?.rating)),
      average(bPlayers.map((p) => p.combat?.sides?.ct?.rating)),
    );
    addTeamEvidence(
      evidence,
      'tRating',
      '平均 T Rating',
      average(aPlayers.map((p) => p.combat?.sides?.t?.rating)),
      average(bPlayers.map((p) => p.combat?.sides?.t?.rating)),
    );
  }
  addTeamEvidence(evidence, 'opening', '平均首杀转化率', average(aPlayers.map((p) => p.firstKillSuccessRate)), average(bPlayers.map((p) => p.firstKillSuccessRate)));
  addTeamEvidence(evidence, 'recentWinRate', '近期胜率', average(aPlayers.map((p) => p.recentWinRate)), average(bPlayers.map((p) => p.recentWinRate)));

  for (const team of record.detail.teams) {
    for (const player of team.players) {
      for (const spec of PLAYER_METRICS) {
        const item = buildComparisonEvidence(player, team.side, spec, allPlayers, team.players);
        if (item) evidence.push(item);
      }

      if (platformId(record) === 'perfect') {
        if (player.score != null) {
          evidence.push({
            id: `player.${player.steamId}.currentRank`,
            scope: 'context',
            metric: 'currentRank',
            label: '当前段位',
            side: team.side,
            steamId: player.steamId,
            value: player.score >= 2400 ? `S ${player.currentSStars ?? 0} 星` : `${Math.round(player.score)} 分`,
            sampleSize: player.seasonTotalNum,
            reliability: reliabilityForSample(player.seasonTotalNum),
            direction: 'neutral',
          });
        }
        if (player.peakScore != null || player.peakSStars != null) {
          evidence.push({
            id: `player.${player.steamId}.peakRank`,
            scope: 'context',
            metric: 'peakRank',
            label: '历史最高段位',
            side: team.side,
            steamId: player.steamId,
            value: (player.peakScore ?? 0) >= 2400 || player.peakSStars != null
              ? `S ${player.peakSStars ?? 0} 星${player.peakSeason ? ` · ${player.peakSeason}` : ''}`
              : `${Math.round(player.peakScore ?? 0)} 分${player.peakSeason ? ` · ${player.peakSeason}` : ''}`,
            reliability: 'medium',
            direction: 'neutral',
          });
        }
        addPerfectCombatEvidence(evidence, player, team.side, record.detail.mapName);
      }

      const mapEntry = platformId(record) === 'perfect'
        ? findPerfectHotMap(player, record.detail.mapName)
        : undefined;
      const mapMatches = platformId(record) === 'perfect' ? mapEntry?.totalMatch : player.mapTotalNum;
      const mapWinRate = platformId(record) === 'perfect'
        ? mapEntry && mapEntry.totalMatch > 0 ? mapEntry.winCount / mapEntry.totalMatch : undefined
        : player.mapWinRate;
      if (record.detail.mapName && mapMatches != null && mapWinRate != null) {
        const lobbyMedian = median(allPlayers.map((item) => {
          if (platformId(record) === 'perfect') {
            const map = findPerfectHotMap(item, record.detail.mapName);
            return map && map.totalMatch > 0 ? map.winCount / map.totalMatch : undefined;
          }
          return item.mapWinRate;
        }));
        const teamMedian = median(team.players.map((item) => {
          if (platformId(record) === 'perfect') {
            const map = findPerfectHotMap(item, record.detail.mapName);
            return map && map.totalMatch > 0 ? map.winCount / map.totalMatch : undefined;
          }
          return item.mapWinRate;
        }));
        evidence.push({
          id: `player.${player.steamId}.map`,
          scope: 'map',
          metric: 'mapWinRate',
          label: `${record.detail.mapName} 胜率`,
          side: team.side,
          steamId: player.steamId,
          value: joinEvidenceParts([
            pct(mapWinRate),
            platformId(record) === 'perfect' && mapEntry
              ? joinEvidenceParts([
                mapEntry.ctRoundCount
                  ? `CT ${pct((mapEntry.ctWinRoundCount ?? 0) / mapEntry.ctRoundCount)} (${mapEntry.ctRoundCount})`
                  : undefined,
                mapEntry.tRoundCount
                  ? `T ${pct((mapEntry.tWinRoundCount ?? 0) / mapEntry.tRoundCount)} (${mapEntry.tRoundCount})`
                  : undefined,
              ])
              : undefined,
          ]),
          sampleSize: mapMatches,
          reliability: reliabilityForSample(mapMatches),
          direction: comparisonDirection(mapWinRate, lobbyMedian, teamMedian, true, 0.1),
          comparison: {
            rawValue: mapWinRate,
            lobbyMedian,
            teamMedian,
            lobbyDelta: lobbyMedian == null ? undefined : round(mapWinRate - lobbyMedian, 3),
            teamDelta: teamMedian == null ? undefined : round(mapWinRate - teamMedian, 3),
            higherIsBetter: true,
          },
        });
      }

      const weapon = player.primaryWeapons?.find((item) => (item.matchNum ?? 0) >= 4 && item.killNum > 0);
      if (weapon) {
        evidence.push({
          id: `player.${player.steamId}.weapon.${weapon.name}`,
          scope: 'player',
          metric: 'weaponSpecialty',
          label: weapon.nameZh ?? weapon.name,
          side: team.side,
          steamId: player.steamId,
          value: `${weapon.killNum} 杀`,
          sampleSize: weapon.matchNum,
          reliability: reliabilityForSample(weapon.matchNum),
          direction: 'positive',
        });
      }
    }

    if (team.partyGroups.length) {
      evidence.push({
        id: `team.${team.side}.party`,
        scope: 'context',
        metric: 'party',
        label: `${team.side} 队组排`,
        side: team.side,
        value: `最大 ${Math.max(...team.partyGroups)} 人`,
        reliability: 'medium',
        direction: 'neutral',
      });
    }
  }

  return evidence;
}

function hasBaseStats(player: MatchPlayer): boolean {
  return player.score != null && [
    player.seasonRating, player.rating, player.kd, player.adpr, player.rws,
    player.weRaw, player.seasonWe,
  ].some((value) => value != null);
}

function hasMapSample(record: MatchRecord, player: MatchPlayer): boolean {
  if (!record.detail.mapName) return false;
  if (platformId(record) === 'perfect') {
    return (findPerfectHotMap(player, record.detail.mapName)?.totalMatch ?? 0) >= 4;
  }
  return (player.mapTotalNum ?? 0) >= 5;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildAiInputFingerprint(record: MatchRecord): string {
  const payload = {
    id: record.id,
    platform: platformId(record),
    map: record.detail.mapName ?? '',
    teams: record.detail.teams.map((team) => ({
      side: team.side,
      players: team.players.map((player) => ({
        id: player.steamId,
        score: player.score,
        rating: player.seasonRating ?? player.rating,
        adr: player.adpr,
        kd: player.kd,
        rws: player.rws ?? player.weRaw,
        seasonWe: player.seasonWe,
        opening: player.firstKillSuccessRate,
        assists: player.assists,
        clutch: player.clutchWinRate,
        clutch1v1Rate: player.clutch1v1Rate,
        kast: player.kast,
        tradeFragRate: player.tradeFragRate,
        ctRating: player.combat?.sides?.ct?.rating,
        tRating: player.combat?.sides?.t?.rating,
        form: player.combat?.form,
        counterStrafe: player.rapidStopSuccessRate,
        reaction: player.reactionTime,
        recentWinRate: player.recentWinRate,
        matches: player.seasonTotalNum,
        partyId: player.troopTeamId,
        mapMatches: player.mapTotalNum,
        mapWinRate: player.mapWinRate,
        hotMaps: player.hotMaps,
      })),
    })),
  };
  return `ai3-${fnv1a(JSON.stringify(payload))}`;
}

export function buildAiAnalysisContext(record: MatchRecord, viewerSteamId?: string | null): AiAnalysisContext {
  const players = record.detail.teams.flatMap((team) => team.players);
  const expected = Math.max(1, (record.detail.expectedPlayerCount ?? players.length) || 10);
  const baseCount = players.filter(hasBaseStats).length;
  const mapCount = players.filter((player) => hasMapSample(record, player)).length;
  const rosterCoverage = clamp(players.length / expected, 0, 1);
  const baseCoverage = clamp(baseCount / expected, 0, 1);
  const mapCoverage = clamp(mapCount / expected, 0, 1);
  const dataCoverage = round(0.65 * baseCoverage + 0.25 * mapCoverage + 0.1 * rosterCoverage, 3);
  const localUncertainties: string[] = [];
  if (baseCount < expected) localUncertainties.push(`${expected - baseCount} 名玩家缺少完整赛季统计`);
  if (!record.detail.mapName) localUncertainties.push('当前地图尚未确认');
  else if (mapCount < expected) localUncertainties.push(`仅 ${mapCount}/${expected} 名玩家具有有效当前地图样本`);
  if (players.length < expected) localUncertainties.push(`阵容数据不完整（${players.length}/${expected}）`);
  localUncertainties.push(...record.detail.parseWarnings.slice(0, 2));

  const evidenceCatalog = buildEvidenceCatalog(record);
  const roster = new Map<string, { nickname: string; side: 'A' | 'B' }>();
  for (const team of record.detail.teams) {
    for (const player of team.players) {
      roster.set(player.steamId, { nickname: player.nickname, side: team.side });
    }
  }

  return {
    inputFingerprint: buildAiInputFingerprint(record),
    dataCoverage,
    dataQuality: `基础统计 ${baseCount}/${expected} · 地图样本 ${mapCount}/${expected} · 数据覆盖 ${Math.round(dataCoverage * 100)}%`,
    localUncertainties: [...new Set(localUncertainties)].slice(0, 4),
    evidenceCatalog,
    evidenceById: new Map(evidenceCatalog.map((item) => [item.id, item])),
    roster,
    selfSide: resolveSelfSide(record, viewerSteamId),
  };
}

function promptEvidenceStrength(item: AiEvidenceSnapshot): number {
  const reliability = item.reliability === 'high' ? 2 : item.reliability === 'medium' ? 1 : 0;
  const comparison = item.comparison;
  if (!comparison) return reliability;
  const lobbyRatio = comparison.lobbyDelta == null
    ? 0
    : Math.abs(comparison.lobbyDelta) / Math.max(Math.abs(comparison.lobbyMedian ?? comparison.rawValue), 0.01);
  const teamRatio = comparison.teamDelta == null
    ? 0
    : Math.abs(comparison.teamDelta) / Math.max(Math.abs(comparison.teamMedian ?? comparison.rawValue), 0.01);
  return reliability + Math.max(lobbyRatio, teamRatio);
}

function selectDistinctDimensions(items: AiEvidenceSnapshot[], limit: number): AiEvidenceSnapshot[] {
  const dimensions = new Set<AiMatchupDimension>();
  const selected: AiEvidenceSnapshot[] = [];
  for (const item of [...items].sort((a, b) => promptEvidenceStrength(b) - promptEvidenceStrength(a))) {
    const dimension = evidenceDimension(item);
    if (dimensions.has(dimension)) continue;
    dimensions.add(dimension);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function selectAiPromptEvidence(context: AiAnalysisContext): AiEvidenceSnapshot[] {
  const shared = context.evidenceCatalog.filter((item) => !item.steamId && item.reliability !== 'low');
  const playerEvidence = [...context.roster.keys()].flatMap((steamId) => {
    const candidates = context.evidenceCatalog.filter((item) => (
      item.steamId === steamId && item.reliability !== 'low'
    ));
    const positive = selectDistinctDimensions(
      candidates.filter((item) => item.direction === 'positive'),
      3,
    );
    const negative = selectDistinctDimensions(
      candidates.filter((item) => item.direction === 'negative'),
      3,
    );
    const identityContext = candidates.filter((item) => (
      item.metric === 'currentRank'
      || item.metric === 'peakRank'
      || item.metric === 'weaponSpecialty'
      || item.scope === 'map'
    ));
    const combatContext = candidates.filter((item) => COMBAT_CONTEXT_METRICS.has(item.metric));
    const anchorCandidates = candidates
      .filter((item) => item.direction === 'positive' && ANCHOR_METRICS.has(item.metric))
      .sort((a, b) => promptEvidenceStrength(b) - promptEvidenceStrength(a))
      .slice(0, 2);
    return [...new Map(
      [...anchorCandidates, ...positive, ...negative, ...identityContext, ...combatContext]
        .map((item) => [item.id, item]),
    ).values()].slice(0, 12);
  });
  return [...shared, ...playerEvidence];
}

function compactPromptEvidence(item: AiEvidenceSnapshot) {
  return {
    id: item.id,
    scope: item.scope,
    metric: item.metric,
    label: item.label,
    side: item.side,
    steamId: item.steamId,
    value: item.value,
    valueA: item.valueA,
    valueB: item.valueB,
    sample: item.sampleSize,
    reliability: item.reliability,
    direction: item.direction,
    lobbyDelta: item.comparison?.lobbyDelta,
    teamDelta: item.comparison?.teamDelta,
    higherIsBetter: item.comparison?.higherIsBetter,
  };
}

export function buildAiPromptEvidence(context: AiAnalysisContext) {
  return {
    inputFingerprint: context.inputFingerprint,
    dataCoverage: context.dataCoverage,
    allowedPlayers: [...context.roster.entries()].map(([steamId, player]) => ({ steamId, ...player })),
    evidenceCatalog: selectAiPromptEvidence(context).map(compactPromptEvidence),
    localUncertainties: context.localUncertainties,
    perspective: context.selfSide ? {
      selfSide: context.selfSide,
      opponentSide: context.selfSide === 'A' ? 'B' : 'A',
    } : undefined,
  };
}

/** Builds a V3 payload for the debug panel using only evidence from the active match. */
export function buildAiDebugFixture(record: MatchRecord): string {
  const context = buildAiAnalysisContext(record);
  const signals = [...context.roster.entries()].flatMap(([steamId, player]) => {
    const items = context.evidenceCatalog.filter((item) => (
      item.steamId === steamId && item.reliability !== 'low' && item.direction === 'positive'
    ));
    const dimensions = new Set(items.map(evidenceDimension));
    if (dimensions.size < 2) return [];
    return [{
      steamId,
      side: player.side,
      kind: 'carry',
      impact: 3,
      title: '多维数据强点',
      summary: '在当前阵容的多个可靠指标上高于全场或队内中位数。',
      evidenceIds: items.slice(0, 3).map((item) => item.id),
    }];
  }).filter((signal, index, all) => (
    all.slice(0, index).filter((item) => item.side === signal.side).length < 2
  )).slice(0, 4);
  const teamEvidence = context.evidenceCatalog.filter((item) => item.scope === 'team').slice(0, 3);
  const firstTeamEvidence = teamEvidence[0];
  return JSON.stringify({
    schemaVersion: 3,
    predictedWinner: 'A',
    modelWinProbability: { A: 61, B: 39 },
    confidence: 78,
    headline: 'V3 调试结果：根据当前对局真实证据生成',
    decisiveFactors: teamEvidence.map((evidence, index) => ({
      id: `debug-factor-${index + 1}`,
      dimension: index === 0 ? 'strength' : index === 1 ? 'aim' : 'form',
      advantage: index % 2 === 0 ? 'A' : 'B',
      impact: Math.max(1, 3 - index),
      title: `${evidence.label}对比`,
      summary: `该项只引用证据目录中的 ${evidence.id}。`,
      evidenceIds: [evidence.id],
    })),
    playerSignals: signals,
    teamPlans: firstTeamEvidence ? {
      A: {
        winConditions: [{ text: '发挥纸面强度优势，减少无谓波动。', evidenceIds: [firstTeamEvidence.id] }],
        risks: [],
      },
      B: {
        winConditions: [{ text: '缩小核心指标差距，把对局拖入均势。', evidenceIds: [firstTeamEvidence.id] }],
        risks: [],
      },
    } : {
      A: { winConditions: [], risks: [] },
      B: { winConditions: [], risks: [] },
    },
    uncertainties: context.localUncertainties,
  }, null, 2);
}

function normalizeProbability(raw: unknown): { A: number; B: number } {
  const record = asRecord(raw);
  let a = clamp(asNumber(record?.A) ?? 50, 0, 100);
  let b = clamp(asNumber(record?.B) ?? 50, 0, 100);
  const total = a + b;
  if (total <= 0) return { A: 50, B: 50 };
  a = round((a / total) * 100);
  return { A: a, B: 100 - a };
}

export function calibrateWinProbability(
  raw: { A: number; B: number },
  dataCoverage: number,
): { A: number; B: number } {
  const normalized = normalizeProbability(raw);
  const a = round(50 + (normalized.A - 50) * clamp(dataCoverage, 0, 1));
  return { A: a, B: 100 - a };
}

function normalizedWinner(probability: { A: number; B: number }): AiPredictedWinner {
  if (Math.abs(probability.A - probability.B) <= 4) return 'Even';
  return probability.A > probability.B ? 'A' : 'B';
}

function normalizeEvidenceSnapshot(raw: unknown): AiEvidenceSnapshot | null {
  const record = asRecord(raw);
  const id = asString(record?.id);
  const label = asString(record?.label);
  const metric = asString(record?.metric);
  const scope = record?.scope;
  if (!id || !label || !metric || !['team', 'player', 'map', 'context'].includes(String(scope))) return null;
  const reliability = ['high', 'medium', 'low'].includes(String(record?.reliability))
    ? record?.reliability as AiEvidenceReliability
    : 'medium';
  const direction = ['positive', 'negative', 'mixed', 'neutral'].includes(String(record?.direction))
    ? record?.direction as AiEvidenceDirection
    : undefined;
  const comparison = asRecord(record?.comparison);
  const rawValue = asNumber(comparison?.rawValue);
  return {
    id,
    label,
    metric,
    scope: scope as AiEvidenceSnapshot['scope'],
    side: record?.side === 'A' || record?.side === 'B' ? record.side : undefined,
    steamId: asString(record?.steamId),
    value: asString(record?.value),
    valueA: asString(record?.valueA),
    valueB: asString(record?.valueB),
    sampleSize: asNumber(record?.sampleSize),
    reliability,
    direction,
    comparison: rawValue == null ? undefined : {
      rawValue,
      lobbyMedian: asNumber(comparison?.lobbyMedian),
      teamMedian: asNumber(comparison?.teamMedian),
      lobbyDelta: asNumber(comparison?.lobbyDelta),
      teamDelta: asNumber(comparison?.teamDelta),
      higherIsBetter: comparison?.higherIsBetter !== false,
    },
  };
}

function resolveEvidence(item: JsonRecord, context?: AiAnalysisContext): AiEvidenceSnapshot[] {
  const ids = asStringArray(item.evidenceIds, 6);
  const fromIds = context
    ? ids.map((id) => context.evidenceById.get(id)).filter((entry): entry is AiEvidenceSnapshot => Boolean(entry))
    : [];
  const embedded = !context && Array.isArray(item.evidence)
    ? item.evidence.map(normalizeEvidenceSnapshot).filter((entry): entry is AiEvidenceSnapshot => Boolean(entry))
    : [];
  return [...new Map([...fromIds, ...embedded].map((entry) => [entry.id, entry])).values()].slice(0, 4);
}

function impactValue(value: unknown): 1 | 2 | 3 {
  return clamp(Math.round(asNumber(value) ?? 1), 1, 3) as 1 | 2 | 3;
}

function evidenceDimension(evidence: AiEvidenceSnapshot): AiMatchupDimension {
  if (evidence.scope === 'map' || evidence.metric === 'mapWinRate') return 'map';
  if (evidence.metric === 'opening' || evidence.metric === 'openingProfile') return 'opening';
  if (evidence.metric === 'assistPerMatch' || evidence.metric === 'tradeFragRate' || evidence.metric === 'utilityProfile') return 'utility';
  if (evidence.metric === 'clutchWinRate' || evidence.metric === 'clutch1v1Rate' || evidence.metric === 'clutchProfile') return 'clutch';
  if (evidence.metric === 'recentWinRate' || evidence.metric === 'formProfile' || evidence.metric === 'eloTrend') return 'form';
  if (evidence.metric === 'party') return 'party';
  if (evidence.metric === 'elo' || evidence.metric === 'rating' || evidence.metric === 'sides' || evidence.metric === 'ctRating' || evidence.metric === 'tRating') return 'strength';
  return 'aim';
}

function normalizeFactors(raw: unknown, context?: AiAnalysisContext): AiDecisiveFactor[] {
  if (!Array.isArray(raw)) return [];
  const result: AiDecisiveFactor[] = [];
  for (const [index, value] of raw.entries()) {
    const item = asRecord(value);
    if (!item) continue;
    const dimension = asString(item.dimension);
    const title = asString(item.title);
    const summary = asString(item.summary);
    const evidence = resolveEvidence(item, context);
    if (!dimension || !DIMENSIONS.has(dimension as AiMatchupDimension) || !title || !summary || !evidence.length) continue;
    result.push({
      id: asString(item.id) ?? `factor-${index}`,
      dimension: dimension as AiMatchupDimension,
      advantage: item.advantage === 'A' || item.advantage === 'B' || item.advantage === 'Even'
        ? item.advantage
        : 'Even',
      impact: impactValue(item.impact),
      title: contextText(title, context, 16),
      summary: contextText(summary, context, 64),
      evidence,
    });
  }
  return result.sort((a, b) => b.impact - a.impact).slice(0, 4);
}

function reliablePlayerEvidence(evidence: AiEvidenceSnapshot[], steamId: string): AiEvidenceSnapshot[] {
  return evidence.filter((item) => (
    item.steamId === steamId && item.reliability !== 'low'
  ));
}

function signalMeetsRules(kind: AiPlayerSignalKind, evidence: AiEvidenceSnapshot[], steamId: string): boolean {
  if (kind === 'watch') return false;
  const reliable = reliablePlayerEvidence(evidence, steamId);
  const positive = reliable.filter((item) => item.direction === 'positive');
  const negative = reliable.filter((item) => item.direction === 'negative');
  if (kind === 'carry' || kind === 'weakLink') {
    const expected = kind === 'carry' ? positive : negative;
    return new Set(expected.map(evidenceDimension)).size >= 2;
  }
  if (kind === 'anchor') {
    return new Set(positive.filter((item) => ANCHOR_METRICS.has(item.metric)).map((item) => item.metric)).size >= 2;
  }
  if (kind === 'specialist') {
    return positive.some((item) => (
      (item.scope === 'map' && (item.sampleSize ?? 0) >= 4)
      || (item.metric === 'weaponSpecialty' && (item.sampleSize ?? 0) >= 10)
    ));
  }
  if (kind === 'volatile') return positive.length > 0 && negative.length > 0;
  return false;
}

function normalizeSignals(raw: unknown, context?: AiAnalysisContext): AiPlayerSignal[] {
  if (!Array.isArray(raw)) return [];
  const result: AiPlayerSignal[] = [];
  const seen = new Set<string>();
  const sideCounts = { A: 0, B: 0 };
  const ordered = [...raw].sort((a, b) => impactValue(asRecord(b)?.impact) - impactValue(asRecord(a)?.impact));
  for (const value of ordered) {
    const item = asRecord(value);
    const steamId = asString(item?.steamId);
    if (!item || !steamId || seen.has(steamId)) continue;
    const rosterPlayer = context?.roster.get(steamId);
    if (context && !rosterPlayer) continue;
    const side = rosterPlayer?.side ?? (item.side === 'A' || item.side === 'B' ? item.side : undefined);
    const kind = asString(item.kind) as AiPlayerSignalKind | undefined;
    const title = asString(item.title);
    const summary = asString(item.summary);
    const evidence = resolveEvidence(item, context).filter((entry) => (
      !entry.steamId || entry.steamId === steamId || entry.side === side
    ));
    if (!side || !kind || !SIGNAL_KINDS.has(kind) || kind === 'watch' || !title || !summary || !evidence.length) continue;
    if (!signalMeetsRules(kind, evidence, steamId)) continue;
    if (sideCounts[side] >= 2 || result.length >= 4) continue;
    sideCounts[side]++;
    seen.add(steamId);
    result.push({
      steamId,
      nickname: rosterPlayer?.nickname ?? asString(item.nickname) ?? steamId,
      side,
      kind,
      impact: impactValue(item.impact),
      title: contextText(title, context, 16),
      summary: contextText(summary, context, 64),
      evidence,
      source: 'model',
    });
  }
  return result.sort((a, b) => b.impact - a.impact);
}

function normalizeClaims(raw: unknown, context?: AiAnalysisContext): AiEvidenceClaim[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const item = asRecord(value);
    const text = asString(item?.text);
    const evidence = item ? resolveEvidence(item, context) : [];
    return text && evidence.length ? [{ text: contextText(text, context, 64), evidence }] : [];
  }).slice(0, 2);
}

function normalizeTeamPlans(raw: unknown, context?: AiAnalysisContext): { A: AiTeamPlan; B: AiTeamPlan } {
  const plans = asRecord(raw);
  const parseSide = (side: 'A' | 'B'): AiTeamPlan => {
    const item = asRecord(plans?.[side]);
    return {
      winConditions: normalizeClaims(item?.winConditions, context),
      risks: normalizeClaims(item?.risks, context),
    };
  };
  return { A: parseSide('A'), B: parseSide('B') };
}

function factorDimension(type: AiFactorType | string | undefined): AiMatchupDimension {
  if (type === 'map') return 'map';
  if (type === 'party') return 'party';
  if (type === 'form') return 'form';
  return 'strength';
}

function legacySignal(
  item: JsonRecord,
  context: AiAnalysisContext | undefined,
  kind: AiPlayerSignalKind,
): AiPlayerSignal | null {
  const steamId = asString(item.steamId);
  const rosterPlayer = steamId ? context?.roster.get(steamId) : undefined;
  if (context && !rosterPlayer) return null;
  const side = rosterPlayer?.side ?? (item.side === 'A' || item.side === 'B' ? item.side : undefined);
  const summary = asString(item.summary) ?? asString(item.text);
  if (!steamId || !side || !summary) return null;
  return {
    steamId,
    nickname: rosterPlayer?.nickname ?? asString(item.nickname) ?? steamId,
    side,
    kind,
    impact: impactValue(item.impact ?? 2),
    title: contextText(asString(item.title) ?? (kind === 'weakLink' ? '历史风险点' : '历史重点玩家'), context, 24),
    summary: contextText(summary, context, 80),
    evidence: resolveEvidence(item, context),
    source: 'legacy',
  };
}

function capLegacySignals(signals: AiPlayerSignal[]): AiPlayerSignal[] {
  const sideCounts = { A: 0, B: 0 };
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (seen.has(signal.steamId) || sideCounts[signal.side] >= 2 || seen.size >= 4) return false;
    seen.add(signal.steamId);
    sideCounts[signal.side]++;
    return true;
  });
}

function convertV2(raw: JsonRecord, context?: AiAnalysisContext): AiAnalysisResult {
  const modelProbability = normalizeProbability(raw.modelWinProbability ?? raw.winProbability);
  const dataCoverage = clamp(context?.dataCoverage ?? asNumber(raw.dataCoverage) ?? 1, 0, 1);
  const storedProbability = normalizeProbability(raw.winProbability ?? modelProbability);
  const probability = context ? calibrateWinProbability(modelProbability, dataCoverage) : storedProbability;
  const markerMap: Record<string, AiPlayerSignalKind> = {
    threat: 'carry',
    risk: 'weakLink',
    key: 'watch',
  };
  const playerSignals = capLegacySignals((Array.isArray(raw.playerMarkers) ? raw.playerMarkers : []).flatMap((value) => {
    const item = asRecord(value);
    if (!item) return [];
    const kind = markerMap[asString(item.kind) ?? ''] ?? 'watch';
    const signal = legacySignal(item, context, kind);
    return signal ? [signal] : [];
  }));
  const decisiveFactors = (Array.isArray(raw.matchupEdges) ? raw.matchupEdges : []).flatMap((value, index) => {
    const item = asRecord(value);
    const title = asString(item?.title);
    const summary = asString(item?.summary);
    const dimension = asString(item?.dimension);
    if (!item || !title || !summary || !dimension || !DIMENSIONS.has(dimension as AiMatchupDimension)) return [];
    return [{
      id: asString(item.id) ?? `v2-factor-${index}`,
      dimension: dimension as AiMatchupDimension,
      advantage: item.advantage === 'A' || item.advantage === 'B' ? item.advantage : 'Even',
      impact: impactValue(item.impact),
      title: contextText(title, context, 24),
      summary: contextText(summary, context, 80),
      evidence: resolveEvidence(item, context),
    } satisfies AiDecisiveFactor];
  }).slice(0, 4);
  const conditions = asRecord(raw.winConditions);
  const legacyClaims = (side: 'A' | 'B') => {
    const values = Array.isArray(conditions?.[side]) ? conditions[side] as unknown[] : [];
    return values.flatMap((value) => {
      const item = asRecord(value);
      const text = asString(item?.text);
      return text ? [{ text: contextText(text, context, 80), evidence: item ? resolveEvidence(item, context) : [] }] : [];
    }).slice(0, 2);
  };
  return {
    schemaVersion: 3,
    predictedWinner: normalizedWinner(probability),
    modelWinProbability: modelProbability,
    winProbability: probability,
    confidence: context
      ? round(dataCoverage * 70 + clamp(asNumber(raw.confidence) ?? 0, 0, 100) * 0.3)
      : clamp(asNumber(raw.confidence) ?? 0, 0, 100),
    dataCoverage,
    headline: contextText(asString(raw.headline) ?? '历史 AI 分析', context, 64),
    decisiveFactors,
    playerSignals,
    teamPlans: {
      A: { winConditions: legacyClaims('A'), risks: [] },
      B: { winConditions: legacyClaims('B'), risks: [] },
    },
    uncertainties: [...new Set([...contextTextArray(raw.uncertainties ?? raw.risks, context), ...(context?.localUncertainties ?? [])])].slice(0, 4),
    inputFingerprint: context?.inputFingerprint ?? asString(raw.inputFingerprint),
    dataQuality: context?.dataQuality ?? asString(raw.dataQuality) ?? `数据覆盖 ${Math.round(dataCoverage * 100)}%`,
  };
}

function convertV1(raw: JsonRecord, context?: AiAnalysisContext): AiAnalysisResult {
  const probability = normalizeProbability(raw.winProbability);
  const playerSignals = capLegacySignals((Array.isArray(raw.playerNotes) ? raw.playerNotes : []).flatMap((value) => {
    const item = asRecord(value);
    if (!item) return [];
    const signal = legacySignal(item, context, item.role === 'risk' ? 'weakLink' : 'watch');
    return signal ? [signal] : [];
  }));
  const decisiveFactors = (Array.isArray(raw.keyFactors) ? raw.keyFactors : []).flatMap((value, index) => {
    const item = asRecord(value);
    const summary = asString(item?.text);
    if (!item || !summary) return [];
    return [{
      id: `v1-factor-${index}`,
      dimension: factorDimension(asString(item.type)),
      advantage: item.side === 'A' || item.side === 'B' ? item.side : 'Even',
      impact: impactValue((asNumber(item.weight) ?? 0.5) * 3),
      title: '历史分析依据',
      summary: contextText(summary, context, 80),
      evidence: [],
    } satisfies AiDecisiveFactor];
  }).slice(0, 4);
  const summaries = asRecord(raw.teamSummary);
  const plan = (side: 'A' | 'B'): AiTeamPlan => {
    const text = asString(summaries?.[side]);
    return { winConditions: text ? [{ text: contextText(text, context, 80), evidence: [] }] : [], risks: [] };
  };
  return {
    schemaVersion: 3,
    predictedWinner: raw.predictedWinner === 'A' || raw.predictedWinner === 'B' || raw.predictedWinner === 'Even' || raw.predictedWinner === 'Unknown'
      ? raw.predictedWinner
      : normalizedWinner(probability),
    modelWinProbability: probability,
    winProbability: probability,
    confidence: clamp(asNumber(raw.confidence) ?? 0, 0, 100),
    dataCoverage: clamp(context?.dataCoverage ?? asNumber(raw.dataCoverage) ?? 1, 0, 1),
    headline: contextText(asString(raw.headline) ?? '历史 AI 分析', context, 64),
    decisiveFactors,
    playerSignals,
    teamPlans: { A: plan('A'), B: plan('B') },
    uncertainties: [...new Set([...contextTextArray(raw.risks, context), ...(context?.localUncertainties ?? [])])].slice(0, 4),
    inputFingerprint: context?.inputFingerprint,
    dataQuality: context?.dataQuality ?? contextText(asString(raw.dataQuality) ?? '', context, 96),
  };
}

export function normalizeAiAnalysisResult(raw: unknown, context?: AiAnalysisContext): AiAnalysisResult | null {
  const record = asRecord(raw);
  if (!record) return null;
  if (record.schemaVersion === 2 || Array.isArray(record.playerMarkers) || Array.isArray(record.matchupEdges)) {
    return convertV2(record, context);
  }
  if (record.schemaVersion !== 3 && !Array.isArray(record.playerSignals) && !Array.isArray(record.decisiveFactors)) {
    return convertV1(record, context);
  }

  const modelProbability = normalizeProbability(record.modelWinProbability ?? record.winProbability);
  const dataCoverage = clamp(context?.dataCoverage ?? asNumber(record.dataCoverage) ?? 1, 0, 1);
  const probability = context
    ? calibrateWinProbability(modelProbability, dataCoverage)
    : normalizeProbability(record.winProbability ?? modelProbability);
  const modelConfidence = clamp(asNumber(record.confidence) ?? 0, 0, 100);
  return {
    schemaVersion: 3,
    predictedWinner: normalizedWinner(probability),
    modelWinProbability: modelProbability,
    winProbability: probability,
    confidence: context ? round(dataCoverage * 70 + modelConfidence * 0.3) : modelConfidence,
    dataCoverage,
    headline: contextText(asString(record.headline) ?? '双方数据接近', context, 64),
    decisiveFactors: normalizeFactors(record.decisiveFactors, context),
    playerSignals: normalizeSignals(record.playerSignals, context),
    teamPlans: normalizeTeamPlans(record.teamPlans, context),
    uncertainties: [...new Set([...contextTextArray(record.uncertainties, context), ...(context?.localUncertainties ?? [])])].slice(0, 4),
    inputFingerprint: context?.inputFingerprint ?? asString(record.inputFingerprint),
    dataQuality: context?.dataQuality ?? asString(record.dataQuality) ?? `数据覆盖 ${Math.round(dataCoverage * 100)}%`,
  };
}

export function parseAiAnalysisJson(raw: string, context?: AiAnalysisContext): AiAnalysisResult | null {
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, ''));
    return normalizeAiAnalysisResult(parsed, context);
  } catch {
    return null;
  }
}
