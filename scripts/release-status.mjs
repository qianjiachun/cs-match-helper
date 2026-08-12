import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile, root } from './load-env.mjs';

const LUNARIS_USERNAME = 'qianjiachun';
const APP_FILE_NAME = 'cs-match-helper.exe';
const PROJECT_SLUG = 'cs-match-helper';
const EXE_CDN_BASE = `https://cdn.lunaris.win/${LUNARIS_USERNAME}/${PROJECT_SLUG}/${APP_FILE_NAME}`;

function normalizeVersion(version) {
  return String(version).trim().replace(/^v/i, '');
}

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return normalizeVersion(packageJson.version);
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
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

async function checkLunarisCdn(version, localSha256) {
  const url = `${EXE_CDN_BASE}?download&v=${version}`;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return { ready: false, reason: `CDN HTTP ${response.status}`, url };
    const remoteSha = response.headers.get('x-checksum-sha256')?.trim().toLowerCase();
    if (!remoteSha) return { ready: false, reason: 'CDN 缺少校验头', url };
    if (localSha256 && remoteSha !== localSha256.toLowerCase()) {
      return { ready: false, reason: 'CDN 文件与本地 exe 校验不一致', url, remoteSha };
    }
    return { ready: true, url, remoteSha };
  } catch (error) {
    return { ready: false, reason: error instanceof Error ? error.message : String(error), url };
  }
}

function checkGithubReleaseAsset(tag) {
  try {
    const output = execFileSync('gh', ['release', 'view', tag, '--json', 'assets'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const assetNames = (JSON.parse(output).assets ?? []).map((asset) => asset.name);
    return { ready: assetNames.includes(APP_FILE_NAME), assets: assetNames };
  } catch {
    return { ready: false, assets: [], reason: 'GitHub Release 不存在或无法读取' };
  }
}

async function main() {
  loadEnvFile();
  const version = normalizeVersion(process.argv[2] || readPackageVersion());
  const tag = `v${version}`;
  const exePath = join(root, 'release', APP_FILE_NAME);
  const exeExists = existsSync(exePath);
  const exeSize = exeExists ? statSync(exePath).size : 0;
  const localSha256 = exeExists ? await sha256File(exePath) : null;
  const lunaris = await checkLunarisCdn(version, localSha256);

  let versionVerify = false;
  try {
    execFileSync('npm', ['run', 'version:verify'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    versionVerify = true;
  } catch {}

  const releaseCommitLog = git(['log', '-20', '--oneline', `--grep=release: ${tag}`]);
  const hasReleaseCommit = releaseCommitLog.includes(tag);
  const workingTreeClean = git(['status', '--porcelain']) === '';
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const unpushedCommits = upstream
    ? Number.parseInt(git(['rev-list', '--count', '@{u}..HEAD']), 10) || 0
    : null;
  const githubRelease = checkGithubReleaseAsset(tag);

  const steps = {
    versionVerify,
    buildDone: exeExists && exeSize > 0,
    lunarisUploaded: lunaris.ready,
    committed: hasReleaseCommit && workingTreeClean,
    pushed: unpushedCommits === 0 && hasReleaseCommit,
    githubRelease: githubRelease.ready,
  };

  let nextStep = 'done';
  let nextAction = null;
  if (!steps.versionVerify) [nextStep, nextAction] = ['version', 'npm run version:set X.Y.Z'];
  else if (!steps.buildDone) [nextStep, nextAction] = ['build', 'npm run build:release'];
  else if (!steps.lunarisUploaded) [nextStep, nextAction] = ['lunaris', 'npm run release:lunaris'];
  else if (!steps.committed) [nextStep, nextAction] = ['commit', 'git add + commit'];
  else if (!steps.pushed) [nextStep, nextAction] = ['push', 'git push'];
  else if (!steps.githubRelease) {
    [nextStep, nextAction] = ['github-release', `gh release create ${tag}（仅附 ${APP_FILE_NAME}）`];
  }

  console.log(JSON.stringify({
    version,
    tag,
    steps,
    nextStep,
    nextAction,
    exe: exeExists ? { path: exePath, size: exeSize, sha256: localSha256 } : null,
    lunaris,
    githubRelease,
    git: { hasReleaseCommit, workingTreeClean, upstream: upstream || null, unpushedCommits },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
