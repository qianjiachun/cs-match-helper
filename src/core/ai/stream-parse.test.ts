import { describe, expect, it } from 'vitest';
import { extractPartialAiResult } from './stream-parse';

describe('AI stream preview parsing', () => {
  it('extracts early probability fields from incomplete and fenced JSON', () => {
    const partial = extractPartialAiResult('```json\n{"schemaVersion":3,"modelWinProbability":{"A":63,"B":37},"confidence":72');
    expect(partial).toMatchObject({
      modelWinProbability: { A: 63, B: 37 },
      winProbability: { A: 63, B: 37 },
      confidence: 72,
    });
  });
});
