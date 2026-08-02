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

type ShotKind = "stable" | "micro" | "spray";

type ShotEvent = {
  at: number;
  move: "A" | "D" | null;
  moveFrom: number;
  moveTo: number;
  kind: ShotKind;
  height: number;
};

const KIND_META: Record<ShotKind, { label: string; color: string }> = {
  stable: { label: "稳定", color: theme.stable },
  micro: { label: "微动", color: theme.micro },
  spray: { label: "跑打", color: theme.spray },
};

/** 6 shots in ~7s (delay≈df(6) → ~df(200) frames usable). Timings authored at 30fps. */
const SHOTS: ShotEvent[] = [
  { at: df(24), move: "A", moveFrom: df(4), moveTo: df(20), kind: "stable", height: 0.4 },
  { at: df(52), move: "D", moveFrom: df(34), moveTo: df(52), kind: "spray", height: 0.92 },
  { at: df(80), move: "A", moveFrom: df(62), moveTo: df(76), kind: "stable", height: 0.46 },
  { at: df(108), move: "D", moveFrom: df(92), moveTo: df(104), kind: "micro", height: 0.6 },
  { at: df(138), move: "A", moveFrom: df(120), moveTo: df(138), kind: "spray", height: 0.86 },
  { at: df(168), move: "D", moveFrom: df(150), moveTo: df(164), kind: "stable", height: 0.42 },
];

export const StabilityBars: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - delay;

  const aHeld = SHOTS.some((s) => s.move === "A" && t >= s.moveFrom && t < s.moveTo);
  const dHeld = SHOTS.some((s) => s.move === "D" && t >= s.moveFrom && t < s.moveTo);
  const firingShot = SHOTS.find((s) => t >= s.at && t < s.at + df(9));
  const fireFlash = firingShot
    ? interpolate(t, [firingShot.at, firingShot.at + df(3), firingShot.at + df(9)], [1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const panelIn = spring({
    frame: Math.max(0, t),
    fps,
    config: { damping: 15, stiffness: 130, mass: 0.65 },
  });

  const latest = [...SHOTS].reverse().find((s) => t >= s.at);
  const latestPop = latest
    ? spring({
        frame: Math.max(0, t - latest.at),
        fps,
        config: { damping: 11, stiffness: 220, mass: 0.4 },
      })
    : 0;

  const shake =
    fireFlash > 0.3
      ? interpolate(fireFlash, [0.3, 1], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }) * Math.sin(t * 2.2) * 3
      : 0;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width: 1140,
          opacity: panelIn,
          transform: `translate(${shake}px, ${(1 - panelIn) * 30 + shake * 0.4}px) scale(${0.96 + panelIn * 0.04})`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            gap: 22,
            marginBottom: 22,
          }}
        >
          <KeyCap label="A" active={aHeld} />
          <KeyCap label="D" active={dHeld} />
          <FireButton active={fireFlash > 0.12} flash={fireFlash} />
          <div
            style={{
              marginLeft: 8,
              paddingBottom: 18,
              minWidth: 160,
              fontFamily: fonts.body,
              fontSize: 24,
              fontWeight: 700,
              color: fireFlash > 0.2 ? theme.strokeOffset : theme.textMuted,
            }}
          >
            {fireFlash > 0.2 ? "开火！" : aHeld || dHeld ? "移动中" : "急停开火"}
          </div>
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
            gap: 14,
            height: 280,
            padding: "32px 36px 24px",
            borderRadius: 22,
            background:
              "linear-gradient(180deg, #1A2438 0%, #0C121E 100%)",
            boxShadow:
              "0 0 0 2px rgba(255,255,255,0.2), 0 0 0 1px rgba(251,113,133,0.3) inset, 12px 12px 0 rgba(244,63,94,0.88), 0 24px 48px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 24,
              fontFamily: fonts.body,
              fontSize: 18,
              fontWeight: 600,
              color: theme.textMuted,
              letterSpacing: "0.04em",
            }}
          >
            开枪稳定 · 实时柱图
          </div>

          {latest ? (
            <div
              style={{
                position: "absolute",
                top: 10,
                right: 16,
                opacity: Math.min(1, latestPop),
                transform: `scale(${0.7 + latestPop * 0.3})`,
                padding: "8px 16px",
                borderRadius: 12,
                backgroundColor: KIND_META[latest.kind].color,
                color: theme.bg,
                fontFamily: fonts.body,
                fontWeight: 900,
                fontSize: 24,
                boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
              }}
            >
              {KIND_META[latest.kind].label}
            </div>
          ) : null}

          {SHOTS.map((shot, i) => {
            const local = t - shot.at;
            const pop = spring({
              frame: Math.max(0, local),
              fps,
              config: { damping: 10, stiffness: 180, mass: 0.4 },
            });
            const visible = local >= 0;
            const meta = KIND_META[shot.kind];
            const highlight =
              firingShot === shot
                ? interpolate(local, [0, df(8)], [1.12, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.2, 0, 0, 1),
                  })
                : 1;
            if (!visible) {
              return (
                <div
                  key={i}
                  style={{
                    width: 56,
                    height: 8,
                    borderRadius: 6,
                    backgroundColor: "rgba(148,163,184,0.12)",
                  }}
                />
              );
            }
            return (
              <div
                key={i}
                style={{
                  width: 56,
                  height: Math.max(10, 210 * shot.height * Math.min(1.15, pop)),
                  transform: `scaleY(${highlight})`,
                  transformOrigin: "bottom",
                  background: `linear-gradient(180deg, ${meta.color} 0%, ${meta.color}cc 100%)`,
                  borderRadius: 10,
                  boxShadow: `inset 0 -6px 0 rgba(0,0,0,0.22), 0 0 ${18 * (firingShot === shot ? fireFlash : 0)}px ${meta.color}`,
                  outline: "1px solid rgba(255,255,255,0.12)",
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: 28,
            justifyContent: "center",
            marginTop: 18,
            fontFamily: fonts.body,
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {(Object.keys(KIND_META) as ShotKind[]).map((k) => {
            const lit = SHOTS.some((s) => s.kind === k && t >= s.at);
            return (
              <div
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: lit ? 1 : 0.35,
                  color: theme.textMuted,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    backgroundColor: KIND_META[k].color,
                  }}
                />
                {KIND_META[k].label}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const KeyCap: React.FC<{ label: string; active: boolean }> = ({ label, active }) => (
  <div
    style={{
      width: 88,
      height: 88,
      borderRadius: 16,
      backgroundColor: active ? theme.accent : "#121A2B",
      color: active ? theme.bg : theme.textMuted,
      boxShadow: active
        ? "0 4px 0 rgba(0,0,0,0.35), 0 0 22px rgba(76,201,240,0.45), 0 0 0 2px rgba(255,255,255,0.18)"
        : "0 5px 0 rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.16)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: fonts.display,
      fontSize: 38,
      fontWeight: 700,
      transform: `translateY(${active ? 0 : 7}px) scale(${active ? 1.08 : 1})`,
    }}
  >
    {label}
  </div>
);

const FireButton: React.FC<{ active: boolean; flash: number }> = ({ active, flash }) => (
  <div
    style={{
      width: 108,
      height: 88,
      borderRadius: 16,
      backgroundColor: active ? theme.strokeOffset : "#121A2B",
      color: active ? theme.text : theme.textMuted,
      boxShadow: active
        ? `0 4px 0 rgba(0,0,0,0.35), 0 0 ${32 * flash}px rgba(244,63,94,0.7), 0 0 0 2px rgba(255,255,255,0.2)`
        : "0 5px 0 rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.16)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: fonts.body,
      fontWeight: 800,
      transform: `translateY(${active ? 0 : 7}px) scale(${active ? 1.08 : 1})`,
      gap: 2,
    }}
  >
    <span style={{ fontSize: 26 }}>LMB</span>
    <span style={{ fontSize: 15, opacity: 0.9 }}>开火</span>
  </div>
);
