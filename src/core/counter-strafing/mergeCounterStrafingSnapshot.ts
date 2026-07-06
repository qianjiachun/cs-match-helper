import type {
  CounterStrafingAssessmentRecord,
  CounterStrafingAssessmentSnapshot,
  CounterStrafingSnapshot,
  ShootingErrorRecord,
} from './types';

function mergeRecordArrays<T>(
  local: T[],
  incoming: T[],
): T[] {
  // Trust empty incoming (e.g. clear_records) even when local still has history.
  if (incoming.length === 0) {
    return incoming;
  }
  if (incoming.length >= local.length) {
    return incoming;
  }
  return local;
}

export function mergeCounterStrafingSnapshot(
  local: CounterStrafingSnapshot,
  incoming: CounterStrafingSnapshot,
): CounterStrafingSnapshot {
  const shotRecords = mergeRecordArrays(local.shotRecords, incoming.shotRecords);
  const lastShot =
    shotRecords.length > 0
      ? shotRecords[shotRecords.length - 1]
      : incoming.lastShot ?? null;

  return {
    ...incoming,
    shotRecords,
    lastShot,
  };
}

export function mergeCounterStrafingAssessmentSnapshot(
  local: CounterStrafingAssessmentSnapshot,
  incoming: CounterStrafingAssessmentSnapshot,
): CounterStrafingAssessmentSnapshot {
  const records = mergeRecordArrays(local.records, incoming.records);
  const lastRecord =
    records.length > 0
      ? records[records.length - 1]
      : incoming.lastRecord ?? null;

  return {
    ...incoming,
    records,
    lastRecord,
  };
}

export function appendShotRecord(
  records: ShootingErrorRecord[],
  record: ShootingErrorRecord,
  limit: number,
): ShootingErrorRecord[] {
  const next = [...records, record];
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}

export function appendAssessmentRecord(
  records: CounterStrafingAssessmentRecord[],
  record: CounterStrafingAssessmentRecord,
  limit: number,
): CounterStrafingAssessmentRecord[] {
  const next = [...records, record];
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}
