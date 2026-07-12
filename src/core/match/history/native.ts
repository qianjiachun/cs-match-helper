import { invoke } from '@tauri-apps/api/core';
import type { MatchHistoryDocumentV1, MatchHistoryIndexV2, VersionedSection } from './types';

export async function listMatchHistory(): Promise<unknown> {
  return invoke<unknown>('list_match_history');
}

export async function listMatchHistoryDocuments(): Promise<unknown[]> {
  return invoke<unknown[]>('list_match_history_documents');
}

export async function getMatchHistoryEntry(
  platformId: string,
  id: string,
): Promise<unknown | null> {
  return invoke<unknown | null>('get_match_history_entry', { platformId, id });
}

export async function upsertMatchHistoryEntry(
  document: MatchHistoryDocumentV1,
): Promise<MatchHistoryIndexV2> {
  return invoke<MatchHistoryIndexV2>('upsert_match_history_entry', { document });
}

export async function patchMatchHistorySection(
  platformId: string,
  id: string,
  sectionName: string,
  section: VersionedSection,
): Promise<MatchHistoryIndexV2> {
  return invoke<MatchHistoryIndexV2>('patch_match_history_section', {
    platformId,
    id,
    sectionName,
    section,
  });
}

export async function deleteMatchHistoryEntry(
  platformId: string,
  id: string,
): Promise<MatchHistoryIndexV2> {
  return invoke<MatchHistoryIndexV2>('delete_match_history_entry', { platformId, id });
}

export async function clearMatchHistory(): Promise<MatchHistoryIndexV2> {
  return invoke<MatchHistoryIndexV2>('clear_match_history');
}
