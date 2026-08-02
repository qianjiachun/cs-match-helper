import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SubtitleOverlay } from "../shared/components/SubtitleOverlay";
import { theme, type Caption } from "../shared/theme";
import captions from "./captions/zh.json";
import { sceneFrames } from "./meta";
import { CounterStrafeTiming } from "./scenes/CounterStrafeTiming";
import { HookPain } from "./scenes/HookPain";
import { ProductIntro } from "./scenes/ProductIntro";
import { SafetyCta } from "./scenes/SafetyCta";
import { ShootingStability } from "./scenes/ShootingStability";
import { resolveCounterStrafingSubtitleStyle } from "./subtitleStyles";

const captionData = captions as Caption[];

export const CounterStrafingDemo: React.FC = () => {
  const { hook, intro, timing, stability, cta } = sceneFrames;
  const starts = {
    hook: 0,
    intro: hook,
    timing: hook + intro,
    stability: hook + intro + timing,
    cta: hook + intro + timing + stability,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Sequence from={starts.hook} durationInFrames={hook}>
        <HookPain />
      </Sequence>
      <Sequence from={starts.intro} durationInFrames={intro}>
        <ProductIntro />
      </Sequence>
      <Sequence from={starts.timing} durationInFrames={timing}>
        <CounterStrafeTiming />
      </Sequence>
      <Sequence from={starts.stability} durationInFrames={stability}>
        <ShootingStability />
      </Sequence>
      <Sequence from={starts.cta} durationInFrames={cta}>
        <SafetyCta />
      </Sequence>
      <SubtitleOverlay
        captions={captionData}
        resolveStyle={resolveCounterStrafingSubtitleStyle}
      />
    </AbsoluteFill>
  );
};
