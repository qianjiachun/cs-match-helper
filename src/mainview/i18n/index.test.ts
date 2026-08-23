import { afterEach, describe, expect, it } from 'vitest';
import {
  I18N_MESSAGES,
  applyResolvedLocale,
  localize,
  localizeErrorMessage,
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
    expect(localize('匹配助手', 'Match Helper')).toBe('Match Helper');
    applyResolvedLocale('zh-CN');
    expect(localize('匹配助手', 'Match Helper')).toBe('匹配助手');
  });

  it('uses the standalone Match Helper product terminology', () => {
    expect(I18N_MESSAGES['zh-CN'].common.appName).toBe('CS 匹配助手');
    expect(I18N_MESSAGES['en-US'].common.appName).toBe('CS Match Helper');
    expect(JSON.stringify(I18N_MESSAGES)).not.toMatch(/Game Bar|HUD/);
  });

  it('identifies the supported platforms for English users', () => {
    expect(I18N_MESSAGES['en-US'].platform.regionLabel).toBe('Chinese CS platform');
    expect(I18N_MESSAGES['en-US'].platform.perfect).toBe('Perfect World Arena');
    expect(I18N_MESSAGES['en-US'].platform.fiveE).toBe('5E Arena');
  });

  it('turns Perfect Steam error codes into actionable localized guidance', () => {
    expect(localizeErrorMessage('PERFECT_STEAM_PHONE_REQUIRED: redacted detail')).toContain(
      '完成手机号绑定',
    );
    expect(localizeErrorMessage('PERFECT_STEAM_STATE_MISMATCH: redacted detail')).not.toContain(
      'PERFECT_STEAM_STATE_MISMATCH',
    );

    applyResolvedLocale('en-US');
    expect(localizeErrorMessage('PERFECT_STEAM_PHONE_REQUIRED: redacted detail')).toContain(
      'mobile number linked',
    );
  });
});
