import type { DomesticCup, KnockoutRound, World } from '../../contracts/src/types';
import { COUNTRIES, country } from '../../catalogs/src/index';
import { compareIds } from './primitives';
import { addEvent, clubOf, findClub, footballQuote } from './world';
import { credit } from './operations';
import { pushInbox } from './inbox';
import { seasonDayLabel } from './calendar';
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
  type Settlement,
} from './knockout';

/**
 * Midweek rounds of the domestic cup, final last (→LEAGUE-5): early September to a May final,
 * clear of every round the continental competitions use.
 */
export const DOMESTIC_CUP_ROUNDS = [5, 11, 16, 23, 28, 35, 42] as const;
/** Prize for each tie the own club wins, by rounds left after it (semi-final first), in 1901 units. */
const CUP_PRIZE = [40, 20, 10, 5] as const;

export const cupKey = (code: string) => `cup:${code}`;
export const domesticCupName = (code: string) => `${country(code).name} 컵`;

/** Every club of the country down to its amateur level; higher divisions are seeded first. */
function entrants(w: World, code: string) {
  const depth = country(code).groups.length;
  return w.clubs
    .filter((c) => c.country === code && c.tier <= depth && !c.id.startsWith('euro:'))
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
      title: `${cup.name} ${round.label} 대진 · ${home ? 'vs' : '@'} ${opponent.name}`,
      detail: `${seasonDayLabel(w.year, round.round * 7 - 3)} ${home ? '홈' : '원정'} 단판 승부 · 비기면 연장과 승부차기로 가려요.`,
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
    if (!decideTie(w, tie, legs, false)) return;
    changed = true;
    if (tie.home !== w.playerClub && tie.away !== w.playerClub) return;
    const left = roundsFor(cup.clubs.length) - 1 - index;
    // Winning the final is the title itself, paid with the trophy below.
    if (tie.winner === w.playerClub && left > 0) {
      // Cup prizes keep their rule and grow with the football index (→LEAGUE-5, →ECON-26).
      const prize = footballQuote(
        clubOf(w).country,
        w.year,
        CUP_PRIZE[Math.min(left - 1, CUP_PRIZE.length - 1)],
      );
      credit(w, prize);
      addEvent(w, 'cup-prize', `${cup.name} ${round.label} 통과`, `${cup.name} 상금`, prize);
    } else if (tie.winner !== w.playerClub)
      addEvent(w, 'cup-exit', `${cup.name} ${round.label} 탈락`, cup.name);
  });
  if (!roundDecided(round)) return changed;
  const left = survivors(round);
  if (left.length === 1) {
    cup.winner = left[0];
    w.cupWinners[cup.country] = cup.winner;
    if (cup.winner === w.playerClub) {
      const prize = footballQuote(clubOf(w).country, w.year, 150);
      credit(w, prize);
      addEvent(
        w,
        'cup-honor',
        `${cup.name} 우승`,
        `${w.year}/${String(w.year + 1).slice(2)} · 결승 승리`,
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
          const p = playFixture(w, f, settlement, observe);
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
      for (const f of cup.fixtures) if (!f.score) playFixture(w, f);
      progress(w, cup);
    }
}
