import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, root } from './load-env.mjs';

const releaseDir = join(root, 'release');
// 单文件 exe 分发：目标机需已安装 Microsoft Edge WebView2 Runtime
const exeSource = join(root, 'src-tauri/target/release/cs-match-helper.exe');
const appExeName = 'cs-match-helper.exe';
const uploadLunaris =
  process.argv.includes('--upload-lunaris') || process.env.AUTO_UPLOAD_LUNARIS === '1';

if (!existsSync(exeSource)) {
  console.error(`未找到构建产物: ${exeSource}`);
  console.error('请先运行 tauri build');
  process.exit(1);
}

if (existsSync(releaseDir)) {
  rmSync(releaseDir, { recursive: true, force: true });
}
mkdirSync(releaseDir, { recursive: true });
copyFileSync(exeSource, join(releaseDir, appExeName));

console.log(`已输出到: ${releaseDir}`);
for (const name of readdirSync(releaseDir)) {
  const size = statSync(join(releaseDir, name)).size;
  console.log(`  ${name}  ${size}`);
}

if (!uploadLunaris) {
  process.exit(0);
}

loadEnvFile();

if (!process.env.LUNARIS_API_KEY?.trim()) {
  console.error('\n发版需要上传 Lunaris，但未配置 LUNARIS_API_KEY。');
  console.error('请在 .env 或系统环境中设置后重试。');
  process.exit(1);
}

console.log('\n── 自动上传 Lunaris CDN ──');
const uploadScript = join(dirname(fileURLToPath(import.meta.url)), 'lunaris-upload.mjs');
const result = spawnSync(process.execPath, [uploadScript], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

if (result.status !== 0) {
  console.error('\nLunaris 上传失败，发版中止。');
  process.exit(result.status ?? 1);
}
