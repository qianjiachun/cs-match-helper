import type { FC } from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH } from "../shared/theme";
import { CounterStrafingDemo } from "./composition";
import {
  COMPOSITION_ID,
  DURATION_FRAMES,
  STABILITY_SLICE_FRAMES,
  STABILITY_SLICE_ID,
} from "./meta";
import { StabilitySlice } from "./StabilitySlice";

/** Registers compositions that belong to the counter-strafing topic */
export const CounterStrafingCompositions: FC = () => {
  return (
    <>
      <Composition
        id={COMPOSITION_ID}
        component={CounterStrafingDemo}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id={STABILITY_SLICE_ID}
        component={StabilitySlice}
        durationInFrames={STABILITY_SLICE_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
