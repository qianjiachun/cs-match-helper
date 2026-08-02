import type { SubtitleChapterStyle } from "../shared/components/SubtitleOverlay";
import { theme } from "../shared/theme";
import { sceneFrames } from "./meta";

type Chapter = "hook" | "intro" | "timing" | "stability" | "cta";

const CHAPTER_STYLE: Record<Chapter, SubtitleChapterStyle> = {
  hook: {
    accent: theme.accentWarm,
    ornament: "line-top",
    shell: {
      background:
        "linear-gradient(180deg, rgba(72,58,28,0.82) 0%, rgba(42,54,78,0.84) 100%)",
      borderRadius: 16,
      boxShadow: "0 10px 24px rgba(0,0,0,0.2)",
      border: "1px solid rgba(255,200,87,0.38)",
    },
  },
  intro: {
    accent: theme.accent,
    ornament: "bar-left",
    shell: {
      background: "rgba(42,62,96,0.82)",
      borderRadius: 14,
      boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
      border: "1px solid rgba(76,201,240,0.34)",
    },
  },
  timing: {
    accent: "#5eead4",
    ornament: "dots",
    ornamentColors: ["#5eead4", "#4ade80", "#fbbf24", "#f87171"],
    shell: {
      background: "rgba(28,56,56,0.84)",
      borderRadius: 999,
      boxShadow: "0 12px 24px rgba(0,0,0,0.18), 0 0 24px rgba(94,234,212,0.18)",
      border: "1px solid rgba(94,234,212,0.4)",
    },
  },
  stability: {
    accent: theme.stable,
    ornament: "line-top",
    shell: {
      background: "rgba(28,58,48,0.84)",
      borderRadius: 14,
      boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
      border: "1px solid rgba(61,220,151,0.36)",
    },
  },
  cta: {
    accent: theme.accent,
    ornament: "none",
    shell: {
      background: "rgba(42,58,88,0.8)",
      borderRadius: 12,
      boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
      border: "1px solid rgba(255,255,255,0.16)",
    },
    text: { fontWeight: 700 },
  },
};

function chapterAtFrame(frame: number): Chapter {
  const { hook, intro, timing, stability } = sceneFrames;
  if (frame < hook) return "hook";
  if (frame < hook + intro) return "intro";
  if (frame < hook + intro + timing) return "timing";
  if (frame < hook + intro + timing + stability) return "stability";
  return "cta";
}

export function resolveCounterStrafingSubtitleStyle(frame: number): SubtitleChapterStyle {
  return CHAPTER_STYLE[chapterAtFrame(frame)];
}
