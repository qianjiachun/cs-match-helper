import type { MatchPlatformId } from '@core/match/models';
import logo5e from '@/assets/platforms/logo-5e.png';
import logoPerfect from '@/assets/platforms/logo-perfect.png';

export interface PlatformLogoInfo {
  src: string;
  alt: string;
}

const PLATFORM_LOGOS: Record<MatchPlatformId, PlatformLogoInfo> = {
  perfect: { src: logoPerfect, alt: '完美世界竞技平台' },
  '5e': { src: logo5e, alt: '5E 对战平台' },
};

export function getPlatformLogo(platformId?: MatchPlatformId): PlatformLogoInfo {
  return PLATFORM_LOGOS[platformId ?? 'perfect'] ?? PLATFORM_LOGOS.perfect;
}
