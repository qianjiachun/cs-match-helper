const SEED = 42;

export function decodePayload(hex: string): string | null {
  if (!hex || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte ^ ((SEED + 3 * i) % 255);
  }
  return new TextDecoder().decode(bytes);
}

export function decodeLogLine(line: string): string {
  const start = line.indexOf('^');
  const end = line.lastIndexOf('$');
  if (start < 0 || end <= start || end !== line.length - 1) return line;
  const prefix = line.slice(0, start);
  const hex = line.slice(start + 1, end);
  const decoded = decodePayload(hex);
  return decoded === null ? line : prefix + decoded;
}
