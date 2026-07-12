import { describe, expect, it } from 'vitest';
import {
  getP5eLaunchCollectError,
  nextMapBackfillDelayMs,
  P5E_AUTO_RECOVER_MAX,
  P5E_MAP_BACKFILL_INITIAL_DELAY_MS,
  P5E_MAP_BACKFILL_MAX_DELAY_MS,
  shouldPromptManualP5eRelaunch,
  shouldTriggerP5eAutoRecover,
} from './useP5eCdp';

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

describe('5E auto recover helpers', () => {
  it('triggers auto recover only for app-launched session with needsRelaunch', () => {
    expect(
      shouldTriggerP5eAutoRecover({
        needsRelaunch: true,
        appLaunchedSession: true,
        autoRecovering: false,
        autoRecoverAttempts: 0,
        intentionalStop: false,
      }),
    ).toBe(true);

    expect(
      shouldTriggerP5eAutoRecover({
        needsRelaunch: true,
        appLaunchedSession: false,
        autoRecovering: false,
        autoRecoverAttempts: 0,
        intentionalStop: false,
      }),
    ).toBe(false);
  });

  it('does not auto recover after max attempts', () => {
    expect(
      shouldTriggerP5eAutoRecover({
        needsRelaunch: true,
        appLaunchedSession: true,
        autoRecovering: false,
        autoRecoverAttempts: P5E_AUTO_RECOVER_MAX,
        intentionalStop: false,
      }),
    ).toBe(false);
  });

  it('prompts manual relaunch after auto recover is exhausted', () => {
    expect(
      shouldPromptManualP5eRelaunch({
        needsRelaunch: true,
        autoRecoverAttempts: P5E_AUTO_RECOVER_MAX,
        intentionalStop: false,
        alreadyPrompted: false,
      }),
    ).toBe(true);

    expect(
      shouldPromptManualP5eRelaunch({
        needsRelaunch: true,
        autoRecoverAttempts: P5E_AUTO_RECOVER_MAX,
        intentionalStop: false,
        alreadyPrompted: true,
      }),
    ).toBe(false);
  });
});

describe('map backfill delay', () => {
  it('doubles until max delay', () => {
    expect(nextMapBackfillDelayMs(P5E_MAP_BACKFILL_INITIAL_DELAY_MS)).toBe(2_000);
    expect(nextMapBackfillDelayMs(8_000)).toBe(16_000);
    expect(nextMapBackfillDelayMs(P5E_MAP_BACKFILL_MAX_DELAY_MS)).toBe(P5E_MAP_BACKFILL_MAX_DELAY_MS);
  });
});
