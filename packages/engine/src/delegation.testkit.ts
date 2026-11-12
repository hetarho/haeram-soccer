import type { World } from '../../contracts/src/types';
import { temperamentOf, type DelegatePost, type Temperament } from './delegation-info';
import { staffMember } from './staff-info';

/** The first `prefix:n` key whose person has `temperament`. */
export function keyWith(temperament: Temperament, prefix = 'person') {
  for (let n = 0; ; n++)
    if (temperamentOf(`${prefix}:${n}`) === temperament) return `${prefix}:${n}`;
}
/**
 * Gives the holder of `post` the temperament `temperament`. Temperament is drawn from his person
 * key, else his staff id (→`temperamentOf`); every `person` the engine keeps names a registered
 * person, so a holder without one (a volunteer) is re-keyed by his id, never given an unregistered
 * person his departure could not close (→STAFF-50).
 */
export function holdTemperament(w: World, post: DelegatePost, temperament: Temperament) {
  const member = staffMember(w, post);
  if (!member) throw new Error(`no ${post}`);
  if (member.person && w.people?.[member.person]) {
    if (temperamentOf(member.person) !== temperament)
      throw new Error(`${post} is a registered person whose temperament is fixed`);
  } else {
    delete member.person;
    member.id = keyWith(temperament, post);
  }
  return member;
}
