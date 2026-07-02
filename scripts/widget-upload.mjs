import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnvFile, root } from './load-env.mjs';
import {
  buildWidgetZipName,
  normalizeVersion,
  readWidgetVersion,
} from './widget-version-lib.mjs';

const BASE_URL = 'https://lunaris.win/api/v1';
const PROJECT_SLUG = 'cs-match-helper-widget';
const LUNARIS_USERNAME = 'qianjiachun';
const WIDGET_RELEASE_DIR = join(root, 'release', 'gamebar-widget');

function getApiKey() {
  const apiKey = process.env.LUNARIS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('缺少环境变量 LUNARIS_API_KEY');
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

  const sha256 = await computeSha256(filePath);
  const complete = await lunarisRequest('/upload/complete', {
    method: 'POST',
    body: JSON.stringify({ uploadSessionId, sha256 }),
  });

  console.log('上传完成:', complete.file?.fileName ?? fileName);
  return { sha256, file: complete.file };
}

function findWidgetZip(widgetVersion) {
  const expected = buildWidgetZipName(widgetVersion);
  const expectedPath = join(WIDGET_RELEASE_DIR, expected);
  if (existsSync(expectedPath)) {
    return { zipPath: expectedPath, zipName: expected };
  }

  const zips = readdirSync(WIDGET_RELEASE_DIR)
    .filter((name) => name.startsWith('CSMatchHelperGameBarWidget-') && name.endsWith('.zip'))
    .sort();
  if (!zips.length) {
    throw new Error(`未找到 Widget zip，请先运行 npm run build:widget 或 npm run widget:ensure-zip`);
  }
  const zipName = zips[zips.length - 1];
  return { zipPath: join(WIDGET_RELEASE_DIR, zipName), zipName };
}

async function main() {
  loadEnvFile();

  const versionTag = normalizeVersion(process.argv[2] || readWidgetVersion());
  if (!existsSync(WIDGET_RELEASE_DIR)) {
    throw new Error(`未找到 Widget 发版目录: ${WIDGET_RELEASE_DIR}`);
  }

  const { zipPath, zipName } = findWidgetZip(versionTag);

  console.log(`Lunaris Widget 上传: ${zipName}`);
  await ensureVersion(versionTag);
  await uploadFile(zipPath, versionTag, zipName);

  await lunarisRequest(`/projects/${PROJECT_SLUG}/versions/${versionTag}/set-latest`, {
    method: 'POST',
  });

  console.log(
    `Widget CDN: https://cdn.lunaris.win/${LUNARIS_USERNAME}/${PROJECT_SLUG}/${zipName}?download&v=${versionTag}`,
  );
  console.log('Widget Lunaris 上传成功。');
}

main().catch((error) => {
  console.error(`Widget Lunaris 上传失败: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
