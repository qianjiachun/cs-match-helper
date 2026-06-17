import { p5eAdapter } from './5e';
import { perfectAdapter } from './perfect';
import type { PlatformAdapter, PlatformId } from './types';

const adapters: Record<PlatformId, PlatformAdapter> = {
  perfect: perfectAdapter,
  '5e': p5eAdapter,
};

let activePlatformId: PlatformId = 'perfect';

export function setActivePlatformId(id: PlatformId): void {
  activePlatformId = id;
}

export function getActivePlatformId(): PlatformId {
  return activePlatformId;
}

export function getActivePlatform(): PlatformAdapter {
  return adapters[activePlatformId];
}

export function getPlatform(id: PlatformId): PlatformAdapter {
  return adapters[id];
}

export { p5eAdapter, perfectAdapter };
