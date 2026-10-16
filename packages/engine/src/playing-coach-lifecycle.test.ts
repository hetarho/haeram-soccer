import { describe, expect, it } from 'vitest';
import { createWorld, operate, operatingCosts } from './index';
import {
  proposePlayingCoach,
  answerPlayingCoach,
  playingCoachDepartureCost,
  endPlayingCoachForDeparture,
} from './playing-coach';
import { careerDate, atCareerDate } from './person-careers';
import {
  announceRetirements,
  recordRetirementAnnouncement,
  retireAtClose,
  retirementAnnounceDay,
} from './careers';
import { releaseStaff, seasonStaff, staffMember } from './staff';
import { pendingDecisions } from './stopping';
import { handoverSales, respondBid } from './transfers';
import type { TransferBid } from '../../contracts/src/types';
function world(years: 1 | 2 = 2, term: 1 | 2 | 3 | 4 | 5 = 5) {
  const w = createWorld({
    country: 'ENG',
    name: 'Dual Role',
    color: '#224466',
    seed: 'dual-life',
    level: 'easy',
  });
  w.cash = w.income = '999999999999';
  w.round = 35;
  w.calendar = { day: 245 };
  w.settings!.responsibilities.staff = 'direct';
  const p = w.players[0],
    person = w.people![p.id];
  p.born = w.year - 36;
  p.retiring = w.year;
  p.personality.professionalism = 5;
  p.qualities = { understanding: 5, teaching: 5, judgement: 5 };
  Object.assign(person, {
    born: p.born,
    professionalism: 5,
    qualities: { ...p.qualities },
    intention: { at: careerDate(w), draw: 0, willing: true },
  });
  recordRetirementAnnouncement(w, person);
  const costs = operatingCosts(w);
  const quote = proposePlayingCoach(w, p.id, years, term);
  answerPlayingCoach(w, p.id, true);
  return { w, id: p.id, quote, costs };
}
function bidFor(w: ReturnType<typeof createWorld>, id: string) {
  w.year++;
  w.round = 0;
  w.calendar = { day: 0 };
  const bid: TransferBid = {
    id: 'dual-sale',
    direction: 'in',
    playerId: id,
    club: w.clubs[0].id,
    fee: '9999999',
    year: w.year,
    day: 0,
    due: 5,
    status: 'pending',
  };
  (w.bids ??= []).push(bid);
  return bid;
}
describe('playing-coach independent role lifecycle', () => {
  it('counts each salary and occupied department once without changing playing attributes', () => {
    const { w, id, quote, costs } = world();
    const after = operatingCosts(w);
    expect(after.playerWages).toBe(costs.playerWages);
    expect(BigInt(after.staffWages) - BigInt(costs.staffWages)).toBe(BigInt(quote.coachWage));
    expect(w.staff!.filter((member) => member.person === id)).toHaveLength(1);
    expect(w.people![id].employment.filter((job) => !job.to)).toHaveLength(2);
    expect(w.staff!.filter((member) => member.role === quote.role)).toHaveLength(1);
  });
  it('honours deferral, then ends only playing pay and keeps unexpired coaching service without a new fee', () => {
    const { w, id, quote } = world();
    const until = quote.playingEnd;
    w.year = until - 1;
    w.calendar = { day: retirementAnnounceDay(w.year) };
    announceRetirements(w);
    expect(w.players.find((p) => p.id === id)!.retiring).toBe(until);
    retireAtClose(w);
    expect(w.players.find((p) => p.id === id)!.status).toBe('active');
    w.year = until;
    w.calendar = { day: 323 };
    const cash = w.cash,
      before = operatingCosts(w);
    retireAtClose(w);
    expect(w.players.find((p) => p.id === id)!.status).toBe('retired');
    expect(staffMember(w, quote.role)?.person).toBe(id);
    expect(w.people![id].employment.filter((job) => !job.to).map((job) => job.role)).toEqual([
      quote.role,
    ]);
    expect(w.cash).toBe(cash);
    expect(operatingCosts(w).staffWages).toBe(before.staffWages);
    const after = JSON.stringify(w);
    retireAtClose(w);
    expect(JSON.stringify(w)).toBe(after);
  });
  it('a coach dismissal leaves the player contract, fixed retirement and playing identity intact', () => {
    const { w, id, quote } = world();
    const p = w.players.find((p) => p.id === id)!;
    const before = {
      wage: p.wage,
      until: p.until,
      born: p.born,
      retiring: p.retiring,
      attrs: structuredClone(p.attrs),
    };
    releaseStaff(w, quote.role);
    expect(w.players.find((p) => p.id === id)).toMatchObject({ ...before, status: 'active' });
    expect(w.people![id].employment.filter((job) => !job.to).map((job) => job.role)).toEqual([
      'player',
    ]);
    expect(w.staff!.some((member) => member.person === id)).toBe(false);
  });
  it('a player sale ends both roles with one ordinary coach termination cost', () => {
    const { w, id } = world();
    const bid = bidFor(w, id),
      owed = playingCoachDepartureCost(w, id),
      before = BigInt(w.cash);
    respondBid(w, bid.id, true);
    expect(BigInt(w.cash)).toBe(before + BigInt(bid.fee) - BigInt(owed));
    expect(w.staff!.some((member) => member.person === id)).toBe(false);
    expect(w.people![id].club).toBe(bid.club);
    expect(w.people![id].employment.filter((job) => !job.to).map((job) => job.role)).toEqual([
      'player',
    ]);
    const cash = w.cash;
    expect(() => respondBid(w, bid.id, true)).toThrow();
    endPlayingCoachForDeparture(w, id);
    expect(w.cash).toBe(cash);
  });
  it('delegated sales wait for direct staff authority and transfer one combined pending decision', () => {
    const { w, id } = world();
    const bid = bidFor(w, id);
    w.players.find((p) => p.id === id)!.stance = 'listed';
    w.settings!.responsibilities.sales = 'delegated';
    handoverSales(w);
    expect(w.bids!.find((b) => b.id === bid.id)!.status).toBe('pending');
    const reasons = pendingDecisions(w).filter((reason) => reason.ref === bid.id);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].responsibilities).toEqual(['sales', 'staff']);
    const settings = structuredClone(w.settings!);
    settings.responsibilities.staff = 'delegated';
    operate(w, { type: 'settings', settings });
    expect(w.bids!.find((b) => b.id === bid.id)!.status).toBe('completed');
    expect(w.staff!.some((member) => member.person === id)).toBe(false);
  });
  it('same-close coach expiry follows direct authority, with the same dated role ends and no extra fee', () => {
    const { w, id, quote } = world(1, 2);
    w.year = quote.playingEnd;
    w.calendar = { day: 323 };
    retireAtClose(w);
    const retired = w.people![id].retirement!.at!;
    const cash = w.cash;
    w.year++;
    w.calendar = { day: 0 };
    atCareerDate(w, retired, () => seasonStaff(w));
    expect(w.staff!.some((member) => member.person === id)).toBe(false);
    expect(w.cash).toBe(cash);
    expect(
      w
        .people![id].employment.filter((job) => job.role === 'player' || job.role === quote.role)
        .map((job) => job.to),
    ).toEqual([retired, retired]);
  });
  it('enforces the actual age-41 cap even with a future deferred date', () => {
    const { w, id, quote } = world();
    const p = w.players.find((p) => p.id === id)!;
    p.born = w.year - 40;
    w.people![id].born = p.born;
    staffMember(w, quote.role)!.born = p.born;
    retireAtClose(w);
    expect(p.status).toBe('retired');
    expect(staffMember(w, quote.role)?.person).toBe(id);
  });
});
