import { describe, expect, it } from 'vitest';
import {
  getGameBarWidgetSetupBlocker,
  isGameBarWidgetReady,
  type GameBarWidgetConnectionStatus,
  type GameBarWidgetStatus,
} from './types';

function createConnection(
  overrides: Partial<GameBarWidgetConnectionStatus> = {},
): GameBarWidgetConnectionStatus {
  const status: GameBarWidgetConnectionStatus = {
    state: 'listening',
    port: 39281,
    retryAttempt: 0,
    issueCode: null,
    lastError: null,
    lastConnectedAt: null,
    occupiedPorts: [],
    blockingProcesses: [],
    discoveryWarning: null,
  };
  return Object.assign(status, overrides);
}

function createStatus(
  overrides: Partial<GameBarWidgetStatus> = {},
): GameBarWidgetStatus {
  const status: GameBarWidgetStatus = {
    installed: true,
    installedVersion: '1.3.0',
    packageFamilyName: 'CSMatchHelper.GameBarWidget_test',
    loopbackConfigured: true,
    loopbackState: 'configured',
    loopbackError: null,
    displayName: 'CS Match Helper',
    gameBarInstalled: true,
    gameBarOpenShortcut: 'Win+G',
    gameBarOpenShortcutFromRegistry: false,
    trust: {
      publisher: 'CN=CSMatchHelperDev',
      signatureThumbprint: '196D5DCC495BCFF5EABCA6C9650FA8975954F8AA',
      signatureKind: 'Developer',
      trustedPeople: true,
      msixStatus: 'Valid',
      catalogStatus: 'Valid',
      smartAppControlState: 'off',
      wdacState: 'off',
      recentCodeIntegrityEvent: null,
      runtimeState: 'installedUnverified',
      runtimeVerified: false,
    },
  };
  return Object.assign(status, overrides);
}

describe('isGameBarWidgetReady', () => {
  it('treats a fully installed Widget as ready before first runtime launch', () => {
    expect(isGameBarWidgetReady(createStatus())).toBe(true);
  });

  it('accepts an already running Widget', () => {
    const status = createStatus();
    status.trust.runtimeState = 'running';
    status.trust.runtimeVerified = true;
    expect(isGameBarWidgetReady(status)).toBe(true);
  });

  it('rejects missing trust or a runtime block', () => {
    const untrusted = createStatus();
    untrusted.trust.trustedPeople = false;
    expect(isGameBarWidgetReady(untrusted)).toBe(false);

    const blocked = createStatus();
    blocked.trust.runtimeState = 'blockedByCodeIntegrity';
    expect(isGameBarWidgetReady(blocked)).toBe(false);
  });

  it('uses a real stream connection as stronger evidence than a stale loopback probe', () => {
    const status = createStatus({
      loopbackConfigured: false,
      loopbackState: 'missing',
    });
    expect(isGameBarWidgetReady(status)).toBe(false);
    expect(isGameBarWidgetReady(status, createConnection({
      state: 'connected',
      port: 39282,
      lastConnectedAt: Date.now(),
    }))).toBe(true);
  });

  it('does not treat an unreadable loopback query as an installation failure', () => {
    const status = createStatus({
      loopbackConfigured: false,
      loopbackState: 'unknown',
      loopbackError: 'CheckNetIsolation returned unreadable output',
    });
    expect(isGameBarWidgetReady(status)).toBe(true);
  });
});

describe('getGameBarWidgetSetupBlocker', () => {
  it('does not show a connection warning before recording starts', () => {
    const status = createStatus({
      loopbackConfigured: false,
      loopbackState: 'missing',
    });
    expect(getGameBarWidgetSetupBlocker(status, createConnection(), false)).toBeNull();
  });

  it('waits for automatic recovery before showing a connection warning', () => {
    const status = createStatus();
    expect(getGameBarWidgetSetupBlocker(
      status,
      createConnection({ state: 'recovering', retryAttempt: 5 }),
      true,
    )).toBeNull();
    expect(getGameBarWidgetSetupBlocker(
      status,
      createConnection({ state: 'failed', issueCode: 'ipcPortsUnavailable' }),
      true,
    )).toBe('ipcFailed');
    expect(getGameBarWidgetSetupBlocker(
      status,
      createConnection({ state: 'connected', lastConnectedAt: Date.now() }),
      true,
      'loopbackRepairFailed',
    )).toBeNull();
  });

  it('shows guidance after loopback repair is cancelled and clears it after connection', () => {
    const status = createStatus({
      loopbackConfigured: false,
      loopbackState: 'missing',
    });
    expect(getGameBarWidgetSetupBlocker(
      status,
      createConnection({ state: 'listening' }),
      true,
      'uacCancelled',
    )).toBe('loopbackRepairFailed');
    expect(getGameBarWidgetSetupBlocker(
      status,
      createConnection({ state: 'connected', lastConnectedAt: Date.now() }),
      true,
      'uacCancelled',
    )).toBeNull();
  });

  it('keeps real installation and security blockers visible', () => {
    expect(getGameBarWidgetSetupBlocker(createStatus({ installed: false }), null, false))
      .toBe('widgetMissing');
    const blocked = createStatus();
    blocked.trust.runtimeState = 'blockedBySmartAppControl';
    expect(getGameBarWidgetSetupBlocker(blocked, null, false)).toBe('smartAppControl');
  });
});
