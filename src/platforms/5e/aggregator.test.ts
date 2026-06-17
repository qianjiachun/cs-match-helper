import { describe, expect, it } from 'vitest';
import { P5eMatchAggregator } from './aggregator';
import fixture from './fixtures/5e-match-success.fixture.json';
import type { P5eApiPayload } from './types';
import { classifyP5eUrl, isP5eWhitelistedUrl, parseP5eNdjsonLine } from './events';

describe('P5e events', () => {
  it('classifies whitelist urls', () => {
    expect(isP5eWhitelistedUrl('https://platform-api.5eplay.com/api/user/info')).toBe(true);
    expect(isP5eWhitelistedUrl('https://example.com/ads')).toBe(false);
    expect(classifyP5eUrl('https://gate.5eplay.com/player/elo/info/batch')).toBe('eloInfo');
  });

  it('drops ndjson lines with curl', () => {
    const line = JSON.stringify({ curl: 'secret', url: 'https://platform-api.5eplay.com/api/user/info' });
    expect(parseP5eNdjsonLine(line)).toBeNull();
  });
});

describe('P5eMatchAggregator', () => {
  it('builds bundle from fixture events', () => {
    const agg = new P5eMatchAggregator();
    const bundle = agg.ingestFixtureEvents(fixture.events as Record<string, P5eApiPayload>);
    expect(bundle).not.toBeNull();
    expect(bundle!.uuids).toHaveLength(10);
    expect(bundle!.userInfo).toBeTruthy();
    expect(bundle!.eloInfo).toBeTruthy();
    expect(bundle!.mapExt).toBeTruthy();
  });
});
