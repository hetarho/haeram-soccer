import { message as sourceMessage } from '../../contracts/src/messages';
import { hasOwner } from './owner';
import { decideCoachingIntention, initializeCoaching } from './coaching-entry';
import {
  careerDate,
  closeEmployment,
  peopleOf,
  playingChanged,
  retainPerson,
} from './person-careers';
import { invalidateNpcSquad } from './world';
import type { PersonCareer, Player, Position, World } from '../../contracts/src/types';
import { currentDay, dayCountedFrom, seasonDayLabel, seasonDayOf } from './calendar';
import { clamp, integer, random } from './primitives';
import { activePlayers, fatigueLoad, overall } from './player-state';
import { addEvent } from './events';
import { isInjured, ownStarters } from './world';
import { pushInbox } from './inbox';
import { leaveContract } from './contracts';

/**
 * Players decide in spring whether this season is their last (→CLUB-3): the chance rises with
 * age at the season's end, falls for a regular starter still playing well and rises for one who
 * hardly plays. Keepers last about a season longer. At 41 everyone stops.
 */
export const RETIREMENT = {
  /** Chance by age at the season's end, from 33. */
  byAge: [0.08, 0.18, 0.35, 0.6, 0.8, 0.95] as const,
  firstAge: 33,
  lastAge: 41,
  starter: 0.6,
  fringe: 1.4,
  /** Season minutes under this make a player a fringe player. */
  fringeMinutes: 900,
} as const;

export function retirementAnnounceDay(year: number) {
  return seasonDayOf(year, 4, 1);
}

/** Unknown NPC minutes are absent, never interpreted as a fringe player's zero. */
export function retirementChanceWithContext(
  year: number,
  born: number,
  position: Position,
  context: { minutes?: number; strongStarter?: boolean } = {},
) {
  if (year + 1 - born >= RETIREMENT.lastAge) return 1;
  const age = year + 1 - born - (position === 'GK' ? 1 : 0);
  if (age < RETIREMENT.firstAge) return 0;
  const base = RETIREMENT.byAge[Math.min(age - RETIREMENT.firstAge, RETIREMENT.byAge.length - 1)];
  const fringe = context.minutes !== undefined && context.minutes < RETIREMENT.fringeMinutes;
  return clamp(
    base * (context.strongStarter ? RETIREMENT.starter : fringe ? RETIREMENT.fringe : 1),
    0,
    1,
  );
}
/** Own-player context and probabilities retain their existing rules. */
export function retirementChance(w: World, p: Player, starters?: Set<string>) {
  return retirementChanceWithContext(w.year, p.born, p.position, {
    minutes: p.season[10],
    strongStarter: starters?.has(p.id) && overall(p) >= 60,
  });
}
export function recordRetirementAnnouncement(w: World, person: PersonCareer, year = w.year) {
  if (!person.retirement) person.retirement = { announced: careerDate(w), year };
  decideCoachingIntention(w, person);
}
export function retirePerson(w: World, person: PersonCareer, reselect = true) {
  if (person.playing === 'retired') return;
  const club = person.club;
  recordRetirementAnnouncement(w, person);
  closeEmployment(w, person.id, 'player');
  person.playing = 'retired';
  playingChanged(w);
  person.retirement!.at = careerDate(w);
  initializeCoaching(w, person);
  if (club && reselect) invalidateNpcSquad(w, club);
}
export function announceNpcRetirements(w: World) {
  if (w.npcRetirementAt === w.year) return;
  // Aggregate minutes are known only for named participants; absent never means zero.
  const minutes = new Map<string, number>();
  if (w.npcSeason?.year === w.year)
    for (const competition of w.npcSeason.competitions)
      for (const p of competition.players)
        minutes.set(p.id, (minutes.get(p.id) ?? 0) + p.clubs.reduce((n, c) => n + c.metrics[10]!, 0));
  const live = new Set<string>();
  for (const players of Object.values(w.squads ?? {})) {
    const starters = new Set(players.slice(0, 11).map((p) => p.id));
    for (const p of players) {
      live.add(p.id);
      const person = w.people?.[p.id];
      if (person?.retirement) {
        p.retiring = person.retirement.year;
        continue;
      }
      if (p.retiring !== undefined) continue;
      const known = minutes.get(p.id);
      const chance = retirementChanceWithContext(w.year, p.born, p.position, {
        minutes: known,
        strongStarter: known !== undefined && starters.has(p.id) && overall(p) >= 60,
      });
      if (!chance || random(`${w.seed}:retire:${p.id}:${w.year}`)() >= chance) continue;
      p.retiring = w.year;
      if (person) recordRetirementAnnouncement(w, person);
    }
  }
  for (const person of peopleOf(w)) {
    if (
      live.has(person.id) ||
      person.playing === 'retired' ||
      person.club === w.playerClub ||
      person.retirement
    )
      continue;
    const age = w.year + 1 - person.born;
    const chance =
      age >= RETIREMENT.lastAge
        ? 1
        : retirementChanceWithContext(w.year, person.born, person.position);
    if (random(`${w.seed}:retire:${person.id}:${w.year}`)() < chance)
      recordRetirementAnnouncement(w, person);
  }
  w.npcRetirementAt = w.year;
}

function careerLine(w: World, p: Player) {
  // A match counts when he played in it (→HIST-13), not when an unused substitute was listed.
  const apps = w.ownMatches.filter((m) =>
    m.players.some((line) => line.id === p.id && line.metrics[10]! > 0),
  ).length;
  return sourceMessage('copy.careers.62fb838450', { p0: apps, p1: p.career[0], p2: p.career[1] });
}

/** 1 April: each veteran decides, from his own stream, whether to stop at the season's end. */
export function announceRetirements(w: World) {
  if (currentDay(w) !== retirementAnnounceDay(w.year)) return;
  announceNpcRetirements(w);
  if (!hasOwner(w)) return;
  const starters = new Set(ownStarters(w).map((p) => p.id));
  for (const p of activePlayers(w)) {
    if (p.loanUntil || p.retiring !== undefined) continue;
    const chance = retirementChance(w, p, starters);
    if (!chance || random(`${w.seed}:retire:${p.id}:${w.year}`)() >= chance) continue;
    p.retiring = w.year;
    recordRetirementAnnouncement(w, retainPerson(w, p, w.playerClub, true));
    delete p.stance;
    const age = w.year + 1 - p.born;
    addEvent(
      w,
      'retirement-announce',
      sourceMessage('copy.careers.e1e5c40770', { p0: p.name }),
      sourceMessage('copy.careers.955985f96c', { p0: age, p1: careerLine(w, p) }),
    );
    pushInbox(w, {
      kind: 'staff-report',
      title: sourceMessage('copy.careers.18b4e2fb19', { p0: p.name }),
      detail: sourceMessage('copy.careers.619c47459d', {
        p0: p.position,
        p1: age,
        p2: careerLine(w, p),
      }),
      attention: false,
      ref: p.id,
    });
  }
}

/**
 * Season close: announced retirements take effect; career records stay with the club. Like a sale,
 * retiring ends his talk, unhappiness and transfer request with their items (→CLUB-27).
 */
export function retireAtClose(w: World) {
  for (const p of activePlayers(w)) {
    const age = w.year + 1 - p.born;
    if (p.retiring !== w.year && age < RETIREMENT.lastAge) continue;
    p.status = 'retired';
    const person = retainPerson(w, p, w.playerClub, true);
    retirePerson(w, person);
    delete p.stance;
    leaveContract(w, p);
    addEvent(
      w,
      'retirement',
      sourceMessage('copy.careers.a1549f3110', { p0: p.name }),
      sourceMessage('copy.careers.8b93b53d6c', { p0: age, p1: careerLine(w, p) }),
    );
  }
  for (const person of peopleOf(w)) {
    if (person.playing === 'retired' || person.club === w.playerClub) continue;
    if (
      (person.retirement && person.retirement.year <= w.year) ||
      w.year + 1 - person.born >= RETIREMENT.lastAge
    )
      retirePerson(w, person);
  }
}

/**
 * Own players can be hurt in a match (→CLUB-23): about one injury every five matches, more for
 * tired legs and low stamina. Most heal in a week or two; a few end a season.
 */
import { INJURY } from './injury-rules';
export { INJURY, injuryChance } from './injury-rules';

/** Chance a player training under 하드 picks up an injury in a settled round (→CLUB-23). */
export const TRAINING_INJURY = 0.005;
export function trainingInjuryChance(p: Player) {
  return TRAINING_INJURY * (1 + fatigueLoad(p.fatigue) * INJURY.fatigue);
}
/** A settled round of 하드 트레이닝: each player in it may get hurt, from his own stream (→CLUB-23). */
export function trainingInjuries(w: World, players: readonly Player[]) {
  for (const p of players) {
    if (p.status !== 'active' || isInjured(w, p)) continue;
    const r = random(`${w.seed}:training-injury:${w.year}:${w.round}:${p.id}`);
    if (r() >= trainingInjuryChance(p)) continue;
    injure(w, p, r, sourceMessage('copy.careers.a1e2bc1a06'));
  }
}
/** Days out and the name of an injury drawn from the table's bands (→CLUB-23). */
export function drawInjury(r: () => number) {
  let u = r(),
    band: (typeof INJURY.bands)[number] = INJURY.bands[INJURY.bands.length - 1];
  for (const b of INJURY.bands) {
    if (u < b.share) {
      band = b;
      break;
    }
    u -= b.share;
  }
  return {
    days: integer(r, band.days[0], band.days[1]),
    label: band.label[integer(r, 0, band.label.length - 1)],
  };
}
/** An injury of the table's bands, reported to the inbox (→CLUB-23). */
export function injure(w: World, p: Player, r: () => number, where = '') {
  const { days, label } = drawInjury(r);
  p.injury = { year: w.year, day: dayCountedFrom(w, w.year) + days, label };
  const back = seasonDayLabel(w.year, p.injury.day);
  addEvent(
    w,
    'injury',
    `${p.name} ${where}${label}`,
    sourceMessage('copy.careers.ba3aa948d1', { p0: Math.max(1, Math.round(days / 7)), p1: back }),
  );
  pushInbox(w, {
    kind: 'staff-report',
    title: sourceMessage('copy.careers.4fcfea9488', { p0: p.name, p1: where, p2: label }),
    detail: sourceMessage('copy.careers.68a0eac16e', {
      p0: p.position,
      p1: Math.max(1, Math.round(days / 7)),
      p2: back,
    }),
    attention: false,
    ref: p.id,
  });
}

/** Healed injuries leave the record clean; the event log keeps the history. */
export function clearHealed(w: World) {
  for (const p of w.players) if (p.injury && !isInjured(w, p)) delete p.injury;
}
