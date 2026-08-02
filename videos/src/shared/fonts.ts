import { loadFont as loadNotoSansSC } from "@remotion/google-fonts/NotoSansSC";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";

/** Geometric Latin — keys, numbers, English labels */
const syne = loadSyne("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
});

/** Modern CJK for titles & body — more lively than system YaHei */
const noto = loadNotoSansSC("normal", {
  weights: ["500", "700", "900"],
  subsets: ["chinese-simplified", "latin"],
  ignoreTooManyRequestsWarning: true,
});

const cjkFallback =
  '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif';

export const fonts = {
  /** Chinese + UI copy */
  body: `"${noto.fontFamily}", ${cjkFallback}`,
  /** Latin display (WASD, ms, COUNTER-STRAFE) */
  display: `"${syne.fontFamily}", "${noto.fontFamily}", ${cjkFallback}`,
};
