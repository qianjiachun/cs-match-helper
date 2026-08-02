import React from "react";
import { AbsoluteFill } from "remotion";
import { VoxBackground } from "../../shared/components/VoxBackground";
import { VoxTitle } from "../../shared/components/VoxTitle";
import { KeyTimeline } from "../components/KeyTimeline";
import { df } from "../../shared/theme";

export const CounterStrafeTiming: React.FC = () => {
  return (
    <AbsoluteFill>
      <VoxBackground variant="cool" />
      {/* Soft dim behind the demo so panels don't melt into the glow */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 70% 72% at 50% 62%, rgba(8,14,26,0.42) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill style={{ padding: "48px 100px 0" }}>
        <VoxTitle size={52}>急停评估</VoxTitle>
        <div style={{ height: 2 }} />
        <VoxTitle size={30} delay={df(3)} accent="#5eead4">
          A、D 切换延迟，辅助调节磁轴键程
        </VoxTitle>
      </AbsoluteFill>
      <AbsoluteFill style={{ top: 8 }}>
        <KeyTimeline delay={df(4)} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
