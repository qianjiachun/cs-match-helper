/** 与 cs-match-hud 首页预览同源的演示数据与几何，不引入 HUD 核心模块或本地地图贴图。 */

export const CS_MAP_BACKGROUNDS = [
  'https://www.csgo.com.cn/images/maps/jianying/map_nuke.jpg',
  'https://www.csgo.com.cn/images/maps/jianying/map_mirage.jpg',
  'https://www.csgo.com.cn/images/maps/jianying/map_inferno.jpg',
  'https://www.csgo.com.cn/images/maps/jianying/map_ancient.jpg',
  'https://www.csgo.com.cn/images/maps/jianying/map_anubis.jpg',
  'https://www.csgo.com.cn/images/maps/jianying/map_dust2.jpg',
] as const;

export const ASSESSMENT_DIFF_SEQUENCE = [
  -72.4, -21.7, -8.6, 1.1, 7.8, 46, -15.6, 2, -1.5, 9.4, -96.2, 28.8,
  0.7, -13.1, 6.4, 82, -24.7, 4.2, 1.8, -53.6, 8.9, -5.4, 38.1, -0.3,
] as const;

export const SHOT_SPEED_SEQUENCE = [
  0.48, 0.72, 0.31, 1.08, 0.66, 1.42, 0.83, 0.24, 1.76, 0.58,
  0.91, 1.18, 0.45, 0.36, 1.51, 0.78, 0.27, 1.03, 0.62, 0.41,
] as const;

export const ASSESSMENT_COLORS = {
  perfect: '#5eead4',
  success: '#4ade80',
  early: '#fbbf24',
  late: '#f87171',
} as const;

export const SHOT_BAR_COLORS = {
  stable: '#4ade80',
  micro: '#fbbf24',
  run: '#f87171',
  threshold: 'rgba(255,255,255,0.22)',
} as const;

export const PERFECT_THRESHOLD_MS = 12;
export const SUCCESS_THRESHOLD_MS = 36;
export const RECOIL_STROKE = '#4ADE80';

export type AssessmentSample = {
  diffMs: number;
  fromKey: string;
  toKey: string;
  color: string;
  labelZh: string;
  labelEn: string;
};

export type ShotSample = {
  speedRatio: number;
  greenRatio: number;
  yellowRatio: number;
  redRatio: number;
  isTapFirst: boolean;
};

export type AirDirectionState =
  | 'idle'
  | 'belowThreshold'
  | 'noKey'
  | 'leftMatched'
  | 'rightMatched'
  | 'leftOpposed'
  | 'rightOpposed'
  | 'bothKeys';

export type AirSegment = { durationMs: number; state: AirDirectionState };

const AIR_WINDOW_MS = 755;

export const DEMO_AIR_JUMPS: readonly AirSegment[][] = [
  [
    { durationMs: 24, state: 'belowThreshold' },
    { durationMs: 226, state: 'rightMatched' },
    { durationMs: 28, state: 'rightOpposed' },
    { durationMs: 218, state: 'leftMatched' },
    { durationMs: 32, state: 'leftOpposed' },
    { durationMs: 227, state: 'rightMatched' },
  ],
  [
    { durationMs: 18, state: 'noKey' },
    { durationMs: 140, state: 'leftMatched' },
    { durationMs: 70, state: 'leftOpposed' },
    { durationMs: 50, state: 'bothKeys' },
    { durationMs: 150, state: 'rightMatched' },
    { durationMs: 55, state: 'rightOpposed' },
    { durationMs: 272, state: 'leftMatched' },
  ],
];

export function pickRandomMapBackground(): string {
  return CS_MAP_BACKGROUNDS[Math.floor(Math.random() * CS_MAP_BACKGROUNDS.length)]
    ?? CS_MAP_BACKGROUNDS[0];
}

export function createAssessmentSample(diffMs: number, index: number): AssessmentSample {
  const abs = Math.abs(diffMs);
  const isPerfect = abs <= PERFECT_THRESHOLD_MS;
  const isSuccess = abs <= SUCCESS_THRESHOLD_MS;
  const early = diffMs < 0;
  const color = isPerfect
    ? ASSESSMENT_COLORS.perfect
    : isSuccess
      ? ASSESSMENT_COLORS.success
      : early
        ? ASSESSMENT_COLORS.early
        : ASSESSMENT_COLORS.late;
  const labelZh = isPerfect ? '完美' : isSuccess ? '优秀' : early ? '偏早' : '偏晚';
  const labelEn = isPerfect ? 'Perfect' : isSuccess ? 'Good' : early ? 'Early' : 'Late';
  const horizontal = index % 3 !== 2;
  return {
    diffMs: Math.round(diffMs * 10) / 10,
    fromKey: horizontal ? (index % 2 === 0 ? 'A' : 'D') : (index % 2 === 0 ? 'W' : 'S'),
    toKey: horizontal ? (index % 2 === 0 ? 'D' : 'A') : (index % 2 === 0 ? 'S' : 'W'),
    color,
    labelZh,
    labelEn,
  };
}

export function createShotSample(speedRatio: number, index: number): ShotSample {
  const thresholdLine = 0.5;
  const upperZone = 1 - thresholdLine;
  let greenRatio = 0;
  let yellowRatio = 0;
  let redRatio = 0;
  if (speedRatio <= 1) {
    greenRatio = Math.max(0.12, speedRatio * thresholdLine);
  } else if (speedRatio <= 1.35) {
    greenRatio = thresholdLine;
    const yellowRaw = Math.min(1, Math.max(0, (speedRatio - 1.02) / (1.35 - 1.02)));
    yellowRatio = yellowRaw > 0 ? Math.max(0.08, Math.sqrt(yellowRaw)) * upperZone : 0;
  } else {
    const severity = Math.max(
      0.08,
      Math.min(1, (speedRatio - 1.5) / (1.8 - 1.5)),
    );
    redRatio = Math.max(0.12, thresholdLine + severity * upperZone);
  }
  return {
    speedRatio,
    greenRatio,
    yellowRatio,
    redRatio,
    isTapFirst: index % 5 !== 4,
  };
}

export function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function createRecoilPreviewPoints(xScale: number, yScale: number, phase: number) {
  return Array.from({ length: 64 }, (_, index) => {
    const t = index / 63;
    return {
      x: (Math.sin(t * 9 + phase) * (0.2 + t) - Math.sin(phase) * 0.2) * xScale + Math.sin(t * 21) * 32,
      y: t * yScale + (Math.sin(t * 13 + phase) - Math.sin(phase)) * 28,
    };
  });
}

export function previewLoopProgress(
  elapsedMs: number,
  drawDurationMs: number,
  holdDurationMs: number,
) {
  const draw = Math.max(1, drawDurationMs);
  const cycle = draw + Math.max(0, holdDurationMs);
  const position = ((elapsedMs % cycle) + cycle) % cycle;
  return Math.min(1, position / draw);
}

function turnDirection(state: AirDirectionState): -1 | 0 | 1 {
  if (state === 'leftMatched' || state === 'leftOpposed') return -1;
  if (state === 'rightMatched' || state === 'rightOpposed') return 1;
  return 0;
}

export function scoreAirJump(segments: readonly AirSegment[], elapsedMs: number) {
  const capped = Math.min(AIR_WINDOW_MS, Math.max(0, elapsedMs));
  let matchedMs = 0;
  let validTurnMs = 0;
  let consumed = 0;
  let state: AirDirectionState = segments[0]?.state ?? 'idle';
  let previousDirection: -1 | 0 | 1 = 0;
  let pendingSwitchMs: number | null = null;
  let pendingAccel = false;
  let accelCount = 0;
  const switchErrors: number[] = [];

  for (const segment of segments) {
    const used = Math.min(segment.durationMs, capped - consumed);
    if (used <= 0) break;
    state = segment.state;
    const direction = turnDirection(segment.state);
    if (direction !== 0 && direction !== previousDirection) {
      if (pendingSwitchMs != null) switchErrors.push(pendingSwitchMs);
      previousDirection = direction;
      pendingSwitchMs = 0;
      pendingAccel = true;
    }
    if (state !== 'idle' && state !== 'belowThreshold') validTurnMs += used;
    if (state === 'leftMatched' || state === 'rightMatched') {
      matchedMs += used;
      if (pendingAccel) {
        accelCount += 1;
        pendingAccel = false;
      }
      if (pendingSwitchMs != null) {
        switchErrors.push(pendingSwitchMs);
        pendingSwitchMs = null;
      }
    } else if (pendingSwitchMs != null) {
      pendingSwitchMs += used;
    }
    consumed += used;
  }
  if (pendingSwitchMs != null && capped >= AIR_WINDOW_MS) switchErrors.push(pendingSwitchMs);

  return {
    state,
    syncRate: matchedMs / Math.max(8, capped),
    coverageRate: validTurnMs / Math.max(8, capped),
    accelCount,
    switchErrorMs: switchErrors.length === 0
      ? 0
      : switchErrors.reduce((sum, value) => sum + value, 0) / switchErrors.length,
  };
}

export const AIR_WINDOW_MS_VALUE = AIR_WINDOW_MS;
export const AIR_HOLD_MS = 680;
export const DEMO_AIR_SCORES = DEMO_AIR_JUMPS.map((segments) => scoreAirJump(segments, AIR_WINDOW_MS));
export const DEMO_AIR_CYCLE_MS = AIR_WINDOW_MS + AIR_HOLD_MS;
