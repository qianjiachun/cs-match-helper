import type { MatchRecord } from '@core/match/models';
import { isProgressivePerfectMatch } from '@core/ai/perfect-readiness';

export function shouldReplayMatchReveal(
  record: MatchRecord,
  nextId: string,
  previousId?: string,
): boolean {
  if (previousId == null || previousId === nextId) return false;
  return !isProgressivePerfectMatch(record);
}
