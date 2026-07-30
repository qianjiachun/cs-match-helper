import { afterEach, describe, expect, it } from 'vitest';
import {
  I18N_MESSAGES,
  applyResolvedLocale,
  localize,
  resolveSystemLocale,
} from './index';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

afterEach(() => applyResolvedLocale('zh-CN'));

describe('application locale', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-Hans', 'zh-CN'],
    ['en-US', 'en-US'],
    ['de-DE', 'en-US'],
  ] as const)('maps system language %s to %s', (language, expected) => {
    expect(resolveSystemLocale(language)).toBe(expected);
  });

  it('keeps the Chinese and English catalogs in key parity', () => {
    expect(flattenKeys(I18N_MESSAGES['en-US']).sort()).toEqual(
      flattenKeys(I18N_MESSAGES['zh-CN']).sort(),
    );
  });

  it('switches inline UI copy immediately', () => {
    applyResolvedLocale('en-US');
    expect(localize('急停', 'Counter-strafing')).toBe('Counter-strafing');
    applyResolvedLocale('zh-CN');
    expect(localize('急停', 'Counter-strafing')).toBe('急停');
  });

  it('uses the approved Counter Strafing HUD product terminology', () => {
    expect(I18N_MESSAGES['zh-CN'].common.appName).toBe('CS 匹配助手');
    expect(I18N_MESSAGES['zh-CN'].home.counterTitle).toBe('急停 HUD');
    expect(I18N_MESSAGES['zh-CN'].counter.title).toBe('急停 HUD');
    expect(I18N_MESSAGES['en-US'].home.counterTitle).toBe('Counter Strafing HUD');
    expect(I18N_MESSAGES['en-US'].counter.title).toBe('Counter Strafing HUD');
    expect(JSON.stringify(I18N_MESSAGES['en-US'])).not.toMatch(/trainer/i);
  });

  it('identifies the supported platforms for English users', () => {
    expect(I18N_MESSAGES['en-US'].platform.regionLabel).toBe('Chinese CS platform');
    expect(I18N_MESSAGES['en-US'].platform.hudLabel).toBe('Need the Counter Strafing HUD?');
    expect(I18N_MESSAGES['en-US'].platform.hudHint).toBe('Click the control to the right of the app title.');
  });
});
