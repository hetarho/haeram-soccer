import type { CareerDate, PersonCareer, World } from '../../contracts/src/types';
import {
  activeCoachingEmployment,
  addCareerYears,
  careerDate,
  careerOrdinal,
  closeEmployment,
  openEmployment,
} from './person-careers';
import { coachingEntryReady } from './coaching-entry';
import { compareIds, random } from './primitives';
import { coachWage } from './staff';
import { coachSeason } from './coaching';

/** Exact contract endings are processed on days and after skipped summer, without inventing wages paid. */
export function settleNpcCoaching(w: World, grow = false) {
  const at = careerDate(w),
    now = careerOrdinal(at);
  for (const { person, job } of activeCoachingEmployment(w)) {
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
  for (const person of Object.values(w.people || {})
    .filter((person) => coachingEntryReady(person) && person.coaching)
    .sort((a, b) => compareIds(a.id, b.id))) {
    if (!coachingMarketPass(draw(person, at))) continue;
    const coaching = person.coaching!,
      club = clubs.find((club) => !occupied.has(`${club.id}:${coaching.role}`));
    if (!club) continue;
    const job = openEmployment(w, person.id, coaching.role, club.id, at);
    job.contractUntil = addCareerYears(at, 2);
    job.wage = coachWage(w, coaching.ability);
    job.currency = w.currency;
    job.grownThrough = w.year;
    occupied.add(`${club.id}:${coaching.role}`);
  }
}
