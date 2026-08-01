import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCloseConfirmController } from './useCloseConfirm';

afterEach(() => {
  vi.useRealTimers();
});

describe('close confirmation controller', () => {
  it('coalesces repeated native close requests into one open dialog', () => {
    const controller = createCloseConfirmController(vi.fn());

    controller.handleCloseRequested();
    controller.handleCloseRequested();

    expect(controller.open.value).toBe(true);
    controller.dispose();
  });

  it('ignores the close-event tail after canceling, then accepts a new request', () => {
    vi.useFakeTimers();
    const controller = createCloseConfirmController(vi.fn());

    controller.handleCloseRequested();
    controller.cancelClose();
    controller.handleCloseRequested();
    expect(controller.open.value).toBe(false);

    vi.advanceTimersByTime(350);
    controller.handleCloseRequested();
    expect(controller.open.value).toBe(true);
    controller.dispose();
  });

  it('runs the confirmed close exactly once after the leave transition', async () => {
    const close = vi.fn(async () => undefined);
    const controller = createCloseConfirmController(close);

    controller.handleCloseRequested();
    controller.confirmClose();
    await controller.onCloseDialogAfterLeave();
    await controller.onCloseDialogAfterLeave();

    expect(close).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});
