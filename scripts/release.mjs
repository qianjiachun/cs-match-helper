import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
// 单文件 exe 分发：目标机需已安装 Microsoft Edge WebView2 Runtime
const exeSource = join(root, 'src-tauri/target/release/cs-match-helper.exe');
const appExeName = 'cs-match-helper.exe';

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
