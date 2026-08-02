export const FPS = 60;
/** Design-time frame count authored at 30fps → scales to current FPS. */
export const df = (framesAt30: number) => Math.round((framesAt30 * FPS) / 30);
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Brand palette — lifted slate, less near-black */
export const theme = {
  bg: "#1B2A45",
  bgAlt: "#27406A",
  surface: "#35527A",
  grid: "rgba(200, 214, 234, 0.16)",
  text: "#FFFFFF",
  textMuted: "#D0DBEB",
  accent: "#4CC9F0",
  accentWarm: "#FFC857",
  strokeOffset: "#F43F5E",
  stable: "#3DDC97",
  micro: "#FBBF24",
  spray: "#FB7185",
  perfect: "#B794F6",
  good: "#4CC9F0",
  early: "#FBBF24",
  late: "#FB7185",
  subtitleBg: "rgba(40, 58, 88, 0.78)",
  subtitleBorder: "rgba(200, 214, 234, 0.32)",
} as const;

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
};
