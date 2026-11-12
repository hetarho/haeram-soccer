import { ATTRIBUTES } from '../../contracts/src/player';
import type { World } from '../../contracts/src/types';
import { activePlayers, advanceRound } from './index';
import { staffAuthority } from './testing';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

/**
 * A club of the lowest professional division (or the `club` named) taken over in `year` (1950 by
 * default), on the released model, since sponsorship, not the match model, is the subject. Its
 * squad stays as taken over, so results follow only what a test sets.
 */
export function club({ year, club }: { year?: number; club?: string } = {}) {
  const w = simulatedWorld({
    country: 'ENG',
    seed: 'sponsors',
    ...(year === undefined ? {} : { year }),
    ...(club === undefined ? {} : { club }),
  });
  w.settings = staffAuthority(2);
  return w;
}
/** Base installments a slot's contract paid in a season, its bonuses apart. */
export const paidIn = (w: World, id: string, year: number, title: string) =>
  w.events
    .filter((e) => e.kind === `sponsor:${id}` && e.year === year && e.title === title)
    .reduce((sum, e) => sum + BigInt(e.amount!), 0n);
/** Every player of the squad at one skill, to decide where the season ends. */
export function squadOf(w: World, skill: number) {
  for (const p of activePlayers(w)) {
    for (const a of ATTRIBUTES) p.attrs[a] = skill;
    p.potential = skill;
  }
}
/** The season's 45 rounds before its last, unobserved: a test plays the last and the close. */
export function toFinalRound(w: World) {
  while (w.round < 45) advanceRound(w, undefined, false);
  return w;
}
