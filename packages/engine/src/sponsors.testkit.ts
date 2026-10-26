import { legacySettings } from './responsibilities';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { World } from '../../contracts/src/types';
import { currency, priceIndex } from '../../catalogs/src/index';
import { activePlayers, advanceRound, prepareSeason } from './index';
import { professionalStart } from './testing';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

/**
 * A club founded in 1950, moved to `year` and to the lowest professional division if asked; on the
 * pre-feature path, since sponsorship, not the match model, is the subject.
 */
export function club({
  year,
  professional = false,
}: { year?: number; professional?: boolean } = {}) {
  const w = simulatedWorld(
    {
      country: 'ENG',
      name: 'Slot Town',
      color: '#335544',
      seed: 'sponsors',
      level: 'easy' as const,
    },
    {},
    DISABLED_RELEASE,
  );
  w.settings = legacySettings(2);
  // The squad stays as founded, so results follow only what a test sets.
  if (year) {
    w.year = year;
    // Fresh synthetic founding epoch; no played career is being moved.
    delete w.people;
    w.currency = currency('ENG', year).code;
    w.priceIndex = priceIndex('ENG', year).value;
    w.manager.since = year;
    w.manager.until = year + 3;
    for (const p of w.players) {
      p.born = year - 24;
      p.joined = year;
      p.until = year + 2;
    }
  }
  if (professional) professionalStart(w);
  else if (year) prepareSeason(w);
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
