/**
 * League football stops for the war (→WORLD-14): after the 1938/39 close the world moves to
 * 1 August 1946 without playing 1939/40–1945/46. Both the world before the takeover and a career
 * that reaches the 1938/39 close cross it here, from the season close.
 */
import type { CareerDate, World } from '../../contracts/src/types';
import { SEASON_END_DAY } from './calendar';
import { hasOwner, ownerSettleGap } from './owner';

/** The last season played before the war and the season league football restarts with. */
export const WARTIME = { last: 1938, restart: 1946 } as const;

/** The season after `year`'s: 1946/47 after 1938/39, otherwise the next one. */
export function seasonAfter(year: number) {
  return year === WARTIME.last ? WARTIME.restart : year + 1;
}
/** The first season played from `year` on: the restart for a season the war skips. */
export function seasonFrom(year: number) {
  return year > WARTIME.last && year < WARTIME.restart ? WARTIME.restart : year;
}

/**
 * The gap after `closed`'s close, once `w.year` is the restart and before its season opens.
 * People age by the calendar (their birth years stay), contracts and books stand still: every
 * running term moves on by the seasons skipped, so it has as many seasons left at the restart as
 * it had at the close, and nothing is paid or earned. The owner's business keeps settling and
 * paying living costs each quarter of the gap (→OWNER-7/8).
 */
export function crossWar(w: World, closed: number) {
  const skipped = w.year - closed - 1;
  if (skipped <= 0) return;
  const later = (date: CareerDate) => ({ ...date, year: date.year + skipped });
  for (const p of w.players) {
    if (p.status !== 'active') continue;
    p.until += skipped;
    if (p.loanUntil !== undefined) p.loanUntil += skipped;
  }
  for (const p of w.academy?.players ?? []) p.until += skipped;
  if (hasOwner(w)) w.manager.until += skipped;
  for (const member of w.staff ?? []) member.until += skipped;
  for (const sponsor of w.sponsors ?? []) sponsor.until += skipped;
  for (const m of w.managerMarket?.free ?? []) m.until += skipped;
  for (const person of Object.values(w.people ?? {})) {
    if (person.loan) person.loan = { ...person.loan, until: person.loan.until + skipped };
    for (const job of person.employment)
      if (!job.to && job.contractUntil) job.contractUntil = later(job.contractUntil);
  }
  ownerSettleGap(w, { year: closed, day: SEASON_END_DAY + 1 }, { year: w.year, day: 0 });
}
