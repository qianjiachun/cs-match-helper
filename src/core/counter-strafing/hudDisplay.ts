export const HUD_STAT_TEXT_SCALE_MIN = 0.6;
export const HUD_STAT_TEXT_SCALE_MAX = 1.6;
export const HUD_LINE_STROKE_WIDTH_MIN = 0.5;
export const HUD_LINE_STROKE_WIDTH_MAX = 4;
export const HUD_CHART_OPACITY_MIN = 0.15;
export const HUD_CHART_OPACITY_MAX = 1;

export type HudContentMode = 'all' | 'chartOnly' | 'textOnly';

export const HUD_CONTENT_MODES: HudContentMode[] = ['all', 'chartOnly', 'textOnly'];

export function clampHudContentMode(mode: unknown): HudContentMode {
  if (mode === 'chartOnly' || mode === 'textOnly') return mode;
  return 'all';
}

export function showHudTextContent(mode: HudContentMode): boolean {
  return mode !== 'chartOnly';
}

export function showHudChartContent(mode: HudContentMode): boolean {
  return mode !== 'textOnly';
}

export const HUD_STAT_LABEL_MIN_PX = 7;
export const HUD_STAT_LABEL_MAX_PX = 14;
export const HUD_STAT_VALUE_MIN_PX = 8;
export const HUD_STAT_VALUE_MAX_PX = 16;

export const HUD_STAT_LABEL_BASE_PX = 9;
export const HUD_STAT_VALUE_BASE_PX = 10;

export interface HudStatFontSizes {
  labelPx: number;
  valuePx: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampHudStatTextScale(scale: number): number {
  return clamp(scale, HUD_STAT_TEXT_SCALE_MIN, HUD_STAT_TEXT_SCALE_MAX);
}

export function clampHudLineStrokeWidth(width: number): number {
  return clamp(width, HUD_LINE_STROKE_WIDTH_MIN, HUD_LINE_STROKE_WIDTH_MAX);
}

export function clampHudChartOpacity(opacity: number): number {
  return clamp(opacity, HUD_CHART_OPACITY_MIN, HUD_CHART_OPACITY_MAX);
}

/** 由用户偏好系数计算固定字号（不随窗口尺寸变化） */
export function computeHudStatFontSizes(userScale = 1): HudStatFontSizes {
  const scale = clampHudStatTextScale(userScale);
  return {
    labelPx: clamp(Math.round(HUD_STAT_LABEL_BASE_PX * scale), HUD_STAT_LABEL_MIN_PX, HUD_STAT_LABEL_MAX_PX),
    valuePx: clamp(Math.round(HUD_STAT_VALUE_BASE_PX * scale), HUD_STAT_VALUE_MIN_PX, HUD_STAT_VALUE_MAX_PX),
  };
}
