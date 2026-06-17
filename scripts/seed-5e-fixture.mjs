/**
 * 从 agent transcript 提取用户提供的三份 5E API 响应，生成 fixture 与 payload 文件。
 * 用法: node scripts/seed-5e-fixture.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const transcriptPath = path.join(
  process.env.USERPROFILE ?? '',
  '.cursor/projects/e-Code-csgo-cs-match-helper/agent-transcripts/c5ffff96-dd4d-4ca0-aad6-dc2fc4c1b4a7/c5ffff96-dd4d-4ca0-aad6-dc2fc4c1b4a7.jsonl',
);

const UUIDS = [
  '76af4325-dd04-11ed-9ce2-ec0d9a495494',
  'fd023f9a-efda-11f0-a93a-0c42a164bc3c',
  'ed954be0-7222-11ee-9ce2-ec0d9a495494',
  '9765b3f5-fd93-11ef-848e-506b4bfa3106',
  'f0b5effe-f25d-11ea-a071-ec0d9a718678',
  'b6c90410-53b8-11ef-ac9f-ec0d9a7185e0',
  '6fb40ff3-e1fc-11ef-848e-506b4bfa3106',
  'ee440358-95ee-11ef-ac9f-ec0d9a7185e0',
  'a2f6b0d8-8504-11f0-a93a-0c42a164bc3c',
  '921e3a65-62af-11f0-a93a-0c42a164bc3c',
];

const MATCH_CODE = 'g161-20260614142743982331607';

function extractJsonBlocks(text) {
  const blocks = [];
  const re = /```\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].trim();
    if (raw.startsWith('{')) {
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        // skip invalid
      }
    }
  }
  return blocks;
}

function findUserMessage(text) {
  if (!text.includes('6fb40ff3-e1fc-11ef-848e-506b4bfa3106')) return null;
  if (!text.includes('请你忘掉之前5e的mock数据')) return null;
  return text;
}

function loadBlocksFromTranscript() {
  if (!fs.existsSync(transcriptPath)) {
    throw new Error(`Transcript not found: ${transcriptPath}`);
  }
  const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const parts = row?.message?.content;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (part.type !== 'text' || typeof part.text !== 'string') continue;
      const msg = findUserMessage(part.text);
      if (!msg) continue;
      const blocks = extractJsonBlocks(msg);
      if (blocks.length >= 3) return blocks;
    }
  }
  throw new Error('Could not find 3 JSON blocks in transcript user message');
}

function classifyBlock(block) {
  const data = block.data;
  if (!data || typeof data !== 'object') return null;
  const firstKey = Object.keys(data)[0];
  const first = data[firstKey];
  if (!first || typeof first !== 'object') return null;
  if ('de_dust2' in first || 'de_mirage' in first) return 'mapExt';
  if ('modes' in first) return 'eloInfo';
  if ('username' in first || 'steam_id' in first) return 'userInfo';
  return null;
}

function main() {
  const blocks = loadBlocksFromTranscript();
  const classified = { mapExt: null, eloInfo: null, userInfo: null };
  for (const block of blocks) {
    const kind = classifyBlock(block);
    if (kind && !classified[kind]) classified[kind] = block;
  }
  for (const k of ['mapExt', 'eloInfo', 'userInfo']) {
    if (!classified[k]) throw new Error(`Missing block: ${k}`);
  }

  const payloadDir = path.join(root, 'src/platforms/5e/fixtures/payloads');
  fs.mkdirSync(payloadDir, { recursive: true });

  fs.writeFileSync(
    path.join(payloadDir, 'map-ext.response.json'),
    JSON.stringify(classified.mapExt, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(payloadDir, 'elo.response.json'),
    JSON.stringify(classified.eloInfo, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(payloadDir, 'user-info.response.json'),
    JSON.stringify(classified.userInfo, null, 2),
    'utf8',
  );

  const fixture = {
    description: '5e 匹配成功 fixture（10 人实采样本，地图由 match API 实时获取）',
    matchMode: [9],
    matchCode: MATCH_CODE,
    events: {
      mapExt: {
        url: 'https://gate.5eplay.com/cranenew/http/api/data/player/map-ext/batch',
        requestBody: { uuids: UUIDS },
        responseBody: classified.mapExt,
      },
      eloInfo: {
        url: 'https://gate.5eplay.com/cranenew/http/api/data/player/elo/info/batch',
        requestBody: { user: UUIDS, match_mode: [9] },
        responseBody: classified.eloInfo,
      },
      userInfo: {
        url: 'https://platform-api.5eplay.com/api/user/info',
        requestBody: { uuids: UUIDS },
        responseBody: classified.userInfo,
      },
    },
  };

  const fixturePath = path.join(root, 'src/platforms/5e/fixtures/5e-match-success.fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8');
  console.log('Wrote fixture and payloads:', fixturePath);
}

main();
