import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./useLogWatcher.ts', import.meta.url), 'utf8');

describe('Perfect debug injection boundary', () => {
  it('uses the log fixture only and sends replayed SteamIDs through live enrichment', () => {
    const replayStart = source.indexOf('async function replayPerfectFixture()');
    const replayEnd = source.indexOf('function patchPlayerLoadState', replayStart);
    const replaySource = source.slice(replayStart, replayEnd);

    expect(replaySource).toContain('perfect-9220102482485790732-log.json');
    expect(replaySource).not.toContain('perfect-9220102482485790732-api.json');
    expect(replaySource).toContain('schedulePlayerEnrichment(steamId, session.token)');
    expect(replaySource).toContain('await Promise.all(enrichmentTasks.values())');
    expect(source).toContain("category: 'perfect-api'");
    expect(source).toContain("stats.partialFailure ? 'partial_failure' : 'success'");
  });

  it('also enriches SteamIDs from advanced manual Perfect JSON injection', () => {
    const injectStart = source.indexOf('function injectMatch(');
    const injectEnd = source.indexOf('async function replayPerfectFixture()', injectStart);
    const injectSource = source.slice(injectStart, injectEnd);

    expect(injectSource).toContain("getActivePlatform().id === 'perfect'");
    expect(injectSource).toContain('scheduleUpdatePlayerEnrichment(update)');
  });

  it('re-enriches every player when a live legacy CreateGame record replaces the ladder session', () => {
    expect(source).toContain("update.record.detail.source !== 'legacy-create-game'");
    expect(source).toContain('...update.record.detail.teams.flatMap((team) => team.players)');
    expect(source).toContain('scheduleUpdatePlayerEnrichment(update)');
  });
});
