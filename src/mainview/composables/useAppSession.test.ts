import { describe, expect, it } from 'vitest';
import { useAppSession } from './useAppSession';

describe('app session authentication gate', () => {
  it('routes Perfect World through auth before the main watcher view', () => {
    const session = useAppSession();
    session.selectPlatform('perfect');
    expect(session.phase.value).toBe('perfect-auth');
    session.completePerfectAuth();
    expect(session.phase.value).toBe('main');
    session.resetToPerfectAuth();
    expect(session.phase.value).toBe('perfect-auth');
  });

  it('keeps the 5E launch flow unchanged', () => {
    const session = useAppSession();
    session.selectPlatform('5e');
    expect(session.phase.value).toBe('p5e-launch');
  });
});
