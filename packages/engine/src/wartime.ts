/**
 * League football stops for the war (→WORLD-14): after the 1938/39 close the world moves to
 * 1 August 1946 without playing 1939/40–1945/46. Both the world before the takeover and a career
 * that reaches the 1938/39 close cross it here, from the season close.
 */
import type { CareerDate, World } from '../../contracts/src/types';
import { SEASON_END_DAY } from './calendar';
import { hasOwner, ownerSettleGap } from './owner';
import { closeNpcSummer } from './npc-careers';
import { retirementAnnounceDay, announceNpcRetirements } from './careers';

export { WARTIME, seasonAfter, seasonFrom } from './season-years';

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
  if (w.npcSummerAt !== undefined && w.npcSummerAt >= w.year - 1) return;
  const later = (date: CareerDate) => ({ ...date, year: date.year + skipped });
  for (const p of w.players) {
    if (p.status !== 'active') continue;
    p.until += skipped;
    if (p.loanUntil !== undefined) p.loanUntil += skipped;
  }
  for (const p of w.academy?.players ?? []) p.until += skipped;
  const restart = w.year,
    calendar = w.calendar,
    round = w.round;
  try {
    for (let year = closed + 1; year < restart; year++) {
      w.year = year;
      w.round = 0;
      for (const players of Object.values(w.squads ?? {}))
        for (const p of players) {
          p.until++;
          if (p.loanUntil !== undefined) p.loanUntil++;
        }
      for (const record of Object.values(w.playerRecords ?? {}))
        if (record.loan) {
          record.loan.until++;
          record.loan.contractUntil++;
        }
      for (const person of Object.values(w.people ?? {})) {
        if (person.loan) person.loan.until++;
        for (const job of person.employment)
          if (!job.to && job.role === 'player' && job.contractUntil)
            job.contractUntil = { ...job.contractUntil, year: job.contractUntil.year + 1 };
      }
      w.calendar = { day: retirementAnnounceDay(year) };
      announceNpcRetirements(w);
      w.calendar = { day: SEASON_END_DAY + 1 };
      closeNpcSummer(w, undefined, false);
    }
  } finally {
    w.year = restart;
    w.round = round;
    w.calendar = calendar;
  }
  if (hasOwner(w)) w.manager.until += skipped;
  for (const member of w.staff ?? []) member.until += skipped;
  for (const sponsor of w.sponsors ?? []) sponsor.until += skipped;
  for (const m of w.managerMarket?.free ?? []) m.until += skipped;
  for (const person of Object.values(w.people ?? {})) {
    for (const job of person.employment)
      if (!job.to && job.role !== 'player' && job.contractUntil)
        job.contractUntil = later(job.contractUntil);
  }
  ownerSettleGap(w, { year: closed, day: SEASON_END_DAY + 1 }, { year: w.year, day: 0 });
}
