import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "../../shared/fonts";
import { df, theme } from "../../shared/theme";

/** Match app `ASSESSMENT_COLORS` */
const ASSESSMENT = {
  perfect: "#5eead4",
  success: "#4ade80",
  early: "#fbbf24",
  late: "#f87171",
} as const;

type Grade = keyof typeof ASSESSMENT;

const GRADE_LABEL: Record<Grade, string> = {
  perfect: "完美",
  success: "优秀",
  early: "偏早",
  late: "偏晚",
};

/**
 * Sample diffs like in-app chart:
 * y = zeroY - (diffMs / 100) * (innerH/2)
 * early (负) 在上，late (正) 在下
 */
const SAMPLES: Array<{ diffMs: number; grade: Grade; at: number }> = [
  { diffMs: 0.5, grade: "perfect", at: df(18) },
  { diffMs: -9, grade: "early", at: df(32) },
  { diffMs: 3.5, grade: "success", at: df(46) },
  { diffMs: 16, grade: "late", at: df(60) },
  { diffMs: -1, grade: "perfect", at: df(74) },
  { diffMs: 5, grade: "success", at: df(88) },
  { diffMs: -14, grade: "early", at: df(102) },
  { diffMs: 11, grade: "late", at: df(116) },
];

const CHART_W = 404;
const CHART_H = 118;
const PAD_X = 10;
const PAD_Y = 10;
const CLAMP_MS = 100;

/** Cinematic opener — big type left, product-faithful A↔D panel right */
export const HookPain: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const line1 = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.6 },
  });
  const line2 = spring({
    frame: Math.max(0, frame - df(10)),
    fps,
    config: { damping: 14, stiffness: 130, mass: 0.55 },
  });
  const sub = interpolate(frame, [df(26), df(38)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  const panelIn = spring({
    frame: Math.max(0, frame - df(12)),
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.55 },
  });

  const innerW = CHART_W - PAD_X * 2;
  const innerH = CHART_H - PAD_Y * 2;
  const zeroY = PAD_Y + innerH / 2;

  const allDots = SAMPLES.map((s, i) => {
    const x =
      PAD_X +
      (SAMPLES.length === 1 ? innerW / 2 : (i / (SAMPLES.length - 1)) * innerW);
    const clamped = Math.max(-CLAMP_MS, Math.min(CLAMP_MS, s.diffMs));
    const y = zeroY - (clamped / CLAMP_MS) * (innerH / 2 - 4);
    const local = frame - s.at;
    const pop = spring({
      frame: Math.max(0, local),
      fps,
      config: { damping: 11, stiffness: 220, mass: 0.35 },
    });
    const visible = local >= 0;
    return { ...s, i, x, y, pop: visible ? pop : 0, visible, local };
  });

  const visibleDots = allDots.filter((d) => d.visible);
  const latest = visibleDots[visibleDots.length - 1];
  const verdictColor = latest ? ASSESSMENT[latest.grade] : ASSESSMENT.perfect;
  const verdictLabel = latest ? GRADE_LABEL[latest.grade] : "—";

  const segments = allDots.slice(1).flatMap((dot, i) => {
    const prev = allDots[i];
    if (!dot.visible) return [];
    const draw = interpolate(dot.local, [0, df(10)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    return [
      {
        x1: prev.x,
        y1: prev.y,
        x2: prev.x + (dot.x - prev.x) * draw,
        y2: prev.y + (dot.y - prev.y) * draw,
        color: ASSESSMENT[dot.grade],
        opacity: 0.35 + draw * 0.6,
      },
    ];
  });

  const aPress = frame % df(50) < df(22);
  const dPress = frame % df(50) >= df(24) && frame % df(50) < df(46);
  const swapFlash = interpolate(frame % df(50), [df(22), df(26), df(30)], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const drift = interpolate(frame, [0, df(120)], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 18% 30%, rgba(251,191,36,0.28), transparent 58%),
            radial-gradient(ellipse 70% 50% at 85% 70%, rgba(244,63,94,0.18), transparent 52%),
            radial-gradient(ellipse 50% 40% at 55% 45%, rgba(56,189,248,0.12), transparent 55%),
            linear-gradient(160deg, #1E3050 0%, #2A4570 45%, #3A5A88 100%)
          `,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.38,
          backgroundImage: `linear-gradient(rgba(200,214,234,0.14) 1px, transparent 1px),
            linear-gradient(90deg, rgba(200,214,234,0.14) 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          backgroundPosition: `${drift * 20}px ${drift * 12}px`,
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />

      <AbsoluteFill
        style={{
          padding: "0 120px",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 48,
        }}
      >
        <div style={{ flex: "1 1 0", maxWidth: 820, minWidth: 0 }}>
          <div
            style={{
              opacity: interpolate(frame, [0, df(12)], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              marginBottom: 28,
              fontFamily: fonts.display,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.28em",
              color: theme.accentWarm,
            }}
          >
            COUNTER-STRAFE
          </div>

          <div
            style={{
              opacity: line1,
              transform: `translateY(${(1 - line1) * 40}px)`,
              fontFamily: fonts.body,
              fontSize: 96,
              fontWeight: 900,
              color: theme.text,
              lineHeight: 1.02,
              letterSpacing: "-0.05em",
              whiteSpace: "nowrap",
              WebkitFontSmoothing: "antialiased",
              textShadow: "0 6px 28px rgba(0,0,0,0.25)",
            }}
          >
            急停好不好
          </div>
          <div
            style={{
              opacity: line2,
              transform: `translateY(${(1 - line2) * 36}px)`,
              marginTop: 8,
              fontFamily: fonts.body,
              fontSize: 96,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: "-0.05em",
              whiteSpace: "nowrap",
              backgroundImage: `linear-gradient(100deg, ${theme.accentWarm} 0%, #fb7185 55%, ${theme.perfect} 100%)`,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            不必只靠感觉
          </div>

          <div
            style={{
              opacity: sub,
              transform: `translateY(${(1 - sub) * 12}px)`,
              marginTop: 32,
              fontFamily: fonts.body,
              fontSize: 28,
              fontWeight: 700,
              color: theme.textMuted,
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            看得见偏差，才调得准。
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",
            width: 460,
            opacity: panelIn,
            transform: `translateX(${(1 - panelIn) * 36}px) scale(${0.94 + panelIn * 0.06})`,
            padding: "28px 28px 22px",
            borderRadius: 28,
            background: "rgba(42,62,96,0.9)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: `
              0 24px 56px rgba(0,0,0,0.22),
              0 0 48px rgba(76,201,240,0.16),
              inset 0 1px 0 rgba(255,255,255,0.12)
            `,
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: theme.textMuted,
              }}
            >
              急停评估
            </div>
            <div
              style={{
                padding: "8px 14px",
                borderRadius: 12,
                backgroundColor: `${verdictColor}22`,
                border: `1px solid ${verdictColor}66`,
                color: verdictColor,
                fontFamily: fonts.body,
                fontSize: 20,
                fontWeight: 900,
                boxShadow: `0 0 18px ${verdictColor}33`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {latest
                ? `${verdictLabel}  ${latest.diffMs > 0 ? "+" : ""}${latest.diffMs.toFixed(0)}ms`
                : "等待变向"}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
              marginBottom: 20,
            }}
          >
            <GhostKey label="A" active={aPress} size={118} />
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 900,
                color: theme.text,
                backgroundColor: `rgba(94,234,212,${0.12 + swapFlash * 0.4})`,
                boxShadow:
                  swapFlash > 0.2 ? `0 0 ${28 * swapFlash}px ${ASSESSMENT.perfect}` : "none",
                transform: `scale(${1 + swapFlash * 0.18})`,
              }}
            >
              ↔
            </div>
            <GhostKey label="D" active={dPress} size={118} />
          </div>

          {/* Product-faithful line chart */}
          <div
            style={{
              borderRadius: 16,
              background: "rgba(28,44,72,0.72)",
              border: "1px solid rgba(255,255,255,0.14)",
              padding: "8px 8px 6px",
            }}
          >
            <svg
              width="100%"
              height={CHART_H}
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              style={{ display: "block", overflow: "visible" }}
            >
              {/* 0ms zero line — dashed, like CounterStrafingLineChart */}
              <line
                x1={PAD_X}
                y1={zeroY}
                x2={CHART_W - PAD_X}
                y2={zeroY}
                stroke="rgba(148,163,184,0.42)"
                strokeWidth={1}
                strokeDasharray="3 4"
              />

              {segments.map((seg, i) => (
                <line
                  key={`seg-${i}`}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={seg.color}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={seg.opacity}
                  style={{ filter: `drop-shadow(0 0 1.5px ${seg.color}55)` }}
                />
              ))}

              {visibleDots.map((dot) => {
                const isLatest = dot.i === (latest?.i ?? -1);
                const r = (isLatest ? 4.5 : 3.2) * (0.55 + dot.pop * 0.45);
                return (
                  <circle
                    key={`dot-${dot.i}`}
                    cx={dot.x}
                    cy={dot.y}
                    r={r}
                    fill={ASSESSMENT[dot.grade]}
                    opacity={Math.min(1, 0.35 + dot.pop * 0.65)}
                    style={{
                      filter: isLatest
                        ? `drop-shadow(0 0 ${2 + dot.pop * 2}px ${ASSESSMENT[dot.grade]}99)`
                        : `drop-shadow(0 0 1.5px ${ASSESSMENT[dot.grade]}44)`,
                    }}
                  />
                );
              })}
            </svg>

            <div
              style={{
                marginTop: 4,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0 4px",
                fontFamily: fonts.body,
                fontSize: 13,
                fontWeight: 700,
                color: theme.textMuted,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: ASSESSMENT.early,
                  }}
                />
                偏早 ↑
              </span>
              <span>0ms</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                偏晚 ↓
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: ASSESSMENT.late,
                  }}
                />
              </span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const GhostKey: React.FC<{ label: string; active: boolean; size?: number }> = ({
  label,
  active,
  size = 92,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.2),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: fonts.display,
      fontSize: Math.round(size * 0.42),
      fontWeight: 700,
      color: active ? theme.bg : "rgba(248,250,252,0.55)",
      background: active
        ? `linear-gradient(145deg, ${theme.accent} 0%, #0284c7 100%)`
        : "rgba(22,32,51,0.75)",
      boxShadow: active
        ? "0 0 0 1px rgba(255,255,255,0.25), 0 12px 32px rgba(56,189,248,0.35)"
        : "0 0 0 1px rgba(255,255,255,0.1), 0 8px 24px rgba(0,0,0,0.35)",
      transform: `translateY(${active ? 0 : 6}px) scale(${active ? 1.05 : 1})`,
      backdropFilter: "blur(8px)",
    }}
  >
    {label}
  </div>
);
