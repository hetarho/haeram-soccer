import type { World } from '../../contracts/src/types';
import { temperamentOf, type DelegatePost, type Temperament } from './delegation-info';
import { staffMember } from './staff-info';

/** The first `prefix:n` key whose person has `temperament`. */
export function keyWith(temperament: Temperament, prefix = 'person') {
  for (let n = 0; ; n++)
    if (temperamentOf(`${prefix}:${n}`) === temperament) return `${prefix}:${n}`;
}
/** Gives the holder of `post` a person whose temperament is `temperament`. */
export function holdTemperament(w: World, post: DelegatePost, temperament: Temperament) {
  const member = staffMember(w, post);
  if (!member) throw new Error(`no ${post}`);
  member.person = keyWith(temperament, post);
  return member;
}
