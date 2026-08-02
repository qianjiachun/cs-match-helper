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

type Grade = "perfect" | "good" | "early" | "late";
type Axis = "A" | "D";

type StrafeCycle = {
  /** First key held */
  from: Axis;
  fromDown: number;
  fromUp: number;
  /** Opposite key */
  to: Axis;
  toDown: number;
  toUp: number;
  evaluateAt: number;
  grade: Grade;
  /** Chart Y: center=90 is perfect; SVG-up (smaller y)=late(+ms), SVG-down (larger y)=early(−ms) */
  y: number;
  diffLabel: string;
};

/** Match app `ASSESSMENT_COLORS` */
const ASSESSMENT = {
  perfect: "#5eead4",
  success: "#4ade80",
  early: "#fbbf24",
  late: "#f87171",
} as const;

const GRADE_META: Record<Grade, { label: string; color: string }> = {
  perfect: { label: "完美", color: ASSESSMENT.perfect },
  good: { label: "优秀", color: ASSESSMENT.success },
  early: { label: "偏早", color: ASSESSMENT.early },
  late: { label: "偏晚", color: ASSESSMENT.late },
};

/**
 * Dense A↔D script for ~8s scene (delay≈df(4) → ~df(230) frames usable).
 * Five cycles, all four grades; paced for VO. Timings authored at 30fps.
 */
const CYCLES: StrafeCycle[] = [
  {
    from: "A",
    fromDown: df(2),
    fromUp: df(18),
    to: "D",
    toDown: df(20),
    toUp: df(38),
    evaluateAt: df(22),
    grade: "perfect",
    y: 90,
    diffLabel: "0ms",
  },
  {
    from: "D",
    fromDown: df(44),
    fromUp: df(60),
    to: "A",
    toDown: df(54),
    toUp: df(74),
    evaluateAt: df(62),
    grade: "early",
    y: 138,
    diffLabel: "-8ms",
  },
  {
    from: "A",
    fromDown: df(80),
    fromUp: df(98),
    to: "D",
    toDown: df(108),
    toUp: df(128),
    evaluateAt: df(110),
    grade: "late",
    y: 48,
    diffLabel: "+18ms",
  },
  {
    from: "D",
    fromDown: df(134),
    fromUp: df(152),
    to: "A",
    toDown: df(156),
    toUp: df(176),
    evaluateAt: df(158),
    grade: "good",
    y: 78,
    diffLabel: "+4ms",
  },
  {
    from: "A",
    fromDown: df(182),
    fromUp: df(198),
    to: "D",
    toDown: df(200),
    toUp: df(220),
    evaluateAt: df(202),
    grade: "perfect",
    y: 92,
    diffLabel: "1ms",
  },
];

const CHART_W = 1040;
const CHART_H = 200;
const PAD_X = 36;
const ZERO_Y = 90;
const TIMELINE_END = df(225);

export const KeyTimeline: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - delay;

  const aHeld = CYCLES.some(
    (c) =>
      (c.from === "A" && t >= c.fromDown && t < c.fromUp) ||
      (c.to === "A" && t >= c.toDown && t < c.toUp),
  );
  const dHeld = CYCLES.some(
    (c) =>
      (c.from === "D" && t >= c.fromDown && t < c.fromUp) ||
      (c.to === "D" && t >= c.toDown && t < c.toUp),
  );

  const panelIn = spring({
    frame: Math.max(0, t),
    fps,
    config: { damping: 15, stiffness: 140, mass: 0.55 },
  });

  const latestIndex = [...CYCLES]
    .map((c, i) => ({ c, i }))
    .reverse()
    .find(({ c }) => t >= c.evaluateAt)?.i;
  const latest = latestIndex != null ? CYCLES[latestIndex] : undefined;
  const labelPop = latest
    ? spring({
        frame: Math.max(0, t - latest.evaluateAt),
        fps,
        config: { damping: 10, stiffness: 240, mass: 0.38 },
      })
    : 0;

  const points = CYCLES.map((cycle, i) => {
    const local = t - cycle.evaluateAt;
    const visible = local >= 0;
    const pop = spring({
      frame: Math.max(0, local),
      fps,
      config: { damping: 9, stiffness: 220, mass: 0.35 },
    });
    const x = PAD_X + (i / Math.max(CYCLES.length - 1, 1)) * (CHART_W - PAD_X * 2);
    return { ...cycle, i, x, pop: visible ? pop : 0, visible, local };
  });

  const visiblePoints = points.filter((p) => p.visible);

  const playheadX = interpolate(Math.min(t, TIMELINE_END), [0, TIMELINE_END], [PAD_X, CHART_W - PAD_X], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const status = (() => {
    if (aHeld && dHeld) return { text: "按键重叠", color: theme.early };
    if (aHeld) return { text: "A →", color: theme.accent };
    if (dHeld) return { text: "← D", color: theme.accent };
    if (latest) return { text: GRADE_META[latest.grade].label, color: GRADE_META[latest.grade].color };
    return { text: "变向中", color: theme.textMuted };
  })();

  const flash = latest
    ? interpolate(t - latest.evaluateAt, [0, df(4), df(14)], [0.55, 0.35, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width: 1180,
          opacity: panelIn,
          transform: `translateY(${(1 - panelIn) * 28}px) scale(${0.97 + panelIn * 0.03})`,
        }}
      >
        {/* Keys row */}
        <div
          style={{
            display: "flex",
            gap: 28,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <KeyCap label="A" active={aHeld} held={aHeld} fps={fps} frame={t} />
          <SwapGlyph active={aHeld || dHeld} frame={t} />
          <KeyCap label="D" active={dHeld} held={dHeld} fps={fps} frame={t} />
          <div
            style={{
              marginLeft: 12,
              minWidth: 120,
              padding: "10px 16px",
              borderRadius: 12,
              backgroundColor: "rgba(10,16,28,0.92)",
              boxShadow: `0 0 0 1px ${status.color}66, 0 8px 20px rgba(0,0,0,0.35)`,
              fontFamily: fonts.body,
              fontSize: 24,
              fontWeight: 800,
              color: status.color,
              textAlign: "center",
            }}
          >
            {status.text}
          </div>
        </div>

        {/* Key hold lanes */}
        <KeyHoldLanes t={t} />

        {/* Chart card */}
        <div
          style={{
            marginTop: 14,
            height: 268,
            borderRadius: 22,
            background:
              "linear-gradient(165deg, #1A2438 0%, #0C121E 100%)",
            boxShadow:
              "0 0 0 2px rgba(255,255,255,0.2), 0 0 0 1px rgba(94,234,212,0.35) inset, 12px 12px 0 rgba(94,234,212,0.85), 0 28px 56px rgba(0,0,0,0.45)",
            position: "relative",
            overflow: "hidden",
            padding: "14px 18px 10px",
          }}
        >
          {/* Flash wash on evaluate */}
          {latest && flash > 0 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `radial-gradient(circle at ${(((latestIndex ?? 0) / Math.max(CYCLES.length - 1, 1)) * 100).toFixed(1)}% 50%, ${GRADE_META[latest.grade].color} 0%, transparent 55%)`,
                opacity: flash,
                pointerEvents: "none",
                mixBlendMode: "screen",
              }}
            />
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 2,
            }}
          >
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 17,
                fontWeight: 700,
                color: theme.textMuted,
                letterSpacing: "0.06em",
              }}
            >
              急停评估 · 时机偏差
            </div>
            {latest ? (
              <div
                style={{
                  opacity: Math.min(1, labelPop),
                  transform: `translateX(${(1 - labelPop) * 20}px) scale(${0.75 + labelPop * 0.25})`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.body,
                    fontWeight: 700,
                    fontSize: 18,
                    color: theme.textMuted,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {latest.diffLabel}
                </span>
                <span
                  style={{
                    padding: "6px 14px",
                    borderRadius: 10,
                    backgroundColor: GRADE_META[latest.grade].color,
                    color: theme.bg,
                    fontFamily: fonts.body,
                    fontWeight: 900,
                    fontSize: 24,
                    boxShadow: `0 0 24px ${GRADE_META[latest.grade].color}88`,
                  }}
                >
                  {GRADE_META[latest.grade].label}
                </span>
              </div>
            ) : null}
          </div>

          <svg width="100%" height="210" viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
            {/* Soft area fill under visible polyline */}
            {visiblePoints.length > 0 ? (
              <path
                d={
                  `M ${visiblePoints[0].x} ${ZERO_Y} ` +
                  visiblePoints.map((p) => `L ${p.x} ${p.y}`).join(" ") +
                  ` L ${visiblePoints[visiblePoints.length - 1].x} ${ZERO_Y} Z`
                }
                fill="url(#strafeFill)"
                opacity={0.35}
              />
            ) : null}

            <defs>
              <linearGradient id="strafeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ASSESSMENT.perfect} stopOpacity="0.45" />
                <stop offset="100%" stopColor={ASSESSMENT.perfect} stopOpacity="0" />
              </linearGradient>
              <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid */}
            {[40, ZERO_Y, 140].map((y) => (
              <line
                key={y}
                x1={PAD_X}
                x2={CHART_W - PAD_X}
                y1={y}
                y2={y}
                stroke={y === ZERO_Y ? "rgba(255,255,255,0.28)" : "rgba(148,163,184,0.14)"}
                strokeWidth={y === ZERO_Y ? 2 : 1}
                strokeDasharray={y === ZERO_Y ? "0" : "4 6"}
              />
            ))}
            <text
              x={PAD_X - 4}
              y={ZERO_Y + 4}
              textAnchor="end"
              fill="rgba(148,163,184,0.7)"
              fontSize="14"
              fontFamily={fonts.body}
            >
              0
            </text>
            <text
              x={PAD_X - 4}
              y={44}
              textAnchor="end"
              fill="rgba(251,113,133,0.75)"
              fontSize="13"
              fontFamily={fonts.body}
            >
              晚
            </text>
            <text
              x={PAD_X - 4}
              y={148}
              textAnchor="end"
              fill="rgba(251,191,36,0.75)"
              fontSize="13"
              fontFamily={fonts.body}
            >
              早
            </text>

            {/* Colored segments */}
            {visiblePoints.slice(1).map((dot, i) => {
              const prev = visiblePoints[i];
              const segProgress = interpolate(dot.local, [0, df(10)], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              });
              const x = prev.x + (dot.x - prev.x) * segProgress;
              const y = prev.y + (dot.y - prev.y) * segProgress;
              return (
                <line
                  key={`seg-${dot.i}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={x}
                  y2={y}
                  stroke={GRADE_META[dot.grade].color}
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.95}
                  style={{ filter: `drop-shadow(0 0 6px ${GRADE_META[dot.grade].color})` }}
                />
              );
            })}

            {/* Playhead */}
            <line
              x1={playheadX}
              x2={playheadX}
              y1={12}
              y2={CHART_H - 8}
              stroke="rgba(56,189,248,0.45)"
              strokeWidth={2}
              strokeDasharray="3 5"
            />

            {/* Dots */}
            {points.map((p) => {
              if (!p.visible) return null;
              const meta = GRADE_META[p.grade];
              const ring = interpolate(p.local, [0, df(14)], [2.2, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.2, 0, 0, 1),
              });
              const ringOp = interpolate(p.local, [0, df(16)], [0.8, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const isLatest = latestIndex === p.i;
              return (
                <g key={p.i} filter="url(#dotGlow)">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={16 * ring}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={3}
                    opacity={ringOp}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={(isLatest ? 12 : 10) * Math.min(1.2, p.pop)}
                    fill={meta.color}
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth={2}
                  />
                  {/* Tiny connector from zero */}
                  <line
                    x1={p.x}
                    y1={ZERO_Y}
                    x2={p.x}
                    y2={p.y}
                    stroke={meta.color}
                    strokeWidth={1.5}
                    opacity={0.25 * Math.min(1, p.pop)}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 28,
            marginTop: 16,
          }}
        >
          {(Object.keys(GRADE_META) as Grade[]).map((g) => {
            const hit = points.some((p) => p.visible && p.grade === g);
            const count = points.filter((p) => p.visible && p.grade === g).length;
            return (
              <div
                key={g}
                style={{
                  opacity: hit ? 1 : 0.28,
                  transform: `scale(${hit ? 1 : 0.94})`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: fonts.body,
                  fontWeight: 800,
                  fontSize: 22,
                  color: GRADE_META[g].color,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 99,
                    backgroundColor: GRADE_META[g].color,
                    boxShadow: hit ? `0 0 10px ${GRADE_META[g].color}` : "none",
                  }}
                />
                {GRADE_META[g].label}
                {count > 0 ? (
                  <span style={{ opacity: 0.7, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
                    ×{count}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const KeyHoldLanes: React.FC<{ t: number }> = ({ t }) => {
  const width = 1040;
  const laneH = 18;

  const blocks = (key: Axis) =>
    CYCLES.flatMap((c, i) => {
      const spans: Array<{ start: number; end: number; id: string }> = [];
      if (c.from === key) spans.push({ start: c.fromDown, end: c.fromUp, id: `${i}-f` });
      if (c.to === key) spans.push({ start: c.toDown, end: c.toUp, id: `${i}-t` });
      return spans;
    });

  const toX = (f: number) => (f / TIMELINE_END) * width;
  const playhead = interpolate(Math.min(Math.max(t, 0), TIMELINE_END), [0, TIMELINE_END], [0, width], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width,
        margin: "0 auto",
        borderRadius: 14,
        padding: "10px 12px",
        backgroundColor: "rgba(10,16,28,0.9)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
      }}
    >
      {(["A", "D"] as Axis[]).map((key) => (
        <div
          key={key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: key === "A" ? 8 : 0,
          }}
        >
          <div
            style={{
              width: 22,
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: 16,
              color: theme.textMuted,
            }}
          >
            {key}
          </div>
          <div
            style={{
              position: "relative",
              flex: 1,
              height: laneH,
              borderRadius: 6,
              backgroundColor: "rgba(148,163,184,0.1)",
              overflow: "hidden",
            }}
          >
            {blocks(key).map((b) => {
              const left = toX(b.start);
              const w = Math.max(4, toX(b.end) - toX(b.start));
              const active = t >= b.start && t < b.end;
              const passed = t >= b.end;
              return (
                <div
                  key={b.id}
                  style={{
                    position: "absolute",
                    left,
                    top: 2,
                    width: w,
                    height: laneH - 4,
                    borderRadius: 4,
                    backgroundColor: active ? theme.accent : passed ? `${theme.accent}99` : `${theme.accent}55`,
                    boxShadow: active ? `0 0 12px ${theme.accent}` : "none",
                  }}
                />
              );
            })}
            <div
              style={{
                position: "absolute",
                left: playhead,
                top: 0,
                width: 2,
                height: laneH,
                backgroundColor: theme.text,
                opacity: 0.7,
                boxShadow: "0 0 8px rgba(255,255,255,0.5)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const SwapGlyph: React.FC<{ active: boolean; frame: number }> = ({ active, frame }) => {
  const pulse = interpolate(frame % df(24), [0, df(12), df(24)], [0.85, 1.1, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: fonts.body,
        fontSize: 28,
        fontWeight: 900,
        color: active ? ASSESSMENT.perfect : theme.textMuted,
        backgroundColor: "rgba(14,22,38,0.92)",
        boxShadow: active
          ? `0 0 0 2px ${ASSESSMENT.perfect}88, 0 0 20px ${ASSESSMENT.perfect}44`
          : "0 0 0 1px rgba(255,255,255,0.1)",
        transform: `scale(${active ? pulse : 1})`,
      }}
    >
      ↔
    </div>
  );
};

const KeyCap: React.FC<{
  label: string;
  active: boolean;
  held: boolean;
  fps: number;
  frame: number;
}> = ({ label, active, held, fps, frame }) => {
  const press = spring({
    frame: held ? df(6) : 0,
    fps,
    config: { damping: 12, stiffness: 280, mass: 0.3 },
  });
  const glow = held
    ? interpolate(frame % df(16), [0, df(8), df(16)], [0.4, 0.85, 0.4], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <div
      style={{
        width: 108,
        height: 108,
        borderRadius: 20,
        background: held
          ? `linear-gradient(160deg, ${theme.accent} 0%, #0ea5e9 100%)`
          : `linear-gradient(160deg, #1E2A40 0%, #0C121E 100%)`,
        color: held ? theme.bg : theme.textMuted,
        boxShadow: held
          ? `0 ${8 - press * 5}px 0 rgba(0,0,0,0.35), 0 0 ${32 * glow}px rgba(76,201,240,0.65), 0 0 0 2px rgba(255,255,255,0.25)`
          : "0 7px 0 rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.16)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: fonts.display,
        fontSize: 48,
        fontWeight: 700,
        transform: `translateY(${held ? 0 : 9}px) scale(${held ? 1.08 : active ? 1.02 : 1})`,
      }}
    >
      {label}
    </div>
  );
};
