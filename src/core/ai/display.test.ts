import { describe, expect, it } from 'vitest';
import { formatAiWinnerCapsule } from './display';

describe('formatAiWinnerCapsule', () => {
  it('formats team winners with side-specific probability', () => {
    expect(formatAiWinnerCapsule('A', { A: 58, B: 42 })).toBe('A队 58%');
    expect(formatAiWinnerCapsule('B', { A: 41, B: 59 })).toBe('B队 59%');
  });

  it('formats even and unknown in Chinese', () => {
    expect(formatAiWinnerCapsule('Even', { A: 50, B: 50 })).toBe('势均力敌 50%');
    expect(formatAiWinnerCapsule('Even', { A: 52, B: 48 })).toBe('势均力敌 A52%·B48%');
    expect(formatAiWinnerCapsule('Unknown', { A: 50, B: 50 })).toBe('难以判断');
  });
});
