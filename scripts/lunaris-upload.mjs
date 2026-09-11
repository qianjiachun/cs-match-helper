import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvFile, root } from './load-env.mjs';

const BASE_URL = 'https://lunaris.win/api/v1';
const PROJECT_SLUG = 'cs-match-helper';
const LUNARIS_USERNAME = 'qianjiachun';
const APP_FILE_NAME = 'cs-match-helper.exe';
const MANIFEST_FILE_NAME = 'latest.json';
const GITHUB_REPO = 'qianjiachun/cs-match-helper';
const MANIFEST_CDN_URL = `https://cdn.lunaris.win/${LUNARIS_USERNAME}/${PROJECT_SLUG}/${MANIFEST_FILE_NAME}?download`;

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return String(packageJson.version).trim().replace(/^v/i, '');
}

function normalizeVersionTag(version) {
  return String(version).trim().replace(/^v/i, '');
}

function githubTag(version) {
  return `v${normalizeVersionTag(version)}`;
}

function getApiKey() {
  const apiKey = process.env.LUNARIS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      '缺少环境变量 LUNARIS_API_KEY。请在本地 .env 或系统环境中配置（仅发版脚本使用，不会打包进客户端）。',
    );
  }
  return apiKey;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function curlRequest(url, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  const args = [
    '-sS',
    '--connect-timeout',
    '60',
    '--max-time',
    '180',
    '-X',
    method,
    '-w',
    '\n__HTTP_STATUS__:%{http_code}',
  ];
  let tmpFile = null;

  if (options.body != null) {
    if (Buffer.isBuffer(options.body)) {
      headers['Content-Type'] ??= 'application/octet-stream';
      tmpFile = join(root, 'release', `.lunaris-part-${process.pid}-${Date.now()}`);
      writeFileSync(tmpFile, options.body);
      args.push('--data-binary', `@${tmpFile}`);
    } else {
      headers['Content-Type'] ??= 'application/json';
      args.push('--data-binary', String(options.body));
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }
  args.push(url);

  try {
    const output = execFileSync('curl.exe', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    const marker = '\n__HTTP_STATUS__:';
    const idx = output.lastIndexOf(marker);
    if (idx === -1) {
      throw new Error('curl 未返回 HTTP 状态');
    }
    return {
      status: Number.parseInt(output.slice(idx + marker.length).trim(), 10),
      text: output.slice(0, idx),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('curl ')) {
      throw error;
    }
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr).trim()
      : '';
    const detail = stderr || (error instanceof Error ? error.message.split('\n')[0] : 'curl 请求失败');
    throw new Error(`curl ${method} 失败: ${detail}`);
  } finally {
    if (tmpFile) rmSync(tmpFile, { force: true });
  }
}

async function requestWithRetry(url, options = {}, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return curlRequest(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const waitMs = Math.min(20_000, 1_000 * 2 ** (attempt - 1));
      const message = (error instanceof Error ? error.message : String(error))
        .replace(/Bearer\s+\S+/gi, 'Bearer ***');
      console.log(`网络请求失败（${attempt}/${attempts}）: ${message}，${waitMs}ms 后重试`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

async function lunarisRequest(path, options = {}) {
  const apiKey = getApiKey();
  const { status, text } = await requestWithRetry(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (status < 200 || status >= 300) {
    const message =
      payload?.error ||
      payload?.message ||
      `HTTP ${status}${text ? `: ${text.slice(0, 200)}` : ''}`;
    throw new Error(message);
  }

  return payload;
}

async function ensureVersion(versionTag) {
  try {
    await lunarisRequest(`/projects/${PROJECT_SLUG}/versions/${versionTag}`);
    console.log(`版本已存在: ${versionTag}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('not found')) {
      throw error;
    }
    console.log(`创建版本: ${versionTag}`);
    await lunarisRequest(`/projects/${PROJECT_SLUG}/versions`, {
      method: 'POST',
      body: JSON.stringify({ tag: versionTag }),
    });
  }
}

async function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readFilePart(filePath, start, length) {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function uploadFile(filePath, versionTag, fileName) {
  const totalSize = statSync(filePath).size;
  console.log(`开始上传 ${fileName} (${totalSize} bytes) -> ${versionTag}`);

  const initiate = await lunarisRequest('/upload/initiate', {
    method: 'POST',
    body: JSON.stringify({
      projectSlug: PROJECT_SLUG,
      versionTag,
      fileName,
      filePath: fileName,
      totalSize,
    }),
  });

  const { uploadSessionId, partSize, totalParts } = initiate;
  console.log(`上传会话: ${uploadSessionId}，共 ${totalParts} 个分片`);

  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    const start = (partNumber - 1) * partSize;
    const length = Math.min(partSize, totalSize - start);
    const chunk = await readFilePart(filePath, start, length);

    let uploadedCount = partNumber;
    try {
      const response = await lunarisRequest('/upload/part', {
        method: 'PUT',
        headers: {
          'x-upload-session-id': uploadSessionId,
          'x-part-number': String(partNumber),
        },
        body: chunk,
      });
      uploadedCount = response.uploadedCount ?? partNumber;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('already been uploaded')) {
        throw error;
      }
    }

    console.log(
      `分片 ${partNumber}/${totalParts} 完成（已上传 ${uploadedCount}）`,
    );
  }

  console.log(`计算 SHA-256… ${fileName}`);
  const sha256 = await computeSha256(filePath);

  const complete = await lunarisRequest('/upload/complete', {
    method: 'POST',
    body: JSON.stringify({ uploadSessionId, sha256 }),
  });

  console.log('上传完成:', complete.file?.fileName ?? fileName);
  return complete.file;
}

async function uploadFileIfNeeded(filePath, versionTag, fileName) {
  try {
    return await uploadFile(filePath, versionTag, fileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('already exists')) {
      throw error;
    }
    console.log(`文件已存在，跳过: ${fileName}`);
    return null;
  }
}

async function promoteLatest(versionTag) {
  await lunarisRequest(`/projects/${PROJECT_SLUG}/versions/${versionTag}/set-latest`, {
    method: 'POST',
  });
  console.log(`已标记 latest: ${versionTag}`);
}

function readNotesFile() {
  const notesPath = join(root, 'release', 'notes.md');
  if (!existsSync(notesPath)) return '';
  return readFileSync(notesPath, 'utf8').trim();
}

function ghJson(args) {
  try {
    const output = execFileSync('gh', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function normalizeReleaseEntry(entry) {
  const tag = githubTag(entry?.tag || entry?.tagName || entry?.tag_name || '');
  if (!tag || tag === 'v') return null;
  return {
    tag,
    publishedAt: entry?.publishedAt || entry?.published_at || null,
    body: String(entry?.body || '').trim(),
    htmlUrl:
      entry?.htmlUrl ||
      entry?.html_url ||
      `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
  };
}

function mergeReleaseEntries(primary, extras) {
  const byTag = new Map();
  for (const raw of [...primary, ...extras]) {
    const entry = normalizeReleaseEntry(raw);
    if (!entry) continue;
    const existing = byTag.get(entry.tag);
    if (!existing) {
      byTag.set(entry.tag, entry);
      continue;
    }
    if (!existing.body && entry.body) existing.body = entry.body;
    if (!existing.publishedAt && entry.publishedAt) existing.publishedAt = entry.publishedAt;
  }
  return [...byTag.values()];
}

async function fetchExistingManifestReleases() {
  try {
    const { status, text } = await requestWithRetry(MANIFEST_CDN_URL, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (status < 200 || status >= 300) return [];
    const payload = JSON.parse(text);
    return Array.isArray(payload?.releases) ? payload.releases : [];
  } catch {
    return [];
  }
}

function fetchGithubReleaseHistory() {
  const list = ghJson([
    'release',
    'list',
    '--repo',
    GITHUB_REPO,
    '--limit',
    '50',
    '--json',
    'tagName,publishedAt,isDraft,isPrerelease',
  ]);
  if (!Array.isArray(list)) return [];

  const releases = [];
  for (const item of list) {
    if (item.isDraft || item.isPrerelease) continue;
    const detail = ghJson([
      'release',
      'view',
      item.tagName,
      '--repo',
      GITHUB_REPO,
      '--json',
      'tagName,publishedAt,body,url',
    ]);
    releases.push({
      tag: item.tagName,
      publishedAt: detail?.publishedAt || item.publishedAt || null,
      body: detail?.body || '',
      htmlUrl: detail?.url || `https://github.com/${GITHUB_REPO}/releases/tag/${item.tagName}`,
    });
  }
  return releases;
}

async function buildManifest(versionTag, sha256) {
  const tag = githubTag(versionTag);
  const publishedAt = new Date().toISOString();
  const releaseNotes = readNotesFile();
  const current = {
    tag,
    publishedAt,
    body: releaseNotes,
    htmlUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
  };
  const releases = mergeReleaseEntries(
    [current],
    [...(await fetchExistingManifestReleases()), ...fetchGithubReleaseHistory()],
  );

  return {
    schemaVersion: 1,
    version: versionTag,
    publishedAt,
    sha256,
    releaseNotes,
    releaseUrl: current.htmlUrl,
    releases,
  };
}

async function main() {
  loadEnvFile();

  const versionArg = process.argv[2];
  const versionTag = normalizeVersionTag(versionArg || readPackageVersion());
  const filePath = join(root, 'release', APP_FILE_NAME);
  const manifestPath = join(root, 'release', MANIFEST_FILE_NAME);

  if (!existsSync(filePath)) {
    throw new Error(`未找到发版产物: ${filePath}\n请先运行 npm run build`);
  }

  console.log(`Lunaris 项目: ${PROJECT_SLUG}`);
  console.log(`版本 tag: ${versionTag}`);
  console.log(`CDN 地址: https://cdn.lunaris.win/${LUNARIS_USERNAME}/${PROJECT_SLUG}/${APP_FILE_NAME}?download&v=${versionTag}`);

  const sha256 = await computeSha256(filePath);
  const manifest = await buildManifest(versionTag, sha256);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  await ensureVersion(versionTag);
  await uploadFileIfNeeded(filePath, versionTag, APP_FILE_NAME);
  await uploadFileIfNeeded(manifestPath, versionTag, MANIFEST_FILE_NAME);
  await promoteLatest(versionTag);

  console.log(`更新通道: ${MANIFEST_CDN_URL}`);
  console.log('Lunaris 上传成功。');
}

main().catch((error) => {
  console.error(`Lunaris 上传失败: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
