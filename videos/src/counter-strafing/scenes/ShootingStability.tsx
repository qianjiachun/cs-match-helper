import React from "react";
import { AbsoluteFill } from "remotion";
import { VoxBackground } from "../../shared/components/VoxBackground";
import { VoxTitle } from "../../shared/components/VoxTitle";
import { theme, df } from "../../shared/theme";
import { StabilityBars } from "../components/StabilityBars";

export const ShootingStability: React.FC = () => {
  return (
    <AbsoluteFill>
      <VoxBackground variant="warm" />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 70% 72% at 50% 58%, rgba(8,14,26,0.4) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
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
    </AbsoluteFill>
  );
};
