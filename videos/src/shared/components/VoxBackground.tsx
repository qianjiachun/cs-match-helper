import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { df, theme } from "../theme";

export const VoxBackground: React.FC<{ variant?: "default" | "warm" | "cool" }> = ({
  variant = "default",
}) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, df(300)], [0, 24], {
    extrapolateRight: "extend",
  });
  const pulse = interpolate(frame % df(90), [0, df(45), df(90)], [0.28, 0.42, 0.28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glow =
    variant === "warm"
      ? `radial-gradient(ellipse at ${22 + drift * 0.1}% 18%, rgba(255, 200, 87, ${pulse + 0.08}), transparent 58%)`
      : variant === "cool"
        ? `radial-gradient(ellipse at ${78 - drift * 0.08}% 12%, rgba(76, 201, 240, ${pulse + 0.1}), transparent 55%)`
        : `radial-gradient(ellipse at ${68 + Math.sin(frame / df(40)) * 4}% 8%, rgba(183, 148, 246, ${pulse + 0.06}), transparent 50%)`;

  const secondary =
    variant === "warm"
      ? `radial-gradient(ellipse at 82% 78%, rgba(244, 63, 94, 0.18), transparent 48%)`
      : variant === "cool"
        ? `radial-gradient(ellipse at 16% 72%, rgba(61, 220, 151, 0.18), transparent 48%)`
        : `radial-gradient(ellipse at 18% 70%, rgba(76, 201, 240, 0.16), transparent 48%)`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        backgroundImage: `
          ${glow},
          ${secondary},
          linear-gradient(155deg, ${theme.bg} 0%, ${theme.bgAlt} 48%, #3A5A88 100%),
          linear-gradient(${theme.grid} 1px, transparent 1px),
          linear-gradient(90deg, ${theme.grid} 1px, transparent 1px)
        `,
        backgroundSize: `auto, auto, auto, 56px 56px, 56px 56px`,
        backgroundPosition: `0 0, 0 0, 0 0, ${drift}px ${drift * 0.6}px, ${drift}px ${drift * 0.6}px`,
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 62%, rgba(18, 30, 52, 0.14) 100%)",
          opacity: interpolate(frame, [0, df(20)], [0.35, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          }),
        }}
      />
    </AbsoluteFill>
  );
};
