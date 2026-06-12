import { perfectAdapter } from './perfect';
import type { PlatformAdapter } from './types';

/** 当前仅实现完美对战平台；5e / b5 / steam 目录预留给后续接入 */
export function getActivePlatform(): PlatformAdapter {
  return perfectAdapter;
}
