import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  widgetVersionJson: join(root, 'gamebar-widget', 'widget-version.json'),
  appxManifest: join(root, 'gamebar-widget', 'CSMatchHelperWidget', 'Package.appxmanifest'),
};

const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export function validateVersion(version) {
  if (!VERSION_RE.test(version)) {
    fail(`无效 Widget 版本号: ${version}（需形如 1.2.3 或 1.2.3-beta.1）`);
  }
}

export function normalizeVersion(version) {
  return String(version).trim().replace(/^v/i, '');
}

export function readWidgetVersionJson() {
  if (!existsSync(paths.widgetVersionJson)) {
    fail(`未找到 Widget 版本文件: ${paths.widgetVersionJson}`);
  }
  return JSON.parse(readFileSync(paths.widgetVersionJson, 'utf8'));
}

export function readWidgetVersion() {
  const data = readWidgetVersionJson();
  return normalizeVersion(data.version);
}

export function toAppxVersion(version) {
  const normalized = normalizeVersion(version);
  const parts = normalized.split('.');
  if (parts.length >= 4) {
    return parts.slice(0, 4).join('.');
  }
  return `${parts[0] ?? '0'}.${parts[1] ?? '0'}.${parts[2] ?? '0'}.0`;
}

export function readAppxManifestVersion() {
  const content = readFileSync(paths.appxManifest, 'utf8');
  const match = content.match(/<Identity[\s\S]*?Version="([^"]+)"/);
  if (!match) fail('无法在 Package.appxmanifest 中解析 Identity Version');
  return match[1];
}

export function writeWidgetVersionJson(version) {
  writeFileSync(
    paths.widgetVersionJson,
    `${JSON.stringify({ version: normalizeVersion(version) }, null, 2)}\n`,
  );
}

export function writeAppxManifestVersion(version) {
  const appxVersion = toAppxVersion(version);
  const content = readFileSync(paths.appxManifest, 'utf8');
  const match = content.match(/(<Identity[\s\S]*?Version=")([^"]+)(")/);
  if (!match) fail('无法在 Package.appxmanifest 中解析 Identity Version');
  if (match[2] === appxVersion) return false;
  const next = content.replace(
    /(<Identity[\s\S]*?Version=")([^"]+)(")/,
    `$1${appxVersion}$3`,
  );
  writeFileSync(paths.appxManifest, next);
  return true;
}

export function syncFromWidgetVersionJson() {
  const version = readWidgetVersion();
  validateVersion(version);
  const updated = writeAppxManifestVersion(version);
  if (updated) {
    console.log(`已同步 Widget 版本 ${version} → Package.appxmanifest (${toAppxVersion(version)})`);
  } else {
    console.log(`Widget 版本已一致: ${version}`);
  }
  return version;
}

export function setWidgetVersion(version) {
  validateVersion(version);
  const normalized = normalizeVersion(version);
  writeWidgetVersionJson(normalized);
  writeAppxManifestVersion(normalized);
  console.log(
    `Widget 版本已设为 ${normalized}，并已同步至 Package.appxmanifest (${toAppxVersion(normalized)})`,
  );
  return normalized;
}

export function verifyWidgetVersions() {
  const versions = {
    'widget-version.json': readWidgetVersion(),
    'Package.appxmanifest': readAppxManifestVersion(),
  };

  const expectedAppx = toAppxVersion(versions['widget-version.json']);
  if (versions['Package.appxmanifest'] !== expectedAppx) {
    console.error('Widget 版本号不一致：');
    console.error(`  widget-version.json: ${versions['widget-version.json']}`);
    console.error(`  Package.appxmanifest: ${versions['Package.appxmanifest']}`);
    console.error(`  期望 manifest 版本: ${expectedAppx}`);
    process.exit(1);
  }

  validateVersion(versions['widget-version.json']);
  console.log(`Widget 版本一致: ${versions['widget-version.json']}`);
  return versions['widget-version.json'];
}

export function buildWidgetZipName(version) {
  return `CSMatchHelperGameBarWidget-${normalizeVersion(version)}.zip`;
}
