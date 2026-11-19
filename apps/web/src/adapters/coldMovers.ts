/**
 * Moving records the current season no longer changes out of memory at a save (→SAVE-32): each
 * mover marks its records' rows cold in the save's one write and, only once that write has
 * committed, drops them from the world. A failed write leaves memory as it was (→SAVE-3).
 *
 * The movers run in one order before the write: people first (T1014), then player records, own
 * matches, events, news and archives (T1015–T1018), each adding its own mover here.
 */
import type { World } from '../../../../packages/contracts/src/types';
import {
  hasCurrentRole,
  peopleOf,
  referencedPeople,
  releasePeople,
} from '../../../../packages/engine/src/person-careers';
import type { RowSaver, SaveStats } from './rowSaver';

/** What a mover does once the write holding its cold rows has committed. */
export type AfterCommit = () => void;

/**
 * Marks the person row of everyone in memory without a current role (`hasCurrentRole`) cold in the
 * next save; after it commits they leave `w.people`, which keeps everyone else in order, and every
 * read of them goes to their cold rows (`personOf`).
 */
export function moveColdPeople(w: World, saver: Pick<RowSaver, 'markCold'>): AfterCommit {
  const referenced = referencedPeople(w);
  const cold = peopleOf(w)
    .filter((person) => !hasCurrentRole(w, person, referenced))
    .map((person) => person.id);
  if (!cold.length) return () => {};
  saver.markCold('person', cold);
  return () => releasePeople(w, cold);
}

/**
 * Saves `w` as one write with every mover's cold rows (→SAVE-3, →SAVE-32); only a committed write
 * moves anything out of memory.
 */
export function saveMovingCold(w: World, saver: RowSaver): SaveStats {
  const after = [moveColdPeople(w, saver)];
  const stats = saver.save(w);
  for (const done of after) done();
  return stats;
}
