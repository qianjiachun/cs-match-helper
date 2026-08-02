import React from "react";
import { Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fonts } from "../fonts";
import { theme } from "../theme";

type Props = {
  /** Resolved asset URL (import result), not a public/ path */
  src: string;
  label?: string;
  delay?: number;
  width?: number;
  rotate?: number;
};

export const UiCallout: React.FC<Props> = ({
  src,
  label,
  delay = 0,
  width = 980,
  rotate = -1.5,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.6 },
  });

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${(1 - enter) * 36}px) rotate(${rotate}deg) scale(${0.94 + enter * 0.06})`,
        width,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 10,
          backgroundColor: theme.strokeOffset,
          borderRadius: 18,
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.14), 0 20px 40px rgba(0,0,0,0.4)",
          backgroundColor: theme.surface,
          outline: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <Img src={src} style={{ width: "100%", display: "block" }} />
      </div>
      {label ? (
        <div
          style={{
            position: "absolute",
            top: -16,
            left: 20,
            zIndex: 2,
            padding: "8px 14px",
            backgroundColor: theme.accent,
            color: theme.bg,
            fontFamily: fonts.body,
            fontWeight: 800,
            fontSize: 20,
            borderRadius: 10,
            boxShadow: "3px 3px 0 rgba(0,0,0,0.25)",
            opacity: enter,
            transform: `scale(${0.85 + enter * 0.15})`,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
