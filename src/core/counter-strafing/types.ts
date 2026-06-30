export type BindingRole = 'forward' | 'back' | 'left' | 'right' | 'crouch' | 'fire';

export type InputBinding =
  | { kind: 'keyboard'; vk: number; label: string }
  | { kind: 'mouse'; button: number; label: string };

export interface CounterStrafingKeyMap {
  forward: InputBinding;
  back: InputBinding;
  left: InputBinding;
  right: InputBinding;
  crouch: InputBinding;
  fire: InputBinding;
}

export type ShootingErrorReason =
  | 'crouching'
  | 'noMovement'
  | 'singleDirectionHeld'
  | 'multipleDirectionsHeld'
  | 'recentStop'
  | 'axisConflict'
  | 'counterStrafeBraking'
  | 'naturalDeceleration'
  | 'crouchGrace'
  | 'lowSpeedMovement';

export type FireSampleKind = 'fireDown' | 'fireHeld';

export interface ShootingErrorRecord {
  error: number;
  scoreLabel: string;
  reason: ShootingErrorReason;
  movementKeysDown: number;
  crouching: boolean;
  lastStopAgeMs: number;
  timingDiffMs: number;
  fireHeld: boolean;
  sampleKind: FireSampleKind;
  isStable: boolean;
  timestampMs: number;
  estimatedSpeed: number;
  accuracyThreshold: number;
  speedRatio: number;
  stopSuccessAgeMs: number;
  counterStrafeActive: boolean;
  axisConflict: boolean;
  fireSampleDelayed?: boolean;
  crouchGraceActive?: boolean;
  shotSequenceIndex?: number;
}

export type HudAnchor =
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight';

export interface CounterStrafingSnapshot {
  active: boolean;
  listening: boolean;
  hudVisible: boolean;
  hudLocked?: boolean;
  hudShowStableBars: boolean;
  shotRecords: ShootingErrorRecord[];
  avgError: number;
  stableRate: number;
  lastShot: ShootingErrorRecord | null;
  capturingBinding?: BindingRole | null;
  fireActive?: boolean;
  assessmentHudVisible?: boolean;
  assessmentHudLocked?: boolean;
}

export type AssessmentAxis = 'horizontal' | 'vertical';
export type AssessmentTiming = 'early' | 'late' | 'perfect';

export interface CounterStrafingAssessmentRecord {
  axis: AssessmentAxis;
  fromKey: string;
  toKey: string;
  diffMs: number;
  timing: AssessmentTiming;
  timingLabel: string;
  isPerfect: boolean;
  isSuccess: boolean;
  timestampMs: number;
}

/** @deprecated use CounterStrafingAssessmentRecord */
export type CounterStrafingRecord = CounterStrafingAssessmentRecord;

export interface CounterStrafingAssessmentSnapshot {
  active: boolean;
  listening: boolean;
  hudVisible: boolean;
  hudLocked?: boolean;
  records: CounterStrafingAssessmentRecord[];
  avgDiffMs: number;
  successRate: number;
  stdDevMs: number;
  tendency: string;
  tendencyLabel: string;
  lastRecord: CounterStrafingAssessmentRecord | null;
}

export interface ShotFeedback {
  kind: SampleState;
  color: string;
  errorPercent: number;
  stabilityPercent: number;
  overspeedPercent: number;
  shortLabel: string;
  detailLabel: string;
}

export interface CounterStrafingSettings {
  enabled: boolean;
  displayMode: string;
  keyMap: CounterStrafingKeyMap;
  stopSettleMs: number;
  cleanShotSpeedRatio: number;
  maxMoveSpeed: number;
  naturalDecelPerSec: number;
  counterStrafeAccelPerSec: number;
  accelPerSec: number;
  fireSampleDelayMs: number;
  tapMaxHoldMs: number;
  autoFireIntervalMs: number;
  crouchReleaseGraceMs: number;
  crouchExitRampMs: number;
  lowSpeedMovementWindowMs: number;
  excellentErrorThreshold: number;
  successErrorThreshold: number;
  historyLimit: number;
  hudVisible: boolean;
  hudLocked?: boolean;
  hudShowStableBars: boolean;
  hudAnchor: HudAnchor;
  hudX?: number | null;
  hudY?: number | null;
  hudWidth?: number | null;
  hudHeight?: number | null;
  assessmentEnabled: boolean;
  assessmentHorizontalEnabled: boolean;
  assessmentVerticalEnabled: boolean;
  assessmentPerfectThresholdMs: number;
  assessmentSuccessThresholdMs: number;
  assessmentHistoryLimit: number;
  assessmentHudVisible: boolean;
  assessmentHudLocked?: boolean;
  assessmentHudAnchor: HudAnchor;
  assessmentHudX?: number | null;
  assessmentHudY?: number | null;
  assessmentHudWidth?: number | null;
  assessmentHudHeight?: number | null;
}

export const DEFAULT_KEY_MAP: CounterStrafingKeyMap = {
  forward: { kind: 'keyboard', vk: 0x57, label: 'W' },
  back: { kind: 'keyboard', vk: 0x53, label: 'S' },
  left: { kind: 'keyboard', vk: 0x41, label: 'A' },
  right: { kind: 'keyboard', vk: 0x44, label: 'D' },
  crouch: { kind: 'keyboard', vk: 0x11, label: 'Ctrl' },
  fire: { kind: 'mouse', button: 0, label: '鼠标左键' },
};

/** 移速模型相关默认值，用于恢复或补全旧配置 */
export const MOVEMENT_MODEL_DEFAULTS: Pick<
  CounterStrafingSettings,
  | 'maxMoveSpeed'
  | 'accelPerSec'
  | 'counterStrafeAccelPerSec'
  | 'naturalDecelPerSec'
  | 'cleanShotSpeedRatio'
  | 'lowSpeedMovementWindowMs'
> = {
  maxMoveSpeed: 1,
  accelPerSec: 5.5,
  counterStrafeAccelPerSec: 14,
  naturalDecelPerSec: 2.5,
  cleanShotSpeedRatio: 0.34,
  lowSpeedMovementWindowMs: 180,
};

export function mergeCounterStrafingSettings(
  loaded: Partial<CounterStrafingSettings>,
): CounterStrafingSettings {
  return {
    ...DEFAULT_COUNTER_STRAFING_SETTINGS,
    ...loaded,
    hudShowStableBars: loaded.hudShowStableBars ?? true,
    assessmentEnabled: loaded.assessmentEnabled ?? true,
    assessmentHorizontalEnabled: loaded.assessmentHorizontalEnabled ?? true,
    assessmentVerticalEnabled: loaded.assessmentVerticalEnabled ?? true,
    assessmentPerfectThresholdMs: loaded.assessmentPerfectThresholdMs ?? 2,
    assessmentSuccessThresholdMs: loaded.assessmentSuccessThresholdMs ?? 10,
    assessmentHistoryLimit: loaded.assessmentHistoryLimit ?? 100,
    assessmentHudVisible: loaded.assessmentHudVisible ?? true,
    assessmentHudLocked: loaded.assessmentHudLocked ?? false,
    assessmentHudAnchor: loaded.assessmentHudAnchor ?? 'bottomCenter',
    keyMap: {
      ...DEFAULT_KEY_MAP,
      ...loaded.keyMap,
    },
  };
}

export const DEFAULT_COUNTER_STRAFING_SETTINGS: CounterStrafingSettings = {
  enabled: false,
  displayMode: 'transparentWindow',
  keyMap: DEFAULT_KEY_MAP,
  stopSettleMs: 110,
  cleanShotSpeedRatio: 0.34,
  maxMoveSpeed: 1,
  naturalDecelPerSec: 2.5,
  counterStrafeAccelPerSec: 14,
  accelPerSec: 5.5,
  fireSampleDelayMs: 18,
  tapMaxHoldMs: 90,
  autoFireIntervalMs: 100,
  crouchReleaseGraceMs: 45,
  crouchExitRampMs: 90,
  lowSpeedMovementWindowMs: 180,
  excellentErrorThreshold: 0.15,
  successErrorThreshold: 0.35,
  historyLimit: 100,
  hudVisible: true,
  hudLocked: false,
  hudShowStableBars: true,
  hudAnchor: 'topCenter',
  hudX: null,
  hudY: null,
  hudWidth: null,
  hudHeight: null,
  assessmentEnabled: true,
  assessmentHorizontalEnabled: true,
  assessmentVerticalEnabled: true,
  assessmentPerfectThresholdMs: 2,
  assessmentSuccessThresholdMs: 10,
  assessmentHistoryLimit: 100,
  assessmentHudVisible: true,
  assessmentHudLocked: false,
  assessmentHudAnchor: 'bottomCenter',
  assessmentHudX: null,
  assessmentHudY: null,
  assessmentHudWidth: null,
  assessmentHudHeight: null,
};

export const BINDING_ROLE_LABELS: Record<BindingRole, string> = {
  forward: '前进',
  back: '后退',
  left: '左移',
  right: '右移',
  crouch: '蹲',
  fire: '开火',
};

export type SampleState = 'stable' | 'micro' | 'run';

export function sampleState(record: ShootingErrorRecord): SampleState {
  if (record.crouchGraceActive || record.reason === 'crouchGrace') return 'stable';
  if (record.reason === 'lowSpeedMovement' || record.speedRatio <= 1) return 'stable';
  if (record.axisConflict || record.speedRatio > 1.5) return 'run';
  if (record.speedRatio > 1) return 'micro';
  return 'run';
}

export function sampleStateColor(record: ShootingErrorRecord): string {
  const state = sampleState(record);
  if (state === 'stable') return '#4ade80';
  if (state === 'micro') return '#fbbf24';
  return '#f87171';
}

export function sampleStateLabel(state: SampleState): string {
  if (state === 'stable') return '稳定';
  if (state === 'micro') return '微动';
  return '跑打';
}

export function formatSampleKind(record: ShootingErrorRecord): string {
  if (record.sampleKind === 'fireHeld') return '连发采样';
  if (record.fireSampleDelayed) return '延迟首发';
  return '单点首发';
}

export function sampleColor(record: ShootingErrorRecord): string {
  return sampleStateColor(record);
}

/** @deprecated use sampleStateColor */
export function errorColor(error: number, isStable: boolean): string {
  if (error <= 0.05) return '#4ade80';
  if (isStable) return '#fbbf24';
  return '#f87171';
}

export function formatErrorValue(error: number): string {
  return error.toFixed(2);
}

export function formatSpeedRatio(record: ShootingErrorRecord): string {
  return `${record.speedRatio.toFixed(2)}x`;
}

export function formatStopTiming(record: ShootingErrorRecord): string {
  if (record.crouchGraceActive || record.reason === 'crouchGrace') return '蹲起窗口';
  if (record.reason === 'lowSpeedMovement') {
    if (record.axisConflict) return '低速摆动';
    if (record.movementKeysDown > 0) return '低速准星';
    return '起步低速';
  }
  if (record.axisConflict) return '方向冲突';
  if (record.counterStrafeActive && record.speedRatio > 1) return '反向急停中';
  if (record.reason === 'naturalDeceleration' && record.speedRatio > 1) return '自然减速';
  if (record.movementKeysDown > 0 && record.speedRatio > 1) return '移动中';
  if (record.stopSuccessAgeMs > 0) return `已停稳 +${Math.round(record.stopSuccessAgeMs)}ms`;
  const ms = Math.abs(Math.round(record.timingDiffMs));
  if (record.timingDiffMs < 0) return `提前 ${ms}ms`;
  if (record.timingDiffMs > 0) return `停稳 +${ms}ms`;
  return '刚好停稳';
}

export function formatTimingDiff(record: ShootingErrorRecord): string {
  return formatStopTiming(record);
}

export function sampleStatusLabel(record: ShootingErrorRecord): string {
  return record.scoreLabel;
}

export function speedMarkerY(blockH: number, speedRatio: number): number {
  const clamped = Math.min(2, Math.max(0, speedRatio));
  const normalized = clamped / 2;
  return blockH - 4 - normalized * (blockH - 8);
}

/** 将 speedRatio / error 转为 HUD 与设置页共用的余量/误差文案 */
export function shotFeedback(record: ShootingErrorRecord): ShotFeedback {
  const kind = sampleState(record);
  const color = sampleStateColor(record);
  const errorPercent = Math.round(record.error * 100);
  const stabilityPercent = Math.round(Math.max(0, 1 - record.speedRatio) * 100);
  const overspeedPercent = Math.round(Math.max(0, record.speedRatio - 1) * 100);

  if (kind === 'stable') {
    return {
      kind,
      color,
      errorPercent: 0,
      stabilityPercent,
      overspeedPercent: 0,
      shortLabel: `稳 ${stabilityPercent}%`,
      detailLabel: `稳定余量 ${stabilityPercent}%`,
    };
  }

  if (kind === 'micro') {
    const pct = errorPercent > 0 ? errorPercent : overspeedPercent;
    return {
      kind,
      color,
      errorPercent: pct,
      stabilityPercent: 0,
      overspeedPercent,
      shortLabel: `误差 ${pct}%`,
      detailLabel: `超速误差 ${pct}%`,
    };
  }

  const pct = errorPercent >= 100 ? 100 : Math.max(errorPercent, overspeedPercent);
  return {
    kind,
    color,
    errorPercent: pct,
    stabilityPercent: 0,
    overspeedPercent,
    shortLabel: pct >= 100 ? '跑打 100%' : `误差 ${pct}%`,
    detailLabel: `超速误差 ${pct}%`,
  };
}

/** 柱状图高度：稳定顶满柱高，超速同样顶满（由颜色区分状态） */
export function barHeightRatio(_speedRatio: number): number {
  return 1;
}

export const ASSESSMENT_COLORS = {
  perfect: '#5eead4',
  success: '#4ade80',
  early: '#fbbf24',
  late: '#f87171',
} as const;

export function formatDiffMs(diffMs: number): string {
  return `${diffMs > 0 ? '+' : ''}${diffMs.toFixed(1)}ms`;
}

export function assessmentRecordColor(record: CounterStrafingAssessmentRecord): string {
  if (record.isPerfect || record.timing === 'perfect') return ASSESSMENT_COLORS.perfect;
  if (record.isSuccess) return ASSESSMENT_COLORS.success;
  if (record.timing === 'early') return ASSESSMENT_COLORS.early;
  return ASSESSMENT_COLORS.late;
}

export function timingColor(
  timing: AssessmentTiming,
  isPerfect: boolean,
  isSuccess = false,
): string {
  if (isPerfect || timing === 'perfect') return ASSESSMENT_COLORS.perfect;
  if (isSuccess) return ASSESSMENT_COLORS.success;
  if (timing === 'early') return ASSESSMENT_COLORS.early;
  return ASSESSMENT_COLORS.late;
}

export function comboLabel(record: CounterStrafingAssessmentRecord): string {
  if (record.isPerfect || record.timing === 'perfect') return '完美';
  if (record.isSuccess) return '优秀';
  if (record.timing === 'early') return '偏早';
  return '偏晚';
}
