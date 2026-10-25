import { decideCoachingIntention, initializeCoaching } from './coaching-entry';
import {
  careerDate,
  closeEmployment,
  peopleOf,
  playingChanged,
  retainPerson,
} from './person-careers';
import { invalidateNpcSquads } from './world';
import type { PersonCareer, Player, Position, World } from '../../contracts/src/types';
import { currentDay, dayCountedFrom, seasonDayLabel, seasonDayOf } from './calendar';
import { clamp, integer, random } from './primitives';
import { activePlayers, addEvent, fatigueLoad, isInjured, overall, ownStarters } from './world';
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
  const age = year + 1 - born - (position === 'GK' ? 1 : 0);
  if (age >= RETIREMENT.lastAge) return 1;
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
export function retirePerson(w: World, person: PersonCareer) {
  if (person.playing === 'retired') return;
  recordRetirementAnnouncement(w, person);
  closeEmployment(w, person.id, 'player');
  person.playing = 'retired';
  playingChanged(w);
  person.retirement!.at = careerDate(w);
  initializeCoaching(w, person);
  invalidateNpcSquads(w);
}
function announceNpcRetirements(w: World) {
  for (const person of peopleOf(w)) {
    if (person.playing === 'retired' || person.club === w.playerClub || person.retirement) continue;
    const age = w.year + 1 - person.born;
    const chance =
      age >= RETIREMENT.lastAge
        ? 1
        : retirementChanceWithContext(w.year, person.born, person.position);
    if (random(`${w.seed}:retire:${person.id}:${w.year}`)() < chance)
      recordRetirementAnnouncement(w, person);
  }
}

function careerLine(w: World, p: Player) {
  // A match counts when he played in it (→HIST-13), not when an unused substitute was listed.
  const apps = w.ownMatches.filter((m) =>
    m.players.some((line) => line.id === p.id && line.metrics[10]! > 0),
  ).length;
  return `우리 클럽 ${apps}경기 ${p.career[0]}골 ${p.career[1]}도움`;
}

/** 1 April: each veteran decides, from his own stream, whether to stop at the season's end. */
export function announceRetirements(w: World) {
  if (currentDay(w) !== retirementAnnounceDay(w.year)) return;
  announceNpcRetirements(w);
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
      `${p.name} 은퇴 발표`,
      `${age}세 · 이번 시즌을 끝으로 은퇴 · ${careerLine(w, p)}`,
    );
    pushInbox(w, {
      kind: 'staff-report',
      title: `${p.name}, 이번 시즌 끝으로 은퇴`,
      detail: `${p.position} · ${age}세 · ${careerLine(w, p)}. 시즌이 끝날 때까지 뛰고 떠나요. 이적시장에서 대체 선수를 준비하세요.`,
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
    addEvent(w, 'retirement', `${p.name}의 다음 장`, `${age}세 은퇴 · ${careerLine(w, p)}`);
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
export const INJURY = {
  perStarter: 0.018,
  /** Extra chance per point of fatigue beyond match fitness. */
  fatigue: 1 / 25,
  pressing: 1.15,
  bands: [
    { share: 0.6, days: [5, 14], label: ['근육 타박상', '가벼운 발목 염좌', '근육 경련'] },
    { share: 0.25, days: [15, 35], label: ['햄스트링 부상', '종아리 근육 부상', '사타구니 부상'] },
    {
      share: 0.12,
      days: [36, 90],
      label: ['발목 인대 부상', '중족골 골절', '무릎 내측 인대 부상'],
    },
    { share: 0.03, days: [120, 240], label: ['전방 십자인대 파열', '아킬레스건 부상'] },
  ],
} as const;

export function injuryChance(p: Player, pressing: boolean) {
  return (
    INJURY.perStarter *
    (1 + fatigueLoad(p.fatigue) * INJURY.fatigue) *
    (1 + Math.max(0, 55 - p.attrs.stamina) / 150) *
    (pressing ? INJURY.pressing : 1)
  );
}

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
    injure(w, p, r, '훈련 중 ');
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
    `약 ${Math.max(1, Math.round(days / 7))}주 결장 · ${back} 복귀 예상`,
  );
  pushInbox(w, {
    kind: 'staff-report',
    title: `의료팀 보고: ${p.name} ${where}${label}`,
    detail: `${p.position} · 약 ${Math.max(1, Math.round(days / 7))}주 결장 예상(${back} 복귀). 감독이 다른 선수로 선발을 짜요.`,
    attention: false,
    ref: p.id,
  });
}

/** Healed injuries leave the record clean; the event log keeps the history. */
export function clearHealed(w: World) {
  for (const p of w.players) if (p.injury && !isInjured(w, p)) delete p.injury;
}
