export interface PixelAvatar {
  size: number;
  pixels: string[];
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/;

export function normalizeCommentColor(color: string | undefined | null): string | null {
  const normalized = color?.trim().toLowerCase();
  if (!normalized || !HEX_COLOR_RE.test(normalized)) return null;
  return normalized;
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function buildPalette(color: string, h: number, s: number, l: number, hash: number): string[] {
  return [
    hslToHex(h, Math.max(20, s - 20), Math.min(94, l + 38)),
    color,
    hslToHex(h, s, Math.max(18, l - 18)),
    hslToHex((h + 35 + (hash % 40)) % 360, s, Math.min(70, l + 8)),
  ];
}

export function generateAvatarFromColor(color: string): PixelAvatar | null {
  const normalized = normalizeCommentColor(color);
  if (!normalized) return null;

  const size = 8;
  const half = size / 2;
  const { h, s, l } = hexToHsl(normalized);
  const hash = hashString(normalized);
  const palette = buildPalette(normalized, h, s, l, hash);
  const pixels = new Array<string>(size * size);
  let seed = (hash ^ 0x9e3779b9) >>> 0;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < half; x++) {
      const roll = next() % 100;
      const c =
        roll < 42 ? palette[0] : roll < 72 ? palette[1] : roll < 90 ? palette[2] : palette[3];
      pixels[y * size + x] = c;
      pixels[y * size + (size - 1 - x)] = c;
    }
  }
  return { size, pixels };
}

export function drawPixelAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: PixelAvatar,
  x: number,
  y: number,
  pixelSize: number,
) {
  const { size, pixels } = avatar;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      ctx.fillStyle = pixels[row * size + col];
      ctx.fillRect(x + col * pixelSize, y + row * pixelSize, pixelSize, pixelSize);
    }
  }
}
