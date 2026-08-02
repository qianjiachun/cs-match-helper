import { FPS } from "../shared/theme";

export const COMPOSITION_ID = "CounterStrafingDemo";
export const STABILITY_SLICE_ID = "StabilitySlice";

/**
 * hook → intro → timing → stability → cta
 * ~33s (VO-aligned)
 */
export const sceneFrames = {
  hook: 4 * FPS,
  intro: 7 * FPS,
  timing: 8 * FPS,
  stability: 7 * FPS,
  cta: 7 * FPS,
} as const;

export const DURATION_FRAMES =
  sceneFrames.hook +
  sceneFrames.intro +
  sceneFrames.timing +
  sceneFrames.stability +
  sceneFrames.cta;

export const STABILITY_SLICE_FRAMES = sceneFrames.stability;
