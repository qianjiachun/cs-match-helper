import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import appIcon from "../../shared/assets/app-icon.svg";
import { fonts } from "../../shared/fonts";
import { df, theme } from "../../shared/theme";
import gameplayDemo from "../assets/gameplay-demo.mp4";

const HIGHLIGHTS = [
  { label: "急停评估", desc: "完美 / 优秀 / 偏早 / 偏晚", color: theme.perfect },
  { label: "开枪稳定", desc: "绿稳 · 黄微动 · 红跑打", color: theme.stable },
] as const;

/**
 * Intro — full-bleed gameplay footage with left frosted copy panel.
 * Place the recording at: src/counter-strafing/assets/gameplay-demo.mp4
 */
export const ProductIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const panelIn = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.6 },
  });
  const titleIn = spring({
    frame: Math.max(0, frame - df(10)),
    fps,
    config: { damping: 15, stiffness: 130, mass: 0.55 },
  });
  const subIn = interpolate(frame, [df(28), df(48)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {/* Real gameplay — native 1080p; avoid cover/upscale soft blur */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <OffthreadVideo
          src={gameplayDemo}
          muted
          volume={0}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "fill",
            // Keep HUD (usually right) pixel-sharp; no CSS filter on this layer
            imageRendering: "auto",
          }}
        />
      </AbsoluteFill>

      {/*
        Left scrim only — do NOT put backdrop-filter on a full-frame AbsoluteFill.
        Chromium will soft-composite the whole video underneath and make HUD look muddy.
      */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "52%",
          pointerEvents: "none",
          background: `
            linear-gradient(
              90deg,
              rgba(18, 28, 48, 0.78) 0%,
              rgba(18, 28, 48, 0.55) 42%,
              rgba(18, 28, 48, 0.22) 72%,
              rgba(18, 28, 48, 0) 100%
            )
          `,
        }}
      />

      {/* Left copy stack */}
      <AbsoluteFill
        style={{
          padding: "88px 100px 96px",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 620,
            opacity: panelIn,
            transform: `translateX(${(1 - panelIn) * -28}px)`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                overflow: "hidden",
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.18), 0 12px 28px rgba(0,0,0,0.35)",
              }}
            >
              <Img
                src={appIcon}
                style={{ width: 52, height: 52 }}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: fonts.body,
                  fontSize: 18,
                  fontWeight: 800,
                  color: theme.accent,
                  letterSpacing: "0.1em",
                }}
              >
                CS 匹配助手 · 急停助手
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: fonts.body,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "rgba(248,250,252,0.72)",
                }}
              >
                实机演示
              </div>
            </div>
          </div>

          <div
            style={{
              opacity: titleIn,
              transform: `translateY(${(1 - titleIn) * 18}px)`,
              fontFamily: fonts.body,
              fontSize: 58,
              fontWeight: 900,
              color: theme.text,
              lineHeight: 1.08,
              letterSpacing: "-0.04em",
              textShadow: "0 6px 24px rgba(0,0,0,0.28)",
              WebkitFontSmoothing: "antialiased",
            }}
          >
            开启急停助手
            <br />
            <span
              style={{
                backgroundImage: `linear-gradient(100deg, ${theme.accent} 0%, ${theme.perfect} 100%)`,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              实时反馈急停质量
            </span>
          </div>

          <div
            style={{
              marginTop: 18,
              opacity: subIn,
              fontFamily: fonts.body,
              fontSize: 24,
              fontWeight: 700,
              color: "rgba(236,242,250,0.92)",
              lineHeight: 1.45,
              maxWidth: 520,
              textShadow: "0 2px 12px rgba(0,0,0,0.28)",
            }}
          >
            悬浮窗 / Game Bar，游戏内就能看见每一次变向与开火反馈。
          </div>

          <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 12 }}>
            {HIGHLIGHTS.map((item, i) => {
              const enter = spring({
                frame: Math.max(0, frame - (df(40) + i * df(10))),
                fps,
                config: { damping: 14, stiffness: 160, mass: 0.42 },
              });
              return (
                <div
                  key={item.label}
                  style={{
                    opacity: enter,
                    transform: `translateY(${(1 - enter) * 14}px)`,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 18px",
                    borderRadius: 16,
                    background: "rgba(36,54,84,0.88)",
                    border: `1px solid ${item.color}55`,
                    boxShadow: `0 10px 24px rgba(0,0,0,0.22), 0 0 20px ${item.color}14`,
                    maxWidth: 460,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: item.color,
                      boxShadow: `0 0 12px ${item.color}`,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 22,
                        fontWeight: 800,
                        color: theme.text,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontFamily: fonts.body,
                        fontSize: 16,
                        fontWeight: 600,
                        color: theme.textMuted,
                      }}
                    >
                      {item.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      {/* Subtle right-edge vignette only — don't cover HUD */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 85% 50%, transparent 40%, rgba(8,12,20,0.18) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
