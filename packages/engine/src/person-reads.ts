/**
 * Reads of a person wherever the world keeps him (→SAVE-32, →ARCH-36): memory first, then the cold
 * rows of the attached record store. A leaf beside the types, so read leaves and the UI's engine
 * imports reach it without the career writers (`person-careers.ts` re-exports it).
 */
import { recordStoreOf } from '../../contracts/src/record-store';
import type { PersonCareer, World } from '../../contracts/src/types';

/**
 * Each world's cold persons parsed from its record store, by ID (→SAVE-32). A cold row is
 * immutable while it is cold, so a parse stands until the person is restored to memory
 * (`forgetColdPerson`).
 */
const coldPeople = new WeakMap<World, Map<string, PersonCareer>>();
/** The cold row of `id` in `w`'s attached store, parsed once; rows still held in memory are not. */
function coldPerson(w: World, id: string): PersonCareer | undefined {
  const store = recordStoreOf(w);
  if (!store) return undefined;
  let parsed = coldPeople.get(w);
  const hit = parsed?.get(id);
  if (hit) return hit;
  const row = store.get('person', id);
  if (!row?.cold) return undefined;
  const person = JSON.parse(row.data) as PersonCareer;
  if (!parsed) coldPeople.set(w, (parsed = new Map()));
  parsed.set(id, person);
  return person;
}
/** Drops the parse of a cold person brought back into `w.people` (T1014). */
export function forgetColdPerson(w: World, id: string) {
  coldPeople.get(w)?.delete(id);
}
/**
 * The person `id`, wherever the world keeps him: in memory first, else as a cold row of the
 * attached record store (→SAVE-32, →ARCH-36). A read only: a cold person is changed only after
 * he is restored to memory. Only cold rows are read from the store, since every other row is
 * the saved copy of someone memory holds or has removed.
 */
export function personOf(w: World, id: string): PersonCareer | undefined {
  return w.people?.[id] ?? coldPerson(w, id);
}
/** Whether the world keeps a person `id`, in memory or as a cold row of its store. */
export function hasPerson(w: World, id: string): boolean {
  if (w.people?.[id]) return true;
  return !!recordStoreOf(w)?.get('person', id)?.cold;
}
/**
 * The IDs of every person the world keeps starting with `prefix`, in memory or as cold rows:
 * what an ID-uniqueness check reads, so a new person never takes a cold person's ID.
 */
export function personIdsWithPrefix(w: World, prefix: string): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.keys(w.people ?? {})) if (id.startsWith(prefix)) ids.add(id);
  const store = recordStoreOf(w);
  if (store)
    for (const id of store.keysWithPrefix('person', prefix))
      if (!ids.has(id) && store.get('person', id)?.cold) ids.add(id);
  return ids;
}
