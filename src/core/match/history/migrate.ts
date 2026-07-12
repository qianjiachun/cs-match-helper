import {
  CURRENT_AI_SECTION_VERSION,
  CURRENT_DOCUMENT_SCHEMA_VERSION,
  CURRENT_INDEX_SCHEMA_VERSION,
  CURRENT_MATCH_SECTION_VERSION,
  HISTORY_SECTION_AI,
  HISTORY_SECTION_MATCH,
  type MatchHistoryDocumentV1,
  type MatchHistoryIndexItemV2,
  type MatchHistoryIndexV2,
  type SectionMigrateResult,
  type VersionedSection,
} from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** 将任意 JSON 规范为瘦 index（丢弃 mapName/preview 等派生字段） */
export function migrateIndex(raw: unknown): MatchHistoryIndexV2 {
  const obj = asRecord(raw);
  if (!obj) {
    return {
      schemaVersion: CURRENT_INDEX_SCHEMA_VERSION,
      entries: [],
    };
  }

  const entriesRaw = Array.isArray(obj.entries) ? obj.entries : [];
  const entries: MatchHistoryIndexItemV2[] = [];
  for (const item of entriesRaw) {
    const migrated = migrateIndexItem(item);
    if (migrated) entries.push(migrated);
  }

  return {
    schemaVersion: CURRENT_INDEX_SCHEMA_VERSION,
    entries,
  };
}

export function migrateIndexItem(raw: unknown): MatchHistoryIndexItemV2 | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = asString(obj.id);
  const platformId = asString(obj.platformId);
  if (!id || !platformId) return null;

  return {
    id,
    platformId,
    savedAt: asNumber(obj.savedAt, Date.now()),
    updatedAt: asNumber(obj.updatedAt, asNumber(obj.savedAt, Date.now())),
  };
}

export function migrateSection(
  name: string,
  section: VersionedSection | undefined,
): SectionMigrateResult | null {
  if (!section || typeof section.schemaVersion !== 'number') return null;

  const current =
    name === HISTORY_SECTION_MATCH
      ? CURRENT_MATCH_SECTION_VERSION
      : name === HISTORY_SECTION_AI
        ? CURRENT_AI_SECTION_VERSION
        : section.schemaVersion;

  if (section.schemaVersion > current) {
    return { section, unsupported: true };
  }

  if (section.schemaVersion < current) {
    return {
      section: {
        ...section,
        schemaVersion: current,
      },
    };
  }

  return { section };
}

export function migrateDocument(raw: unknown): {
  document: MatchHistoryDocumentV1;
  unsupportedSections: string[];
} {
  const obj = asRecord(raw);
  const now = Date.now();
  if (!obj) {
    return {
      document: {
        schemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
        id: '',
        platformId: '',
        savedAt: now,
        updatedAt: now,
        sections: {},
      },
      unsupportedSections: [],
    };
  }

  const id = asString(obj.id) ?? '';
  const platformId = asString(obj.platformId) ?? '';
  const sectionsRaw = asRecord(obj.sections) ?? {};
  const sections: Record<string, VersionedSection> = {};
  const unsupportedSections: string[] = [];

  for (const [name, value] of Object.entries(sectionsRaw)) {
    const sec = asRecord(value);
    if (!sec) continue;
    const versioned: VersionedSection = {
      schemaVersion: asNumber(sec.schemaVersion, 1),
      updatedAt: asNumber(sec.updatedAt, now),
      payload: sec.payload ?? {},
    };
    const migrated = migrateSection(name, versioned);
    if (!migrated) continue;
    sections[name] = migrated.section;
    if (migrated.unsupported) unsupportedSections.push(name);
  }

  return {
    document: {
      schemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
      id,
      platformId,
      savedAt: asNumber(obj.savedAt, now),
      updatedAt: asNumber(obj.updatedAt, now),
      matchTime: asString(obj.matchTime),
      sections,
    },
    unsupportedSections,
  };
}
