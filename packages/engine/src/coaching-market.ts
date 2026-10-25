import type { CareerDate, PersonCareer, World } from '../../contracts/src/types';
import {
  activeCoachingEmployment,
  addCareerYears,
  careerDate,
  careerOrdinal,
  closeEmployment,
  openEmployment,
  profiledCoaches,
} from './person-careers';
import { coachingEntryReady } from './coaching-entry';
import { compareIds, random } from './primitives';
import { coachWage } from './staff';
import { coachSeason } from './coaching';

/** Exact contract endings are processed on days and after skipped summer, without inventing wages paid. */
export function settleNpcCoaching(w: World, grow = false) {
  const at = careerDate(w),
    now = careerOrdinal(at);
  const active = activeCoachingEmployment(w);
  // A day without growth only closes the contracts that have ended by now (T450).
  if (!grow && firstContractEnd(w, active) > now) return;
  for (const { person, job } of active) {
    if (job.club === w.playerClub) continue;
    if (grow && person.coaching && (job.grownThrough ?? job.from.year) < w.year) {
      const learned = coachSeason(
        `${w.seed}:staff-growth:${person.id}:${w.year}`,
        person.coaching.ability,
        person.coaching.potential,
        w.year - person.born,
      );
      Object.assign(person.coaching, learned);
      job.grownThrough = w.year;
    }
    if (job.contractUntil && careerOrdinal(job.contractUntil) <= now)
      closeEmployment(w, person.id, job.role, job.contractUntil);
  }
}
/**
 * The day the first of these contracts of other clubs ends (`careerOrdinal`), Infinity when none
 * has an end: worked out once per list, which `activeCoachingEmployment` replaces whenever a job
 * opens or closes, and an end is written only as its job opens.
 */
const contractEnds = new WeakMap<readonly unknown[], number>();
function firstContractEnd(
  w: World,
  active: readonly { job: { club: string; contractUntil?: CareerDate } }[],
) {
  let first = contractEnds.get(active);
  if (first === undefined) {
    first = Infinity;
    for (const { job } of active)
      if (job.club !== w.playerClub && job.contractUntil)
        first = Math.min(first, careerOrdinal(job.contractUntil));
    contractEnds.set(active, first);
  }
  return first;
}
export const coachingMarketPass = (draw: number) => draw < 0.25;
/** One person/date draw, then one suitable vacancy; no per-club attempts and no automatic renewal. */
export function refreshCoachingMarket(
  w: World,
  draw: (person: PersonCareer, at: CareerDate) => number = (person, at) =>
    random(`${w.seed}:coaching-market:${person.id}:${at.year}:${at.day}`)(),
) {
  settleNpcCoaching(w);
  const at = careerDate(w);
  if (w.coachingMarketAt && careerOrdinal(w.coachingMarketAt) === careerOrdinal(at)) return;
  w.coachingMarketAt = { ...at };
  const clubs = w.clubs
    .filter((club) => club.id !== w.playerClub)
    .sort((a, b) => compareIds(a.id, b.id));
  const occupied = new Set(activeCoachingEmployment(w).map(({ job }) => `${job.club}:${job.role}`));
  const vacancies = new Map<string, { clubs: typeof clubs; next: number }>();
  // Only someone with a coaching profile can be placed (T450).
  for (const person of profiledCoaches(w)
    .filter((person) => coachingEntryReady(person) && person.coaching)
    .sort((a, b) => compareIds(a.id, b.id))) {
    if (!coachingMarketPass(draw(person, at))) continue;
    const coaching = person.coaching!;
    let available = vacancies.get(coaching.role);
    if (!available) {
      available = {
        clubs: clubs.filter((club) => !occupied.has(`${club.id}:${coaching.role}`)),
        next: 0,
      };
      vacancies.set(coaching.role, available);
    }
    const club = available.clubs[available.next];
    if (!club) continue;
    const job = openEmployment(w, person.id, coaching.role, club.id, at);
    job.contractUntil = addCareerYears(at, 2);
    job.wage = coachWage(w, coaching.ability);
    job.currency = w.currency;
    job.grownThrough = w.year;
    occupied.add(`${club.id}:${coaching.role}`);
    available.next++;
  }
}
