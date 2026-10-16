import { describe, expect, it } from 'vitest';
import type { StaffTrait, World } from '../../contracts/src/types';
import {
  createWorld,
  basicStaff,
  transferOffers,
  placeBid,
  staffSignings,
  ratio,
  handoverRecruitment,
  transferWindowDays,
} from './index';
import { staffBidShare } from './director-bidding';
import { legacySettings } from './responsibilities';
import { STAFF_INFO, STAFF_TRAIT_INFO } from './staff';
function world(trait?: StaffTrait) {
  const w = createWorld({
    country: 'ENG',
    name: 'Bidding Town',
    color: '#224433',
    seed: 'director-bids',
    level: 'easy',
  });
  w.settings = legacySettings(4);
  w.staff ??= basicStaff(w);
  const director = w.staff.find((s) => s.role === 'director')!;
  delete director.trait;
  if (trait) director.trait = trait;
  w.cash = w.income = '999999999999';
  w.round = 23;
  w.calendar = { day: transferWindowDays(w.year).winterOpen };
  w.direction = { finance: 'aggressive' };
  return w;
}
function bid(w: World, share: number) {
  const offers = transferOffers(w);
  const index = offers.findIndex((offer) => offer.available && !offer.freeAgent);
  expect(index).toBeGreaterThanOrEqual(0);
  placeBid(w, index, ratio(offers[index].fee, BigInt(share), 100n), false, 'short');
  return w.bids!.at(-1)!;
}
describe('director trait bidding', () => {
  it.each([
    [undefined, 100],
    ['negotiator', 80],
    ['closer', 110],
  ] as const)('opens %s at %s percent and adds ten points for aggression', (trait, share) => {
    const w = world(trait);
    w.direction = {};
    expect(staffBidShare(w)).toBe(share);
    w.direction!.finance = 'aggressive';
    expect(staffBidShare(w)).toBe(share + 10);
  });
  it('registers closer in the same director trait pool and keeps a volunteer neutral', () => {
    expect(STAFF_INFO.director.traits).toEqual(['negotiator', 'closer']);
    expect(STAFF_TRAIT_INFO.closer.label).toBe('속전속결');
    const w = world();
    w.direction = {};
    w.staff!.find((s) => s.role === 'director')!.wage = '0';
    expect(staffBidShare(w)).toBe(100);
  });
  it('raises 80→85→…→100 the next day outside weekly looks, then moves on', () => {
    const w = world('negotiator');
    w.direction = {};
    let last = bid(w, 80);
    const id = last.playerId;
    for (const share of [85, 90, 95, 100]) {
      last.status = 'rejected';
      w.calendar!.day = last.due + 1;
      staffSignings(w);
      const next = w.bids!.at(-1)!;
      expect(next.playerId).toBe(id);
      expect(next.fee).toBe(ratio(next.offer!.fee, BigInt(share), 100n));
      last = next;
    }
    last.status = 'rejected';
    w.calendar!.day = last.due + 1;
    const count = w.bids!.length;
    staffSignings(w);
    expect(w.bids!.slice(count).every((b) => b.playerId !== id)).toBe(true);
  });
  it('jumps to the ceiling in the final seven days', () => {
    const w = world('negotiator');
    w.direction = {};
    const first = bid(w, 80);
    first.status = 'rejected';
    w.calendar!.day = transferWindowDays(w.year).winterClose - 6;
    staffSignings(w);
    expect(w.bids!.at(-1)!.fee).toBe(ratio(w.bids!.at(-1)!.offer!.fee, 100n, 100n));
  });
  it.each([undefined, 'closer', 'negotiator'] as const)(
    'answers a %s counter with money checks and a late negotiator accepts',
    (trait) => {
      const w = world(trait);
      const first = bid(w, trait === 'negotiator' ? 90 : trait === 'closer' ? 120 : 110);
      first.status = 'countered';
      first.counterFee = ratio(first.offer!.fee, 120n, 100n);
      if (trait === 'negotiator') w.calendar!.day = transferWindowDays(w.year).winterClose - 6;
      handoverRecruitment(w, true);
      expect(first.status).toBe('completed');
      expect(w.players.some((p) => p.id === first.playerId)).toBe(true);
    },
  );
  it('declines a negotiator counter below the ceiling and raises next day', () => {
    const w = world('negotiator');
    w.direction = {};
    const first = bid(w, 80);
    first.status = 'countered';
    first.counterFee = ratio(first.offer!.fee, 120n, 100n);
    handoverRecruitment(w, true);
    expect(first.status).toBe('rejected');
    w.calendar!.day = first.due + 1;
    staffSignings(w);
    expect(w.bids!.at(-1)!.playerId).toBe(first.playerId);
  });
  it('ends pursuit if a raise fails money checks and leaves owner fees untouched', () => {
    const w = world('negotiator');
    const first = bid(w, 90);
    first.status = 'rejected';
    w.calendar!.day = first.due + 1;
    w.cash = '0';
    staffSignings(w);
    expect(first.status).toBe('expired');
    expect(w.bids!.filter((b) => b.playerId === first.playerId)).toHaveLength(1);
    const owner = world('closer'),
      offers = transferOffers(owner),
      index = offers.findIndex((o) => o.available && !o.freeAgent);
    const fee = ratio(offers[index].fee, 80n, 100n);
    placeBid(owner, index, fee);
    expect(owner.bids!.at(-1)).toMatchObject({ fee });
    expect(owner.bids!.at(-1)!.staff).toBeUndefined();
  });
});
