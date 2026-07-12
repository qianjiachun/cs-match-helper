import { describe, expect, it } from 'vitest';
import {
  buildDocumentFromMatch,
  documentToIndexMeta,
  documentToListItem,
  documentToViewModel,
  HISTORY_SECTION_AI,
  HISTORY_SECTION_MATCH,
  migrateDocument,
  migrateIndex,
} from './index';
import type { MatchRecord } from '../models';

function sampleRecord(): MatchRecord {
  return {
    id: 'game-1',
    platformId: 'perfect',
    time: '2026-07-11 12:00:00',
    data: { raw: true },
    summary: {
      playerCount: 10,
      mapName: 'dust2',
      mode: '天梯',
      platformGameId: 'game-1',
    },
    detail: {
      platformId: 'perfect',
      platformGameId: 'game-1',
      mapName: 'dust2',
      teams: [
        {
          side: 'A',
          id: 1,
          players: [
            {
              steamId: '1',
              nickname: 'A1',
              teamSide: 1,
              isSingle: false,
              score: 2000,
              radar: {},
              recentResults: [],
              recentRatings: [],
              tags: [],
            },
          ],
          singleCount: 0,
          partyGroups: [],
          avgScore: 2000,
        },
        {
          side: 'B',
          id: 2,
          players: [
            {
              steamId: '2',
              nickname: 'B1',
              teamSide: 2,
              isSingle: false,
              score: 1900,
              radar: {},
              recentResults: [],
              recentRatings: [],
              tags: [],
            },
          ],
          singleCount: 0,
          partyGroups: [],
          avgScore: 1900,
        },
      ],
      unassigned: [],
      hasExtraInfo: true,
      parseWarnings: [],
    },
  };
}

describe('match history schema', () => {
  it('builds document without raw data and without empty ai by default', () => {
    const doc = buildDocumentFromMatch(sampleRecord(), { includeEmptyAi: false });
    expect(doc.schemaVersion).toBe(1);
    expect(doc.sections[HISTORY_SECTION_MATCH]).toBeTruthy();
    expect(doc.sections[HISTORY_SECTION_AI]).toBeUndefined();
    expect(JSON.stringify(doc)).not.toContain('"raw":true');
  });

  it('round-trips document to view model', () => {
    const doc = buildDocumentFromMatch(sampleRecord(), { includeEmptyAi: false });
    const { document, unsupportedSections } = migrateDocument(doc);
    const vm = documentToViewModel(document, unsupportedSections);
    expect(vm.record?.summary.mapName).toBe('dust2');
    expect(vm.record?.detail.teams).toHaveLength(2);
    expect(vm.ai.status).toBe('none');
  });

  it('preserves unknown sections on migrate', () => {
    const raw = {
      schemaVersion: 1,
      id: 'x',
      platformId: 'perfect',
      savedAt: 1,
      updatedAt: 1,
      sections: {
        match: {
          schemaVersion: 1,
          updatedAt: 1,
          payload: {
            summary: { mapName: 'mirage', playerCount: 10 },
            detail: { teams: [], unassigned: [], hasExtraInfo: false, parseWarnings: [] },
          },
        },
        futureThing: {
          schemaVersion: 9,
          updatedAt: 1,
          payload: { hello: 'world' },
        },
      },
    };
    const { document } = migrateDocument(raw);
    expect(document.sections.futureThing?.payload).toEqual({ hello: 'world' });
  });

  it('computes list item from document without storing preview', () => {
    const doc = buildDocumentFromMatch(sampleRecord(), { includeEmptyAi: false });
    const item = documentToListItem(doc);
    expect(item.mapName).toBe('dust2');
    expect(item.teamAAvgScore).toBe(2000);
    expect(item.teamBAvgScore).toBe(1900);
    expect(item.matchAvgScore).toBe(1950);
    expect(item.playerCount).toBe(10);
    expect(item.mode).toBe('天梯');

    const meta = documentToIndexMeta(doc);
    expect(meta).toEqual({
      id: 'game-1',
      platformId: 'perfect',
      savedAt: doc.savedAt,
      updatedAt: doc.updatedAt,
    });
    expect('preview' in meta).toBe(false);
    expect('mapName' in meta).toBe(false);
  });

  it('migrates fat v1 index to thin v2 metadata', () => {
    const index = migrateIndex({
      schemaVersion: 1,
      maxEntries: 100,
      entries: [
        {
          schemaVersion: 1,
          id: 'a',
          platformId: 'perfect',
          savedAt: 1,
          updatedAt: 2,
          mapName: 'dust2',
          playerCount: 10,
          preview: { teamAAvgScore: 2000, teamBAvgScore: 1900 },
          sectionsPresent: ['match', 'ai'],
        },
      ],
    });
    expect(index.schemaVersion).toBe(2);
    expect(index.entries).toEqual([
      { id: 'a', platformId: 'perfect', savedAt: 1, updatedAt: 2 },
    ]);
    expect(index.maxEntries).toBeUndefined();
  });

  it('marks unsupported high-version known sections', () => {
    const raw = {
      schemaVersion: 1,
      id: 'x',
      platformId: '5e',
      savedAt: 1,
      updatedAt: 1,
      sections: {
        match: {
          schemaVersion: 99,
          updatedAt: 1,
          payload: { summary: {}, detail: {} },
        },
      },
    };
    const { unsupportedSections } = migrateDocument(raw);
    expect(unsupportedSections).toContain('match');
  });

  it('persists 5e p5eBundle for AI fidelity and keeps perfect raw out', () => {
    const perfect = buildDocumentFromMatch(sampleRecord(), { includeEmptyAi: false });
    expect(perfect.sections[HISTORY_SECTION_MATCH]?.payload).not.toHaveProperty('data');

    const withBundle: MatchRecord = {
      ...sampleRecord(),
      id: '5e-1',
      platformId: '5e',
      data: {
        p5eBundle: {
          matchId: 'm1',
          uuids: ['u1'],
          userInfo: { responseBody: { data: {} } },
        },
      },
      detail: { ...sampleRecord().detail, platformId: '5e' },
    };
    const doc = buildDocumentFromMatch(withBundle, { includeEmptyAi: false });
    const payload = doc.sections[HISTORY_SECTION_MATCH]?.payload as {
      data?: { p5eBundle?: unknown };
    };
    expect(payload.data?.p5eBundle).toEqual(withBundle.data.p5eBundle);

    const vm = documentToViewModel(doc);
    expect(vm.record?.data.p5eBundle).toEqual(withBundle.data.p5eBundle);
  });
});
