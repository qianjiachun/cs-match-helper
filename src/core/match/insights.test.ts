import { describe, expect, it } from 'vitest';
import { formatMatchInsight } from './insights';

describe('formatMatchInsight', () => {
  it('uses standard CS terminology in English', () => {
    expect(formatMatchInsight('队伍 A 狙击能力较强', 'en-US')).toBe('Team A has strong AWPing');
    expect(formatMatchInsight('队伍 B 疑似 3 人组排', 'en-US')).toBe('Team B likely has a 3-stack');
    expect(formatMatchInsight('队伍 A 倾向 道具', 'en-US')).toBe('Team A leans toward Utility');
  });

  it('preserves Chinese and unknown raw text', () => {
    expect(formatMatchInsight('队伍 A 火力维度突出', 'zh-CN')).toBe('队伍 A 火力维度突出');
    expect(formatMatchInsight('平台返回的原始提示', 'en-US')).toBe('平台返回的原始提示');
  });
});
