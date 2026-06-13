import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  packageJson: join(root, 'package.json'),
  packageLock: join(root, 'package-lock.json'),
  cargoToml: join(root, 'src-tauri/Cargo.toml'),
  tauriConf: join(root, 'src-tauri/tauri.conf.json'),
};

const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validateVersion(version) {
  if (!VERSION_RE.test(version)) {
    fail(`无效版本号: ${version}（需形如 1.2.3 或 1.2.3-beta.1）`);
  }
}

function readPackageJson() {
  return JSON.parse(readFileSync(paths.packageJson, 'utf8'));
}

function readPackageVersion() {
  return readPackageJson().version;
}

function readCargoVersion() {
  const content = readFileSync(paths.cargoToml, 'utf8');
  const match = content.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) fail('无法在 Cargo.toml 中解析 version');
  return match[1];
}

function readTauriVersion() {
  const conf = JSON.parse(readFileSync(paths.tauriConf, 'utf8'));
  return conf.version;
}

function writePackageJson(version) {
  const pkg = readPackageJson();
  pkg.version = version;
  writeFileSync(paths.packageJson, `${JSON.stringify(pkg, null, 2)}\n`);
}

function writeCargoToml(version) {
  const content = readFileSync(paths.cargoToml, 'utf8');
  const match = content.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) fail('无法在 Cargo.toml 中解析 version');
  if (match[1] === version) return false;
  const next = content.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
  writeFileSync(paths.cargoToml, next);
  return true;
}

function writeTauriConf(version) {
  const conf = JSON.parse(readFileSync(paths.tauriConf, 'utf8'));
  if (conf.version === version) return false;
  conf.version = version;
  writeFileSync(paths.tauriConf, `${JSON.stringify(conf, null, 2)}\n`);
  return true;
}

function writePackageLock(version) {
  if (!existsSync(paths.packageLock)) return false;
  const lock = JSON.parse(readFileSync(paths.packageLock, 'utf8'));
  const rootPkg = lock.packages?.[''];
  const alreadySynced =
    lock.version === version && (!rootPkg || rootPkg.version === version);
  if (alreadySynced) return false;
  lock.version = version;
  if (rootPkg) {
    rootPkg.version = version;
  }
  writeFileSync(paths.packageLock, `${JSON.stringify(lock, null, 2)}\n`);
  return true;
}

function syncFromPackageJson() {
  const version = readPackageVersion();
  validateVersion(version);
  const updated = [
    writeCargoToml(version),
    writeTauriConf(version),
    writePackageLock(version),
  ].some(Boolean);

  if (updated) {
    console.log(`已同步版本 ${version} → Cargo.toml、tauri.conf.json、package-lock.json`);
  } else {
    console.log(`版本已一致: ${version}`);
  }
  return version;
}

function setVersion(version) {
  validateVersion(version);
  writePackageJson(version);
  writeCargoToml(version);
  writeTauriConf(version);
  writePackageLock(version);
  console.log(`版本已设为 ${version}，并已同步至所有配置文件`);
  return version;
}

function verifyVersions() {
  const versions = {
    'package.json': readPackageVersion(),
    'Cargo.toml': readCargoVersion(),
    'tauri.conf.json': readTauriVersion(),
  };

  const unique = [...new Set(Object.values(versions))];
  if (unique.length !== 1) {
    console.error('版本号不一致：');
    for (const [file, value] of Object.entries(versions)) {
      console.error(`  ${file}: ${value}`);
    }
    process.exit(1);
  }

  validateVersion(unique[0]);
  console.log(`版本一致: ${unique[0]}`);
  return unique[0];
}

const [command = 'sync', arg] = process.argv.slice(2);

switch (command) {
  case 'get':
    console.log(readPackageVersion());
    break;
  case 'set':
    if (!arg) fail('用法: node scripts/version.mjs set <version>');
    setVersion(arg);
    break;
  case 'verify':
    verifyVersions();
    break;
  case 'sync':
    syncFromPackageJson();
    break;
  default:
    fail(`未知命令: ${command}（可用: get | set | sync | verify）`);
}
