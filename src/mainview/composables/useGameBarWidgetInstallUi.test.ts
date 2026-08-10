import { describe, expect, it } from 'vitest';
import { formatBlockingPackageLabel } from './useGameBarWidgetInstallUi';

describe('formatBlockingPackageLabel', () => {
  it('maps known package identities to user-facing application names', () => {
    expect(
      formatBlockingPackageLabel(
        'Microsoft.ScreenSketch_11.2602.49.0_x64__8wekyb3d8bbwe',
      ),
    ).toBe('截图工具');
    expect(
      formatBlockingPackageLabel(
        'B9ECED6F.ArmouryCrate_6.5.7.0_x64__qmba6cd70vzyy',
      ),
    ).toBe('Armoury Crate');
  });

  it('falls back to the package identity for unknown applications', () => {
    expect(
      formatBlockingPackageLabel('Contoso.Utility_1.0.0.0_x64__abcdefghijklm'),
    ).toBe('Contoso.Utility');
  });
});
