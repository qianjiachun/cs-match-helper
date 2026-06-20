import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile, root } from './load-env.mjs';

const LUNARIS_USERNAME = 'qianjiachun';
const APP_FILE_NAME = 'cs-match-helper.exe';
const CDN_BASE = `https://cdn.lunaris.win/${LUNARIS_USERNAME}/cs-match-helper/${APP_FILE_NAME}`;

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return String(packageJson.version).trim().replace(/^v/i, '');
}

function normalizeTag(version) {
  return String(version).trim().replace(/^v/i, '');
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
  const url = `${CDN_BASE}?download&v=${versionTag}`;
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

async function main() {
  loadEnvFile();

  const version = normalizeTag(process.argv[2] || readPackageVersion());
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

  let versionVerifyOk = false;
  try {
    execSync('npm run version:verify', { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    versionVerifyOk = true;
  } catch {
    versionVerifyOk = false;
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

  let githubReleaseExists = false;
  try {
    execSync(`gh release view ${tag}`, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    githubReleaseExists = true;
  } catch {
    githubReleaseExists = false;
  }

  const steps = {
    versionSet: versionVerifyOk,
    versionVerify: versionVerifyOk,
    buildDone: exeExists && exeSize > 0,
    lunarisUploaded: lunaris.ready,
    committed: hasReleaseCommit && workingTreeClean,
    pushed: unpushedCommits === 0 && hasReleaseCommit,
    githubRelease: githubReleaseExists,
  };

  let nextStep = 'done';
  let nextAction = null;

  if (!steps.versionVerify) {
    nextStep = 'version';
    nextAction = 'npm run version:set X.Y.Z && npm run version:verify';
  } else if (!steps.buildDone) {
    nextStep = 'build';
    nextAction = 'npm run build:release';
  } else if (!steps.lunarisUploaded) {
    nextStep = 'lunaris';
    nextAction = 'npm run release:lunaris';
  } else if (!hasReleaseCommit || !workingTreeClean) {
    nextStep = 'commit';
    nextAction = 'git add + commit（见 git-commit skill）';
  } else if (unpushedCommits > 0) {
    nextStep = 'push';
    nextAction = 'git push origin main';
  } else if (!steps.githubRelease) {
    nextStep = 'github-release';
    nextAction = `gh release create ${tag}`;
  } else {
    nextStep = 'done';
    nextAction = null;
  }

  const status = {
    version,
    tag,
    steps,
    nextStep,
    nextAction,
    exe: exeExists ? { path: exePath, size: exeSize, sha256: localSha256 } : null,
    lunaris,
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
