import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MAINVIEW_ROOT = path.resolve(process.cwd(), 'src/mainview');
const STYLE_SOURCE_EXTENSIONS = new Set(['.css', '.html', '.ts', '.vue']);
const SYSTEM_MOTION_OVERRIDE =
  /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)|motion-(?:reduce|safe):/;

function collectStyleSources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectStyleSources(entryPath);
    return STYLE_SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

describe('application motion policy', () => {
  it('does not let the operating-system reduced-motion preference disable app animations', () => {
    const violations = collectStyleSources(MAINVIEW_ROOT)
      .filter((filePath) => SYSTEM_MOTION_OVERRIDE.test(fs.readFileSync(filePath, 'utf8')))
      .map((filePath) => path.relative(MAINVIEW_ROOT, filePath));

    expect(violations).toEqual([]);
  });
});
