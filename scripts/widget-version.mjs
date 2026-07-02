import {
  fail,
  readWidgetVersion,
  setWidgetVersion,
  syncFromWidgetVersionJson,
  verifyWidgetVersions,
} from './widget-version-lib.mjs';

const [command = 'sync', arg] = process.argv.slice(2);

switch (command) {
  case 'get':
    console.log(readWidgetVersion());
    break;
  case 'set':
    if (!arg) fail('用法: node scripts/widget-version.mjs set <version>');
    setWidgetVersion(arg);
    break;
  case 'verify':
    verifyWidgetVersions();
    break;
  case 'sync':
    syncFromWidgetVersionJson();
    break;
  default:
    fail(`未知命令: ${command}（可用: get | set | sync | verify）`);
}
