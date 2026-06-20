import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvFile, root } from './load-env.mjs';

const BASE_URL = 'https://lunaris.win/api/v1';
const PROJECT_SLUG = 'cs-match-helper';
const LUNARIS_USERNAME = 'qianjiachun';
const APP_FILE_NAME = 'cs-match-helper.exe';

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return String(packageJson.version).trim().replace(/^v/i, '');
}

function normalizeVersionTag(version) {
  return String(version).trim().replace(/^v/i, '');
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

async function lunarisRequest(path, options = {}) {
  const apiKey = getApiKey();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.body && !(options.body instanceof Buffer)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`;
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

async function uploadFile(filePath, versionTag) {
  const totalSize = statSync(filePath).size;
  console.log(`开始上传 ${APP_FILE_NAME} (${totalSize} bytes) -> ${versionTag}`);

  const initiate = await lunarisRequest('/upload/initiate', {
    method: 'POST',
    body: JSON.stringify({
      projectSlug: PROJECT_SLUG,
      versionTag,
      fileName: APP_FILE_NAME,
      filePath: APP_FILE_NAME,
      totalSize,
    }),
  });

  const { uploadSessionId, partSize, totalParts } = initiate;
  console.log(`上传会话: ${uploadSessionId}，共 ${totalParts} 个分片`);

  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    const start = (partNumber - 1) * partSize;
    const length = Math.min(partSize, totalSize - start);
    const chunk = await readFilePart(filePath, start, length);

    const response = await lunarisRequest('/upload/part', {
      method: 'PUT',
      headers: {
        'x-upload-session-id': uploadSessionId,
        'x-part-number': String(partNumber),
      },
      body: chunk,
    });

    console.log(
      `分片 ${partNumber}/${totalParts} 完成（已上传 ${response.uploadedCount ?? partNumber}）`,
    );
  }

  console.log('计算 SHA-256…');
  const sha256 = await computeSha256(filePath);

  const complete = await lunarisRequest('/upload/complete', {
    method: 'POST',
    body: JSON.stringify({ uploadSessionId, sha256 }),
  });

  console.log('上传完成:', complete.file?.fileName ?? APP_FILE_NAME);
  return complete.file;
}

async function promoteLatest(versionTag) {
  await lunarisRequest(`/projects/${PROJECT_SLUG}/versions/${versionTag}/set-latest`, {
    method: 'POST',
  });
  console.log(`已标记 latest: ${versionTag}`);
}

async function main() {
  loadEnvFile();

  const versionArg = process.argv[2];
  const versionTag = normalizeVersionTag(versionArg || readPackageVersion());
  const filePath = join(root, 'release', APP_FILE_NAME);

  if (!existsSync(filePath)) {
    throw new Error(`未找到发版产物: ${filePath}\n请先运行 npm run build`);
  }

  console.log(`Lunaris 项目: ${PROJECT_SLUG}`);
  console.log(`版本 tag: ${versionTag}`);
  console.log(`CDN 地址: https://cdn.lunaris.win/${LUNARIS_USERNAME}/${PROJECT_SLUG}/${APP_FILE_NAME}?download&v=${versionTag}`);

  await ensureVersion(versionTag);
  await uploadFile(filePath, versionTag);
  await promoteLatest(versionTag);

  console.log('Lunaris 上传成功。');
}

main().catch((error) => {
  console.error(`Lunaris 上传失败: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
