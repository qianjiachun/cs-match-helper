import React from "react";
import { AbsoluteFill } from "remotion";
import { StabilityBars } from "./components/StabilityBars";
import { SubtitleOverlay } from "../shared/components/SubtitleOverlay";
import { VoxBackground } from "../shared/components/VoxBackground";
import { VoxTitle } from "../shared/components/VoxTitle";
import captions from "./captions/zh.json";
import { FPS, df, theme, type Caption } from "../shared/theme";
import { sceneFrames } from "./meta";

const STABILITY_START_MS =
  ((sceneFrames.hook + sceneFrames.intro + sceneFrames.timing) / FPS) * 1000;
const STABILITY_END_MS =
  STABILITY_START_MS + (sceneFrames.stability / FPS) * 1000;

/** Vertical slice: shooting-error demo + related captions */
export const StabilitySlice: React.FC = () => {
  const sliceCaptions = (captions as Caption[]).filter(
    (c) => c.startMs >= STABILITY_START_MS && c.startMs < STABILITY_END_MS,
  );
  const remapped = sliceCaptions.map((c) => ({
    ...c,
    startMs: c.startMs - STABILITY_START_MS,
    endMs: c.endMs - STABILITY_START_MS,
  }));

  return (
    <AbsoluteFill>
      <VoxBackground variant="warm" />
      <AbsoluteFill style={{ padding: "56px 100px" }}>
        <VoxTitle size={56}>开枪稳定</VoxTitle>
        <div style={{ height: 4 }} />
        <VoxTitle size={34} delay={df(4)} accent={theme.stable}>
          开火瞬间 → 是否稳定当场可见
        </VoxTitle>
      </AbsoluteFill>
      <AbsoluteFill style={{ top: 16 }}>
        <StabilityBars delay={df(6)} />
      </AbsoluteFill>
      <SubtitleOverlay captions={remapped} />
    </AbsoluteFill>
  );
};
