import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './load-env.mjs';

const forbiddenPaths = [
  'counter-strafing-hud.html',
  'counter-strafing-assessment-hud.html',
  'src/core/counter-strafing',
  'src/core/gamebar-widget',
  'src/mainview/hud',
  'src-tauri/src/counter_strafing',
  'src-tauri/src/gamebar_widget.rs',
];

const scanRoots = ['src', 'src-tauri/src', 'src-tauri/capabilities', 'src-tauri/permissions'];
const forbiddenText = [
  /CounterStrafingView/,
  /counter-strafing-hud\.html/,
  /counter-strafing-assessment-hud\.html/,
  /allow-get-gamebar-widget/,
  /allow-start-counter-strafing/,
  /CSMatchHud\.GameBarWidget/,
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const violations = [];
// Local ignored build caches and legacy certificates may remain for rollback.
// Only source/config paths that could enter a commit or product build are forbidden.
for (const path of forbiddenPaths) {
  if (existsSync(join(root, path))) violations.push(`forbidden path: ${path}`);
}

for (const scope of scanRoots) {
  for (const path of walk(join(root, scope))) {
    const repoPath = relative(root, path).replaceAll('\\', '/');
    if (repoPath === 'src-tauri/src/legacy_hud_cleanup.rs') continue;
    const content = readFileSync(path, 'utf8');
    for (const pattern of forbiddenText) {
      if (pattern.test(content)) violations.push(`forbidden product reference: ${repoPath} (${pattern})`);
    }
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('CS Match Helper product boundary verified.');
