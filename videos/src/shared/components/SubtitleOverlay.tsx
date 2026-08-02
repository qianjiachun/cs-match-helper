import type { CSSProperties, FC } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "../fonts";
import { theme, type Caption } from "../theme";

export type SubtitleChapterStyle = {
  accent: string;
  shell: CSSProperties;
  text?: CSSProperties;
  ornament?: "bar-left" | "line-top" | "dots" | "none";
  /** Used when ornament is "dots" (e.g. assessment grade colors) */
  ornamentColors?: string[];
};

type Props = {
  captions: Caption[];
  /** Per-frame chapter look; defaults to a neutral brand shell */
  resolveStyle?: (frame: number) => SubtitleChapterStyle;
};

const DEFAULT_STYLE: SubtitleChapterStyle = {
  accent: theme.accent,
  ornament: "none",
  shell: {
    background: theme.subtitleBg,
    borderRadius: 12,
    boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
    border: `1px solid ${theme.subtitleBorder}`,
  },
};

export const SubtitleOverlay: FC<Props> = ({ captions, resolveStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const active = captions.find((c) => nowMs >= c.startMs && nowMs < c.endMs);

  if (!active) {
    return null;
  }

  const localMs = nowMs - active.startMs;
  const localFrame = (localMs / 1000) * fps;
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 180, mass: 0.45 },
  });
  const fadeOut = interpolate(
    localMs,
    [Math.max(0, active.endMs - active.startMs - 160), active.endMs - active.startMs],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.2, 0, 0, 1),
    },
  );

  const style = resolveStyle?.(frame) ?? DEFAULT_STYLE;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 72,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity: Math.min(1, enter) * fadeOut,
          transform: `translateY(${(1 - enter) * 16}px)`,
          maxWidth: "76%",
          position: "relative",
          padding:
            style.ornament === "bar-left" ? "14px 28px 14px 24px" : "14px 28px",
          backdropFilter: "blur(12px)",
          ...style.shell,
        }}
      >
        {style.ornament === "line-top" ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "18%",
              right: "18%",
              height: 2,
              borderRadius: 2,
              background: `linear-gradient(90deg, transparent, ${style.accent}, transparent)`,
              opacity: 0.9,
            }}
          />
        ) : null}

        {style.ornament === "bar-left" ? (
          <div
            style={{
              position: "absolute",
              left: 10,
              top: 12,
              bottom: 12,
              width: 3,
              borderRadius: 3,
              backgroundColor: style.accent,
              boxShadow: `0 0 12px ${style.accent}88`,
            }}
          />
        ) : null}

        {style.ornament === "dots" ? (
          <div
            style={{
              position: "absolute",
              top: -6,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 6,
            }}
          >
            {(style.ornamentColors ?? [theme.perfect, theme.good, theme.early, theme.late]).map(
              (c) => (
              <div
                key={c}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  backgroundColor: c,
                  boxShadow: `0 0 8px ${c}`,
                }}
              />
            ))}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 34,
            fontWeight: 700,
            color: theme.text,
            textAlign: "center",
            letterSpacing: "0.01em",
            lineHeight: 1.32,
            WebkitFontSmoothing: "antialiased",
            textWrap: "pretty",
            paddingLeft: style.ornament === "bar-left" ? 8 : 0,
            ...style.text,
          }}
        >
          {active.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
