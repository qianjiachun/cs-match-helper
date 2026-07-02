import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile, root } from './load-env.mjs';
import {
  buildWidgetZipName,
  normalizeVersion,
  readWidgetVersion,
} from './widget-version-lib.mjs';

const LUNARIS_USERNAME = 'qianjiachun';
const APP_FILE_NAME = 'cs-match-helper.exe';
const WIDGET_ZIP_PREFIX = 'CSMatchHelperGameBarWidget-';
const EXE_CDN_BASE = `https://cdn.lunaris.win/${LUNARIS_USERNAME}/cs-match-helper/${APP_FILE_NAME}`;
const WIDGET_CDN_BASE = `https://cdn.lunaris.win/${LUNARIS_USERNAME}/cs-match-helper-widget`;
const WIDGET_RELEASE_DIR = join(root, 'release', 'gamebar-widget');

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return normalizeVersion(packageJson.version);
}

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function checkLunarisCdn(versionTag, localSha256) {
  const url = `${EXE_CDN_BASE}?download&v=${versionTag}`;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      return { ready: false, reason: `CDN HTTP ${response.status}`, url };
    }
    const remoteSha = response.headers.get('x-checksum-sha256')?.trim().toLowerCase();
    if (!remoteSha) {
      return { ready: false, reason: 'CDN 缺少校验头', url };
    }
    if (localSha256 && remoteSha !== localSha256.toLowerCase()) {
      return {
        ready: false,
        reason: 'CDN 文件与本地 exe 校验不一致，需重新上传',
        url,
        remoteSha,
      };
    }
    return { ready: true, url, remoteSha };
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

function findWidgetZip(widgetVersion) {
  if (!existsSync(WIDGET_RELEASE_DIR)) {
    return null;
  }
  const expected = buildWidgetZipName(widgetVersion);
  const expectedPath = join(WIDGET_RELEASE_DIR, expected);
  if (existsSync(expectedPath)) {
    return { zipPath: expectedPath, zipName: expected, version: widgetVersion };
  }
  const zips = readdirSync(WIDGET_RELEASE_DIR)
    .filter((name) => name.startsWith(WIDGET_ZIP_PREFIX) && name.endsWith('.zip'))
    .sort();
  if (!zips.length) return null;
  const zipName = zips[zips.length - 1];
  const version = zipName.slice(WIDGET_ZIP_PREFIX.length, -4);
  return { zipPath: join(WIDGET_RELEASE_DIR, zipName), zipName, version };
}

async function checkWidgetCdn(widgetVersion, localSha256) {
  const zipName = buildWidgetZipName(widgetVersion);
  const url = `${WIDGET_CDN_BASE}/${zipName}?download&v=${widgetVersion}`;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      return { ready: false, reason: `Widget CDN HTTP ${response.status}`, url };
    }
    const remoteSha = response.headers.get('x-checksum-sha256')?.trim().toLowerCase();
    if (!remoteSha) {
      return { ready: false, reason: 'Widget CDN 缺少校验头', url };
    }
    if (localSha256 && remoteSha !== localSha256.toLowerCase()) {
      return {
        ready: false,
        reason: 'Widget CDN 与本地 zip 校验不一致，需重新上传',
        url,
        remoteSha,
      };
    }
    return { ready: true, url, remoteSha, version: widgetVersion };
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

function checkGithubReleaseAssets(tag, expectedWidgetZipName) {
  try {
    const output = execSync(`gh release view ${tag} --json assets`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const data = JSON.parse(output);
    const assetNames = (data.assets ?? []).map((asset) => asset.name);
    const hasExe = assetNames.includes(APP_FILE_NAME);
    const hasWidgetZip = assetNames.includes(expectedWidgetZipName);
    return {
      ready: hasExe && hasWidgetZip,
      hasExe,
      hasWidgetZip,
      assets: assetNames,
    };
  } catch {
    return {
      ready: false,
      hasExe: false,
      hasWidgetZip: false,
      assets: [],
      reason: 'GitHub Release 不存在或无法读取',
    };
  }
}

function runEnsureWidgetZip(widgetVersion) {
  const result = spawnSync(process.execPath, ['scripts/ensure-widget-zip.mjs', widgetVersion], {
    cwd: root,
    stdio: 'inherit',
  });
  return result.status === 0;
}

async function main() {
  loadEnvFile();

  const version = normalizeVersion(process.argv[2] || readPackageVersion());
  const widgetVersion = normalizeVersion(readWidgetVersion());
  const tag = `v${version}`;
  const exePath = join(root, 'release', APP_FILE_NAME);
  const exeExists = existsSync(exePath);

  let localSha256 = null;
  let exeSize = 0;
  if (exeExists) {
    exeSize = statSync(exePath).size;
    localSha256 = await sha256File(exePath);
  }

  const lunaris = await checkLunarisCdn(version, localSha256);

  let widgetZip = findWidgetZip(widgetVersion);
  let widgetLocalSha256 = null;
  let widgetZipSize = 0;
  if (!widgetZip && exeExists) {
    runEnsureWidgetZip(widgetVersion);
    widgetZip = findWidgetZip(widgetVersion);
  }

  if (widgetZip) {
    widgetZipSize = statSync(widgetZip.zipPath).size;
    widgetLocalSha256 = await sha256File(widgetZip.zipPath);
  }

  const widgetLunaris = widgetZip
    ? await checkWidgetCdn(widgetVersion, widgetLocalSha256)
    : { ready: false, reason: '本地未找到 Widget zip', url: null };

  let versionVerifyOk = false;
  try {
    execSync('npm run version:verify', { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    versionVerifyOk = true;
  } catch {
    versionVerifyOk = false;
  }

  let widgetVersionVerifyOk = false;
  try {
    execSync('npm run widget:version:verify', { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    widgetVersionVerifyOk = true;
  } catch {
    widgetVersionVerifyOk = false;
  }

  const releaseCommitLog = git(`log -20 --oneline --grep="release: ${tag}"`);
  const hasReleaseCommit =
    releaseCommitLog.includes(tag) || git('log -1 --oneline').includes(`release: ${tag}`);
  const workingTreeClean = git('status --porcelain') === '';

  let unpushedCommits = 0;
  try {
    const ahead = git('rev-list --count @{u}..HEAD');
    unpushedCommits = Number.parseInt(ahead, 10) || 0;
  } catch {
    unpushedCommits = 0;
  }

  const expectedWidgetZipName = buildWidgetZipName(widgetVersion);
  const githubRelease = checkGithubReleaseAssets(tag, expectedWidgetZipName);

  const steps = {
    versionSet: versionVerifyOk,
    versionVerify: versionVerifyOk,
    widgetVersionVerify: widgetVersionVerifyOk,
    buildDone: exeExists && exeSize > 0,
    widgetBuildDone: Boolean(widgetZip && widgetZipSize > 0),
    lunarisUploaded: lunaris.ready,
    widgetLunarisUploaded: widgetLunaris.ready,
    committed: hasReleaseCommit && workingTreeClean,
    pushed: unpushedCommits === 0 && hasReleaseCommit,
    githubRelease: githubRelease.ready,
  };

  let nextStep = 'done';
  let nextAction = null;

  if (!steps.versionVerify) {
    nextStep = 'version';
    nextAction = 'npm run version:set X.Y.Z && npm run version:verify';
  } else if (!steps.widgetVersionVerify) {
    nextStep = 'widget-version';
    nextAction = 'npm run widget:version:sync && npm run widget:version:verify';
  } else if (!steps.buildDone) {
    nextStep = 'build';
    nextAction = 'npm run build:release';
  } else if (!steps.widgetBuildDone) {
    nextStep = 'widget-ensure';
    nextAction = 'npm run widget:ensure-zip || npm run build:widget';
  } else if (!steps.lunarisUploaded) {
    nextStep = 'lunaris';
    nextAction = 'npm run release:lunaris';
  } else if (!steps.widgetLunarisUploaded) {
    nextStep = 'widget-lunaris';
    nextAction = 'npm run release:widget';
  } else if (!hasReleaseCommit || !workingTreeClean) {
    nextStep = 'commit';
    nextAction = 'git add + commit（见 git-commit skill）';
  } else if (unpushedCommits > 0) {
    nextStep = 'push';
    nextAction = 'git push origin main';
  } else if (!steps.githubRelease) {
    nextStep = 'github-release';
    nextAction = `gh release create ${tag}（附 exe + widget zip）`;
  } else {
    nextStep = 'done';
    nextAction = null;
  }

  const status = {
    version,
    widgetVersion,
    tag,
    steps,
    nextStep,
    nextAction,
    exe: exeExists ? { path: exePath, size: exeSize, sha256: localSha256 } : null,
    widget: widgetZip
      ? {
          path: widgetZip.zipPath,
          size: widgetZipSize,
          sha256: widgetLocalSha256,
          zipName: widgetZip.zipName,
        }
      : null,
    lunaris,
    widgetLunaris,
    githubRelease,
    git: {
      hasReleaseCommit,
      workingTreeClean,
      unpushedCommits,
    },
  };

  console.log(JSON.stringify(status, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
