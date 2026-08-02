import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fonts } from "../fonts";
import { df, theme } from "../theme";

type Props = {
  children: React.ReactNode;
  delay?: number;
  accent?: string;
  size?: number;
};

export const VoxTitle: React.FC<Props> = ({
  children,
  delay = 0,
  accent = theme.strokeOffset,
  size = 92,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = Math.max(0, frame - delay);

  const enter = spring({
    frame: t,
    fps,
    config: { damping: 14, stiffness: 160, mass: 0.55 },
  });
  const opacity = interpolate(t, [0, df(8)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const enterBlur = interpolate(t, [0, df(10)], [6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0, 0, 1),
  });

  const sharedType: React.CSSProperties = {
    fontFamily: fonts.body,
    fontSize: size,
    fontWeight: 900,
    whiteSpace: "pre-wrap",
    lineHeight: 1.06,
    letterSpacing: size >= 56 ? "-0.04em" : "-0.02em",
    textWrap: "balance",
    WebkitFontSmoothing: "antialiased",
  };

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        opacity,
        transform: `translateY(${(1 - enter) * 22}px) scale(${0.92 + enter * 0.08})`,
        filter: enterBlur > 0.15 ? `blur(${enterBlur}px)` : undefined,
      }}
    >
      <div
        aria-hidden
        style={{
          ...sharedType,
          position: "absolute",
          inset: 0,
          color: accent,
          opacity: 0.5,
          filter: "blur(16px)",
          transform: "translate(0px, 3px)",
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
      <div
        style={{
          ...sharedType,
          position: "relative",
          color: `color-mix(in srgb, ${theme.text} 82%, ${accent} 18%)`,
          textShadow: `
            0 2px 0 rgba(0,0,0,0.12),
            0 8px 28px rgba(0,0,0,0.22),
            0 0 28px ${accent}55
          `,
        }}
      >
        {children}
      </div>
    </div>
  );
};
