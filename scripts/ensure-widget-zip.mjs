import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { root } from './load-env.mjs';
import {
  buildWidgetZipName,
  normalizeVersion,
  readWidgetVersion,
} from './widget-version-lib.mjs';

const WIDGET_RELEASE_DIR = join(root, 'release', 'gamebar-widget');

function findLocalWidgetZip(widgetVersion) {
  const zipName = buildWidgetZipName(widgetVersion);
  const zipPath = join(WIDGET_RELEASE_DIR, zipName);
  if (existsSync(zipPath)) {
    return { zipPath, zipName };
  }
  return null;
}

function listGithubReleases() {
  try {
    const output = execSync('gh release list --limit 50 --json tagName,isDraft,isPrerelease', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch {
    return [];
  }
}

function getReleaseAssets(tag) {
  try {
    const output = execSync(`gh release view ${tag} --json assets`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const data = JSON.parse(output);
    return data.assets ?? [];
  } catch {
    return [];
  }
}

function downloadFromRelease(tag, zipName) {
  mkdirSync(WIDGET_RELEASE_DIR, { recursive: true });
  execSync(
    `gh release download ${tag} --pattern "${zipName}" --dir "${WIDGET_RELEASE_DIR}" --clobber`,
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
}

function reuseWidgetZipFromGithub(widgetVersion) {
  const zipName = buildWidgetZipName(widgetVersion);
  const releases = listGithubReleases();
  for (const release of releases) {
    if (release.isDraft || release.isPrerelease) continue;
    const assets = getReleaseAssets(release.tagName);
    const asset = assets.find((item) => item.name === zipName);
    if (!asset) continue;
    console.log(`从 GitHub Release ${release.tagName} 复用 Widget zip: ${zipName}`);
    downloadFromRelease(release.tagName, zipName);
    return { zipPath: join(WIDGET_RELEASE_DIR, zipName), zipName, source: release.tagName };
  }
  return null;
}

function main() {
  const widgetVersion = normalizeVersion(process.argv[2] || readWidgetVersion());
  const existing = findLocalWidgetZip(widgetVersion);
  if (existing) {
    console.log(`本地已有 Widget zip: ${existing.zipPath}`);
    return;
  }

  const reused = reuseWidgetZipFromGithub(widgetVersion);
  if (reused) {
    console.log(`已复用 Widget zip: ${reused.zipPath}`);
    return;
  }

  console.error(`未找到 Widget zip: ${buildWidgetZipName(widgetVersion)}`);
  console.error('请先运行 npm run build:widget，或确保历史 GitHub Release 中存在同名 zip。');
  process.exit(1);
}

main();
