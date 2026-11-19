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
import {
  coldPlayerRecordIds,
  releasePlayerRecords,
} from '../../../../packages/engine/src/player-records';
import {
  coldOwnMatchCount,
  ownMatchesBase,
  releaseOwnMatches,
} from '../../../../packages/engine/src/own-matches';
import type { RowSaver, SaveStats } from './rowSaver';

/** What a mover does once the write holding its cold rows has committed. */
export type AfterCommit = () => void;

/** The people the next save moves out of memory (`hasCurrentRole`), in registry order. */
export function coldPeopleIds(w: World): string[] {
  const referenced = referencedPeople(w);
  return peopleOf(w)
    .filter((person) => !hasCurrentRole(w, person, referenced))
    .map((person) => person.id);
}

/**
 * Marks the person row of everyone in memory without a current role (`hasCurrentRole`) cold in the
 * next save; after it commits they leave `w.people`, which keeps everyone else in order, and every
 * read of them goes to their cold rows (`personOf`).
 */
export function moveColdPeople(
  w: World,
  saver: Pick<RowSaver, 'markCold'>,
  cold: readonly string[] = coldPeopleIds(w),
): AfterCommit {
  if (!cold.length) return () => {};
  saver.markCold('person', cold);
  return () => releasePeople(w, cold);
}

/**
 * Marks the player record of everyone neither in play nor in memory cold in the next save
 * (`isColdPlayerRecord`), the people `leaving` at the same save counted as gone; after it commits
 * they leave `w.playerRecords`, which keeps the others in order, and every read of them goes to
 * their cold rows (`playerRecordOf`).
 */
export function moveColdPlayerRecords(
  w: World,
  saver: Pick<RowSaver, 'markCold'>,
  leaving: ReadonlySet<string> = new Set(),
): AfterCommit {
  const cold = coldPlayerRecordIds(w, leaving);
  if (!cold.length) return () => {};
  saver.markCold('player_record', cold);
  return () => releasePlayerRecords(w, cold);
}

/**
 * Marks the own matches of seasons before the current one cold in the next save (→SAVE-32,
 * →MATCH-5), with `ownMatchesBase` grown by their count in the same write; after it commits they
 * leave `w.ownMatches` and the base counts them, so every absolute index and row key stays, and
 * every read of them goes to their cold rows (`ownMatchAt` and the other accessors).
 */
export function moveColdOwnMatches(
  w: World,
  saver: Pick<RowSaver, 'markCold' | 'setField'>,
): AfterCommit {
  const n = coldOwnMatchCount(w);
  if (!n) return () => {};
  const base = ownMatchesBase(w);
  saver.markCold(
    'own_match',
    Array.from({ length: n }, (_, i) => String(base + i)),
  );
  saver.setField('ownMatchesBase', base + n);
  return () => releaseOwnMatches(w, n);
}

/**
 * Saves `w` as one write with every mover's cold rows (→SAVE-3, →SAVE-32); only a committed write
 * moves anything out of memory.
 */
export function saveMovingCold(w: World, saver: RowSaver): SaveStats {
  const people = coldPeopleIds(w);
  const after = [
    moveColdPeople(w, saver, people),
    moveColdPlayerRecords(w, saver, new Set(people)),
    moveColdOwnMatches(w, saver),
  ];
  const stats = saver.save(w);
  for (const done of after) done();
  return stats;
}
