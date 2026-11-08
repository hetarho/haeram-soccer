import { message as sourceMessage } from '../../contracts/src/messages';
import { awardReputation, REPUTATION_CONFIG } from './reputation';
import type { DomesticCup, KnockoutRound, World } from '../../contracts/src/types';
import { COUNTRIES } from '../../catalogs/src/index';
import { compareIds } from './primitives';
import { cupKey, DOMESTIC_CUP_ROUNDS, domesticCupName } from './competition-keys';
export { cupKey, DOMESTIC_CUP_ROUNDS, domesticCupName } from './competition-keys';
import { addEvent } from './events';
import { broadcastQuote } from './quotes';
import { clubOf } from './player-state';
import { findClub } from './world';
import { credit } from './transactions';
import { pushInbox } from './inbox';
import { seasonDayLabel } from './calendar';
import { captureCupTitle } from './manager-history-capture';
import {
  decideTie,
  isDue,
  legsOf,
  openDraw,
  playFixture,
  roundDecided,
  roundLabel,
  roundsFor,
  splitByes,
  survivors,
  tieFixtures,
  tieRule,
  type Settlement,
} from './knockout';

/**
 * Cup prizes in units on the broadcasting index (→ECON-31): `ties` for each tie the own club wins,
 * by rounds left after it (semi-final first), and `honor` for the title.
 */
export const CUP_PRIZE_CONFIG = {
  ties: [7, 3.5, 1.8, 0.9] as readonly number[],
  honor: 27,
};
/**
 * The prize for a cup tie won with `left` rounds after it (1 for a semi-final, →LEAGUE-5), on the
 * broadcasting index of country `code` in `year` (→ECON-31); a final won (`left` 0) pays its title
 * instead. The owner's club and a club nobody owns' book (→ECON-36) are paid by this one rule.
 */
export function cupTiePrize(code: string, year: number, left: number) {
  if (left <= 0) return '0';
  const ties = CUP_PRIZE_CONFIG.ties;
  return broadcastQuote(code, year, ties[Math.min(left - 1, ties.length - 1)]);
}
/** The cup title's prize on the broadcasting index of country `code` in `year` (→LEAGUE-5, ECON-31). */
export function cupTitlePrize(code: string, year: number) {
  return broadcastQuote(code, year, CUP_PRIZE_CONFIG.honor);
}
/** The rounds left after round `index` of a cup drawn from `entrants` clubs: 0 for the final. */
export function cupRoundsLeft(entrants: number, index: number) {
  return roundsFor(entrants) - 1 - index;
}

/** Every professional club of the country (→LEAGUE-5); higher divisions are seeded first. */
function entrants(w: World, code: string) {
  return w.clubs
    .filter((c) => c.country === code && !c.id.startsWith('euro:'))
    .sort((a, b) => a.tier - b.tier || b.strength - a.strength || compareIds(a.id, b.id))
    .map((c) => c.id);
}

function schedule(rounds: number, index: number) {
  const slots = DOMESTIC_CUP_ROUNDS.slice(-rounds);
  return slots[Math.min(index, slots.length - 1)];
}

function draw(w: World, cup: DomesticCup, clubs: string[], index: number, total: number) {
  const key = cupKey(cup.country);
  const { playing, byes } = index === 0 ? splitByes(clubs) : { playing: clubs, byes: [] };
  const round: KnockoutRound = {
    label: roundLabel(clubs.length, index),
    round: schedule(total, index),
    legs: 1,
    ties: openDraw(w, playing, `${w.year}:${key}:${index}`),
    ...(byes.length ? { byes } : {}),
  };
  cup.rounds.push(round);
  cup.fixtures.push(...tieFixtures(w, key, 'cup', cup.country, index, round));
  const own = round.ties.find((t) => t.home === w.playerClub || t.away === w.playerClub);
  if (own) {
    const home = own.home === w.playerClub;
    const opponent = findClub(w, home ? own.away : own.home);
    pushInbox(w, {
      kind: 'cup',
      title: sourceMessage('copy.cups.d1b6adc1bb', {
        p0: cup.name,
        p1: round.label,
        p2: home ? 'vs' : '@',
        p3: opponent.name,
      }),
      detail: sourceMessage('copy.cups.18ddccaf68', {
        p0: seasonDayLabel(w.year, round.round * 7 - 3),
        p1: home ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
      }),
      // Stops the clock only where cup draws are enabled (level 1 or the detail setting).
      attention: true,
    });
  }
}

/** A new season's cups: every country draws its first round (→LEAGUE-5). */
export function prepareCups(w: World) {
  w.cups = COUNTRIES.map((c) => {
    const clubs = entrants(w, c.code);
    const cup: DomesticCup = {
      country: c.code,
      name: domesticCupName(c.code),
      clubs,
      rounds: [],
      fixtures: [],
    };
    draw(w, cup, clubs, 0, roundsFor(clubs.length));
    return cup;
  });
}

/** Decides finished ties; a complete round draws the next one or crowns the winner. */
function progress(w: World, cup: DomesticCup) {
  const key = cupKey(cup.country);
  const index = cup.rounds.length - 1,
    round = cup.rounds[index];
  if (!round || cup.winner) return false;
  let changed = false;
  round.ties.forEach((tie, t) => {
    const legs = legsOf(w, cup.fixtures, key, index, t);
    if (!decideTie(tie, legs, false)) return;
    changed = true;
    if (tie.home !== w.playerClub && tie.away !== w.playerClub) return;
    const left = cupRoundsLeft(cup.clubs.length, index);
    // Winning the final is the title itself, paid with the trophy below.
    if (tie.winner === w.playerClub && left > 0) {
      // Cup prizes keep their rule and grow with the broadcasting index (→LEAGUE-5, →ECON-31).
      const prize = cupTiePrize(clubOf(w).country, w.year, left);
      credit(w, prize);
      addEvent(
        w,
        'cup-prize',
        sourceMessage('copy.cups.71af979896', { p0: cup.name, p1: round.label }),
        sourceMessage('copy.cups.f3b8bcee16', { p0: cup.name }),
        prize,
      );
    } else if (tie.winner !== w.playerClub)
      addEvent(
        w,
        'cup-exit',
        sourceMessage('copy.cups.58db98f85c', { p0: cup.name, p1: round.label }),
        cup.name,
      );
  });
  if (!roundDecided(round)) return changed;
  const left = survivors(round);
  if (left.length === 1) {
    cup.winner = left[0];
    w.cupWinners[cup.country] = cup.winner;
    awardReputation(w, cup.winner, REPUTATION_CONFIG.cup);
    if (cup.winner === w.playerClub) {
      // Credited to the manager in charge as the final is decided (→HIST-19).
      captureCupTitle(w, 'cup');
      const prize = cupTitlePrize(clubOf(w).country, w.year);
      credit(w, prize);
      addEvent(
        w,
        'cup-honor',
        sourceMessage('copy.CareerRecordBook.2bfc53c804', { p0: cup.name }),
        sourceMessage('copy.cups.daa07e344a', { p0: w.year, p1: String(w.year + 1).slice(2) }),
        prize,
      );
    }
    return true;
  }
  draw(w, cup, left, index + 1, roundsFor(cup.clubs.length));
  return true;
}

/** Plays every cup tie due today (or by the current round) and moves the brackets on. */
export function advanceCups(w: World, settlement?: Settlement, day?: number, observe = true) {
  for (const cup of w.cups || []) {
    for (let guard = 0; guard < 16; guard++) {
      let played = false;
      for (const f of cup.fixtures)
        if (isDue(w, f, day)) {
          const p = playFixture(w, f, settlement, observe, tieRule(f, cup.fixtures, false));
          if (p && (f.home === w.playerClub || f.away === w.playerClub)) settlement?.(w, p);
          played = true;
        }
      if (!progress(w, cup) && !played) break;
    }
  }
}

/** Season close: anything still unplayed (older saves) is played out so every cup has a winner. */
export function finishCups(w: World) {
  if (!w.cups) prepareCups(w);
  for (const cup of w.cups!)
    for (let guard = 0; guard < 16 && !cup.winner; guard++) {
      for (const f of cup.fixtures)
        if (!f.score) playFixture(w, f, undefined, true, tieRule(f, cup.fixtures, false));
      progress(w, cup);
    }
}
