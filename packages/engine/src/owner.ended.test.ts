import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { createWorld, simulateSeason } from './founding';
import { operate } from './operations';
import { advanceDays, advanceRound, prepareRound } from './season';
import { assertNextEvent } from './next-event';
import { careerEnded, ENDED_MESSAGE } from './owner';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

/** A founded career stepped manually, so the next-event step is open to it. */
const world = () => {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Proprietors Town',
      color: '#335577',
      seed: 'owner-foundation',
      level: 'normal' as const,
    },
    DISABLED_RELEASE,
  );
  w.settings = { ...w.settings!, mode: 'manual' };
  return w;
};

describe('an ended career (→OWNER-16)', () => {
  it.each(['club', 'owner', 'fans'] as const)(
    'advances nothing and reads only the inbox after %s',
    (cause) => {
      const w = world();
      expect(careerEnded(w)).toBe(false);
      w.ended = cause;
      expect(careerEnded(w)).toBe(true);
      const before = canonical(w),
        revision = w.revision;
      expect(advanceDays(w, 3)).toBeUndefined();
      expect(advanceRound(w)).toBeUndefined();
      expect(prepareRound(w, () => undefined)).toBe(false);
      // A whole-season loop stops too, whether the career ended mid-season or at a close.
      expect(simulateSeason(w)).toBe(w);
      expect(() => assertNextEvent(w)).toThrow('중요한 구단 상태를 먼저 확인하세요.');
      expect(() =>
        operate(w, { type: 'transfer-stance', id: w.players[0]!.id, stance: 'listed' }),
      ).toThrow(ENDED_MESSAGE);
      expect(canonical(w)).toBe(before);
      operate(w, { type: 'read-inbox' });
      expect(w.revision).toBe(revision + 1);
    },
  );
});
