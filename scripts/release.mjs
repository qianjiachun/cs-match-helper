import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, root } from './load-env.mjs';

const releaseDir = join(root, 'release');
const exeSource = join(root, 'src-tauri/target/release/cs-match-helper.exe');
const appExeName = 'cs-match-helper.exe';
const exeDest = join(releaseDir, appExeName);
const uploadLunaris =
  process.argv.includes('--upload-lunaris') || process.env.AUTO_UPLOAD_LUNARIS === '1';

if (!existsSync(exeSource)) {
  console.error(`未找到构建产物: ${exeSource}`);
  console.error('请先运行 tauri build');
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
copyFileSync(exeSource, exeDest);

const exeSize = statSync(exeDest).size;
console.log(`已输出主程序: ${exeDest}  (${exeSize} bytes)`);
console.log('Widget 请单独构建: npm run build:widget');

if (!uploadLunaris) {
  process.exit(0);
}

loadEnvFile();

if (!process.env.LUNARIS_API_KEY?.trim()) {
  console.error('\n发版需要上传 Lunaris，但未配置 LUNARIS_API_KEY。');
  console.error('请在 .env 或系统环境中设置后重试。');
  process.exit(1);
}

console.log('\n── 自动上传 Lunaris CDN（主程序）──');
const uploadScript = join(dirname(fileURLToPath(import.meta.url)), 'lunaris-upload.mjs');
const mainUpload = spawnSync(process.execPath, [uploadScript], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

if (mainUpload.status !== 0) {
  console.error('\n主程序 Lunaris 上传失败，发版中止。');
  process.exit(mainUpload.status ?? 1);
}
