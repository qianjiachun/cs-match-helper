import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "../../shared/fonts";
import { df, theme } from "../../shared/theme";
import appIcon from "../../shared/assets/app-icon.svg";

const FEATURES = [
  { label: "极致轻量", accent: theme.accent },
  { label: "开箱即用", accent: theme.accentWarm },
  { label: "安全可信", accent: theme.stable },
  { label: "完全开源", accent: theme.perfect },
] as const;

/** Closing CTA — centered stack, no GitHub URL */
export const SafetyCta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 140, mass: 0.55 },
  });
  const titleIn = spring({
    frame: Math.max(0, frame - df(8)),
    fps,
    config: { damping: 15, stiffness: 130, mass: 0.55 },
  });
  const subIn = interpolate(frame, [df(22), df(36)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  const ctaIn = spring({
    frame: Math.max(0, frame - df(55)),
    fps,
    config: { damping: 14, stiffness: 150, mass: 0.5 },
  });

  const glowPulse = interpolate(frame % df(60), [0, df(30), df(60)], [0.22, 0.34, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(ellipse 55% 50% at 50% 42%, rgba(76,201,240,${glowPulse}), transparent 60%),
            radial-gradient(ellipse 40% 35% at 50% 55%, rgba(61,220,151,0.18), transparent 55%),
            radial-gradient(ellipse 35% 30% at 80% 20%, rgba(183,148,246,0.16), transparent 50%),
            linear-gradient(165deg, #1E3050 0%, #2A4570 50%, #3A5A88 100%)
          `,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.28,
          backgroundImage: `linear-gradient(rgba(200,214,234,0.14) 1px, transparent 1px),
            linear-gradient(90deg, rgba(200,214,234,0.14) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at 50% 45%, black 30%, transparent 72%)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 50% 48%, rgba(8,14,26,0.35) 0%, transparent 72%)",
          pointerEvents: "none",
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 48,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            width: 980,
          }}
        >
          {/* Logo */}
          <div
            style={{
              opacity: logoIn,
              transform: `translateY(${(1 - logoIn) * 18}px) scale(${0.88 + logoIn * 0.12})`,
              width: 96,
              height: 96,
              borderRadius: 24,
              overflow: "hidden",
              boxShadow: `
                0 0 0 1px rgba(255,255,255,0.16),
                0 18px 40px rgba(0,0,0,0.45),
                0 0 36px rgba(56,189,248,0.22)
              `,
            }}
          >
            <Img
              src={appIcon}
              style={{ width: 96, height: 96 }}
            />
          </div>

          {/* Eyebrow */}
          <div
            style={{
              marginTop: 28,
              opacity: titleIn,
              fontFamily: fonts.body,
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "0.2em",
              color: theme.accent,
            }}
          >
            CS 匹配助手 · 急停助手
          </div>

          {/* Title */}
          <div
            style={{
              marginTop: 14,
              opacity: titleIn,
              transform: `translateY(${(1 - titleIn) * 20}px)`,
              fontFamily: fonts.body,
              fontSize: 72,
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1.02,
              color: theme.text,
              WebkitFontSmoothing: "antialiased",
              textShadow: "0 6px 28px rgba(0,0,0,0.22)",
            }}
          >
            轻量，开箱即用
          </div>

          {/* One supporting line */}
          <div
            style={{
              marginTop: 18,
              opacity: subIn,
              fontFamily: fonts.body,
              fontSize: 26,
              fontWeight: 700,
              color: theme.textMuted,
              letterSpacing: "0.04em",
            }}
          >
            不读内存 · 不注入 · 纯算法
          </div>

          {/* Feature chips — single centered row */}
          <div
            style={{
              marginTop: 40,
              display: "flex",
              gap: 14,
              justifyContent: "center",
            }}
          >
            {FEATURES.map((f, i) => {
              const enter = spring({
                frame: Math.max(0, frame - (df(28) + i * df(5))),
                fps,
                config: { damping: 13, stiffness: 160, mass: 0.42 },
              });
              return (
                <div
                  key={f.label}
                  style={{
                    opacity: enter,
                    transform: `translateY(${(1 - enter) * 16}px) scale(${0.94 + enter * 0.06})`,
                    padding: "14px 22px",
                    borderRadius: 14,
                    background: "rgba(10,16,28,0.88)",
                    border: `1px solid ${f.accent}88`,
                    boxShadow: `0 12px 28px rgba(0,0,0,0.28), 0 0 28px ${f.accent}28`,
                    fontFamily: fonts.body,
                    fontSize: 24,
                    fontWeight: 800,
                    color: theme.text,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: f.accent,
                      marginRight: 10,
                      boxShadow: `0 0 10px ${f.accent}`,
                      verticalAlign: "middle",
                      marginBottom: 2,
                    }}
                  />
                  {f.label}
                </div>
              );
            })}
          </div>

          {/* Final CTA — product name only, no URL */}
          <div
            style={{
              marginTop: 48,
              opacity: ctaIn,
              transform: `translateY(${(1 - ctaIn) * 14}px) scale(${0.96 + ctaIn * 0.04})`,
              padding: "18px 36px",
              borderRadius: 18,
              background: `linear-gradient(110deg, ${theme.accent} 0%, #22d3ee 50%, ${theme.stable} 100%)`,
              color: "#041018",
              fontFamily: fonts.body,
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "0.01em",
              boxShadow: "0 14px 36px rgba(56,189,248,0.32)",
            }}
          >
            打开急停助手，练一次看得见的急停
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
