import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  cancelPerfectLogin: vi.fn(),
  clearPerfectAuth: vi.fn(),
  getPerfectAuthStatus: vi.fn(),
  onPerfectAuthState: vi.fn(),
  startPerfectQrLogin: vi.fn(),
  startPerfectSteamLogin: vi.fn(),
}));

vi.mock('../native', () => native);

import { QR_REFRESH_COOLDOWN_MS, usePerfectAuth } from './usePerfectAuth';

const ONE_HOUR_MS = 60 * 60 * 1000;

describe('Perfect auth validation throttling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T08:00:00Z'));
    native.getPerfectAuthStatus.mockResolvedValue({ phase: 'idle' });
    native.onPerfectAuthState.mockResolvedValue(() => undefined);
    native.startPerfectQrLogin.mockResolvedValue({
      phase: 'waiting_scan',
      method: 'qr',
      qrImageDataUrl: 'data:image/png;base64,abc',
    });
    native.startPerfectSteamLogin.mockResolvedValue({ phase: 'requesting', method: 'steam' });
    native.cancelPerfectLogin.mockResolvedValue({ phase: 'cancelled', method: 'qr' });
    native.clearPerfectAuth.mockResolvedValue({ phase: 'idle' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps checking unsigned sessions until they become authenticated', async () => {
    const auth = usePerfectAuth();

    await auth.validateIfStale(ONE_HOUR_MS);
    await auth.validateIfStale(ONE_HOUR_MS);
    expect(native.getPerfectAuthStatus).toHaveBeenCalledTimes(2);
  });

  it('limits automatic validation to once per hour after a confirmed login', async () => {
    vi.stubGlobal('window', {
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    });
    native.getPerfectAuthStatus.mockResolvedValue({
      phase: 'authenticated',
      uid: '76561198000000000',
    });
    const auth = usePerfectAuth();

    await auth.validateIfStale(ONE_HOUR_MS);
    expect(native.getPerfectAuthStatus).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(59 * 60 * 1000);
    await auth.validateIfStale(ONE_HOUR_MS);
    expect(native.getPerfectAuthStatus).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    await auth.validateIfStale(ONE_HOUR_MS);
    expect(native.getPerfectAuthStatus).toHaveBeenCalledTimes(2);

    await auth.validate();
    expect(native.getPerfectAuthStatus).toHaveBeenCalledTimes(3);
  });
});

describe('Perfect QR refresh cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T08:00:00Z'));
    native.getPerfectAuthStatus.mockResolvedValue({ phase: 'idle' });
    native.onPerfectAuthState.mockResolvedValue(() => undefined);
    native.startPerfectQrLogin.mockResolvedValue({
      phase: 'waiting_scan',
      method: 'qr',
      qrImageDataUrl: 'data:image/png;base64,abc',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not request another QR within 60 seconds', async () => {
    const auth = usePerfectAuth();

    await auth.startQr();
    await auth.startQr();
    expect(native.startPerfectQrLogin).toHaveBeenCalledTimes(1);
    expect(auth.hasLiveQrSession()).toBe(true);
    expect(auth.qrCooldownRemainingMs()).toBe(QR_REFRESH_COOLDOWN_MS);

    vi.advanceTimersByTime(QR_REFRESH_COOLDOWN_MS - 1);
    await auth.startQr();
    expect(native.startPerfectQrLogin).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await auth.startQr();
    expect(native.startPerfectQrLogin).toHaveBeenCalledTimes(2);
  });
});
