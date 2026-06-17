import { describe, expect, it } from 'vitest';
import { getP5eLaunchCollectError } from './useP5eCdp';

describe('getP5eLaunchCollectError', () => {
  it('allows collect when cdp is ready and launched by app', () => {
    expect(
      getP5eLaunchCollectError({
        cdpReady: true,
        launched: true,
        message: 'ok',
      }),
    ).toBeNull();
  });

  it('rejects external running when cdp ready but not launched', () => {
    expect(
      getP5eLaunchCollectError({
        cdpReady: true,
        launched: false,
        message: 'external',
      }),
    ).toBe('EXTERNAL_5E_RUNNING');
  });

  it('rejects when cdp not ready after launch timeout', () => {
    expect(
      getP5eLaunchCollectError({
        cdpReady: false,
        launched: true,
        message: '端口 9223 在 60 秒内未就绪',
      }),
    ).toBe('端口 9223 在 60 秒内未就绪');
  });

  it('uses default message when cdp not ready and message empty', () => {
    expect(
      getP5eLaunchCollectError({
        cdpReady: false,
        launched: true,
        message: '',
      }),
    ).toBe('未能连接 5E，请完全退出后重试');
  });
});
