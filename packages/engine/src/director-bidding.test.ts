import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { staffAuthority } from './testing';
import type { StaffTrait, TransferBid, World } from '../../contracts/src/types';
import {
  basicStaff,
  transferOffers,
  placeBid,
  staffSignings,
  ratio,
  handoverRecruitment,
  transferWindowDays,
} from './index';
import { staffBidShare } from './director-bidding';
import * as signings from './signings';
import { spendingStance } from './delegation';
import { detectMediations } from './mediation';
import { lineOf } from './player';
import { message } from '../../contracts/src/messages';
import { STAFF_INFO, STAFF_TRAIT_INFO } from './staff';
import { careerWorld } from './career.testkit';
import { holdTemperament } from './delegation.testkit';
import { bidOutlook } from './transfers';
import { termsChance, termsContext } from './personal-terms';
import type { WorldMarketTarget } from '../../contracts/src/types';
import * as personalTerms from './personal-terms';
/**
 * Every candidate is keen on our terms (→CLUB-53): these cases test the 단장's move, not the
 * player's answer, so his chance is certain at his demand and he always agrees.
 */
function willing() {
  const certain = { chance: 1, logOdds: 9, lines: [] };
  const chance = vi.spyOn(personalTerms, 'termsChance').mockReturnValue(certain),
    answer = vi.spyOn(personalTerms, 'termsAnswer').mockReturnValue({ ...certain, accept: true });
  onTestFinished(() => {
    chance.mockRestore();
    answer.mockRestore();
  });
}
function world(trait?: StaffTrait) {
  const w = careerWorld({ seed: 'director-bids' });
  w.settings = staffAuthority(4);
  w.staff ??= basicStaff(w);
  const director = w.staff.find((s) => s.role === 'director')!;
  delete director.trait;
  if (trait) director.trait = trait;
  w.cash = w.income = '999999999999';
  w.round = 23;
  w.calendar = { day: transferWindowDays(w.year).winterOpen };
  holdTemperament(w, 'director', 'balanced');
  w.delegationRequests = { recruitment: 5 };
  return w;
}
function bid(w: World, share: number, index = firstClubOffer(w)) {
  const offers = transferOffers(w);
  expect(index).toBeGreaterThanOrEqual(0);
  placeBid(w, index, ratio(offers[index].fee, BigInt(share), 100n), false, 'short');
  return w.bids!.at(-1)!;
}
const firstClubOffer = (w: World) =>
  transferOffers(w).findIndex((offer) => offer.available && !offer.freeAgent);
/** The scout's club candidate likeliest to accept our terms at the 100% step (→CLUB-53). */
function keenest(w: World) {
  let best = -1,
    chance = -1;
  transferOffers(w).forEach((offer, i) => {
    if (!offer.available || offer.source.kind !== 'club') return;
    const context = termsContext(w, {
      playerId: offer.player.id,
      clubId: offer.source.club,
      step: 1,
    });
    const read = context ? termsChance(context).chance : 0;
    if (read > chance) [best, chance] = [i, read];
  });
  return best;
}
/** A club candidate as a stable market target, with his selling club. */
function target(w: World, index: number): WorldMarketTarget {
  const offer = transferOffers(w)[index]!;
  if (offer.source.kind !== 'club') throw new Error('a club candidate');
  return { world: w.id, kind: 'club', clubId: offer.source.club, playerId: offer.player.id };
}
describe('director trait bidding', () => {
  it.each([
    [undefined, 100],
    ['negotiator', 80],
    ['closer', 110],
  ] as const)('opens %s at %s percent and adds ten points for aggression', (trait, share) => {
    const w = world(trait);
    delete w.delegationRequests;
    expect(staffBidShare(w)).toBe(share);
    w.delegationRequests = { recruitment: 5 };
    expect(staffBidShare(w)).toBe(share + 10);
  });
  it('registers closer in the same director trait pool and keeps a volunteer neutral', () => {
    expect(STAFF_INFO.director.traits).toEqual(['negotiator', 'closer']);
    expect(STAFF_TRAIT_INFO.closer.label).toBe('속전속결');
    const w = world();
    delete w.delegationRequests;
    w.staff!.find((s) => s.role === 'director')!.wage = '0';
    expect(staffBidShare(w)).toBe(100);
  });
  it('raises 80→85→…→100 the next day outside weekly looks, then moves on', () => {
    willing();
    const w = world('negotiator');
    delete w.delegationRequests;
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
  it('raises every bid refused on the same day before any other move', () => {
    willing();
    // 균형형 at 아낌없이 keeps up to three bids pending (→CLUB-33): two refused the same day are
    // both raised the day after, ahead of the look's ordinary moves (→CLUB-41).
    const w = world('negotiator'),
      offers = transferOffers(w),
      club = offers.flatMap((offer, i) => (offer.available && !offer.freeAgent ? [i] : []));
    expect(club.length).toBeGreaterThanOrEqual(2);
    const first = bid(w, 90, club[0]),
      second = bid(w, 90, club[1]);
    first.status = second.status = 'rejected';
    const count = w.bids!.length;
    w.calendar!.day = Math.max(first.due, second.due) + 1;
    staffSignings(w);
    const raised = w.bids!.slice(count, count + 2);
    expect(raised.map((b) => b.playerId)).toEqual([first.playerId, second.playerId]);
    for (const next of raised) expect(next.fee).toBe(ratio(next.offer!.fee, 95n, 100n));
  });
  it('keeps the places of bids refused on a look day for their raises the next day', () => {
    willing();
    // 균형형 at 아낌없이 keeps three places (→CLUB-33). Two bids refused on a look day hold theirs,
    // so that look's ordinary moves take only the third, and both are raised the day after the
    // answer (→CLUB-41), not crowded out until another place frees.
    const w = world('negotiator'),
      look = w.calendar!.day + signings.SIGNING_CONFIG.lookDays,
      club = transferOffers(w).flatMap((offer, i) =>
        offer.available && !offer.freeAgent ? [i] : [],
      );
    expect(signings.pendingLimit(w)).toBe(3);
    const first = bid(w, 90, club[0]),
      second = bid(w, 90, club[1]);
    for (const refused of [first, second])
      Object.assign(refused, { status: 'rejected', refusedBy: 'club', due: look });
    const open = () =>
      w.bids!.filter((b) => b.staff && (b.status === 'pending' || b.status === 'countered'));
    w.calendar!.day = look;
    staffSignings(w);
    expect(open()).toHaveLength(1);
    const ordinary = open()[0]!.playerId,
      count = w.bids!.length;
    w.calendar!.day = look + 1;
    staffSignings(w);
    const raised = w.bids!.slice(count);
    expect(raised.map((b) => b.playerId)).toEqual([first.playerId, second.playerId]);
    for (const next of raised) expect(next.fee).toBe(ratio(next.offer!.fee, 95n, 100n));
    expect(open().map((b) => b.playerId)).toEqual([ordinary, first.playerId, second.playerId]);
  });
  it("raises a due haggle before a pending mediation's move can spend its money", () => {
    willing();
    // 균형형 at 아낌없이 with a midfield mediation pending since the opening (→CLUB-39). On the look
    // day the raise the day after the answer comes first (→CLUB-41): the cash pays for it or for the
    // mediation's cheaper midfielder, not both, so the mediation ends in a promise.
    const w = world('negotiator'),
      look = w.calendar!.day + signings.SIGNING_CONFIG.lookDays,
      offers = transferOffers(w),
      haggled = offers.findIndex(
        (offer) => offer.available && !offer.freeAgent && lineOf(offer.player.position) !== 'MF',
      ),
      pick = offers
        .filter((offer) => offer.available && lineOf(offer.player.position) === 'MF')
        .sort((a, b) => (BigInt(a.fee) > BigInt(b.fee) ? -1 : 1))[0]!;
    const first = bid(w, 90, haggled);
    Object.assign(first, { status: 'rejected', refusedBy: 'club', due: look - 1 });
    w.shortlist = {
      ...w.shortlist!,
      entries: [{ playerId: pick.player.id, line: 'MF' }],
      requests: [{ kind: 'short', line: 'MF', pick: pick.player.id }],
    };
    w.cash = '0';
    detectMediations(w);
    expect(w.mediations).toEqual([expect.objectContaining({ status: 'pending' })]);
    w.cash = '720000'; // T977 raises both commitments and their fee quotes at the same wage level.
    w.calendar!.day = look;
    // Without the haggle the same cash buys the mediation's midfielder.
    const alone = structuredClone(w);
    alone.bids!.find((b) => b.id === first.id)!.status = 'expired';
    staffSignings(alone);
    expect(alone.bids!.filter((b) => b.staff && b.day === look)).toHaveLength(1);
    expect(alone.mediations![0].resolution?.promise).toBeUndefined();
    staffSignings(w);
    const today = w.bids!.filter((b) => b.staff && b.day === look);
    expect(today).toEqual([
      expect.objectContaining({ playerId: first.playerId, status: 'pending' }),
    ]);
    expect(today[0]!.fee).toBe(ratio(today[0]!.offer!.fee, 95n, 100n));
    expect(w.mediations![0]).toMatchObject({
      status: 'resolved',
      resolution: { promise: expect.any(String) },
    });
  });
  /**
   * At 아낌없이 the window takes `cap` upgrades (→CLUB-33): `cap` − 1 signed on the opening day and
   * one upgrade bid of his refused with its answer on `answered`, a haggle he raises the day after
   * (→CLUB-41). `upgrades` reads the window's signed and open upgrades.
   */
  function oneUpgradeLeft(w: World, answered: number) {
    const opening = w.calendar!.day,
      stance = spendingStance(w, 'recruitment').signing,
      cap = signings.upgradeCap(
        stance,
        signings.slotsBelowBar(w, stance.margin!, signings.windowBar(w, opening), opening),
      );
    for (let i = 0; i < cap - 1; i++)
      w.bids = [
        ...(w.bids || []),
        {
          id: `out:test:upgrade:${i}`,
          direction: 'out',
          playerId: `test:upgrade:${i}`,
          fee: '1',
          year: w.year,
          day: opening,
          due: opening,
          status: 'completed',
          staff: 'upgrade',
        },
      ];
    const held = bid(w, 90);
    Object.assign(held, { staff: 'upgrade', status: 'rejected', refusedBy: 'club', due: answered });
    const upgrades = () =>
      w.bids!.filter(
        (b) => b.staff === 'upgrade' && ['completed', 'pending', 'countered'].includes(b.status),
      );
    return { cap, held, upgrades };
  }
  it('counts a held upgrade haggle against the window cap, so its raise never passes it', () => {
    willing();
    // With one upgrade left and an upgrade bid refused on the look day, that look opens no other
    // upgrade, and the haggle's raise the next day makes the cap, never one more.
    const w = world('negotiator'),
      look = w.calendar!.day + signings.SIGNING_CONFIG.lookDays,
      { cap, held, upgrades } = oneUpgradeLeft(w, look);
    w.calendar!.day = look;
    staffSignings(w);
    expect(w.bids!.filter((b) => b.day === look && b.staff === 'upgrade')).toEqual([]);
    w.calendar!.day = look + 1;
    staffSignings(w);
    expect(w.bids!.filter((b) => b.day === look + 1)).toEqual([
      expect.objectContaining({ playerId: held.playerId, staff: 'upgrade', status: 'pending' }),
    ]);
    expect(upgrades()).toHaveLength(cap);
  });
  it("puts a mediation's upgrade through the same cap check after a raise fills it", () => {
    willing();
    // With one upgrade left, a haggle answered the day before the look and an upgrade mediation
    // pending since the opening (→CLUB-39): the raise comes first and makes the cap (→CLUB-41), and
    // the mediation's pursuit meets the cap a look meets (→CLUB-33), ending in a promise.
    const w = world('negotiator'),
      look = w.calendar!.day + signings.SIGNING_CONFIG.lookDays,
      request = w.shortlist?.requests.find((one) => one.kind === 'upgrade');
    expect(request).toBeDefined();
    w.shortlist = { ...w.shortlist!, requests: [request!] };
    const { cap, held, upgrades } = oneUpgradeLeft(w, look - 1),
      cash = w.cash;
    w.cash = '0';
    detectMediations(w);
    expect(w.mediations).toEqual([expect.objectContaining({ status: 'pending', target: request })]);
    w.cash = cash;
    w.calendar!.day = look;
    staffSignings(w);
    expect(w.bids!.filter((b) => b.day === look)).toEqual([
      expect.objectContaining({ playerId: held.playerId, staff: 'upgrade', status: 'pending' }),
    ]);
    expect(upgrades()).toHaveLength(cap);
    expect(w.mediations![0]).toMatchObject({
      status: 'resolved',
      resolution: {
        promise: expect.any(String),
        result: expect.stringContaining(message('delegation.verdict.upgradeCap', { cap })),
      },
    });
  });
  it('ends an upgrade haggle when the cap has no room left for its raise', () => {
    willing();
    // The same check bars a raise: with the cap already full of signed upgrades (a cap read lower
    // since the bid), the haggle ends the day after the answer, naming the cap (→CLUB-33, CLUB-41).
    const w = world('negotiator'),
      look = w.calendar!.day + signings.SIGNING_CONFIG.lookDays,
      { cap, held, upgrades } = oneUpgradeLeft(w, look - 1);
    w.bids!.push({ ...upgrades()[0]!, id: 'out:test:upgrade:full', playerId: 'test:upgrade:full' });
    w.calendar!.day = look;
    staffSignings(w);
    expect(w.bids!.filter((b) => b.playerId === held.playerId)).toEqual([
      expect.objectContaining({ status: 'expired' }),
    ]);
    expect(upgrades()).toHaveLength(cap);
    const ended = message('copy.signings.e773f7135a', { p0: held.offer!.player.name });
    expect(w.inbox!.find((item) => item.title === ended)?.detail).toContain(
      message('delegation.verdict.upgradeCap', { cap }),
    );
  });
  it('jumps to the ceiling in the final seven days', () => {
    const w = world('negotiator');
    delete w.delegationRequests;
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
      // He takes the counter; the player then answers his terms (→CLUB-53): he signs, or he alone
      // refuses — a declined counter would end it with no refusal of his.
      const answered: TransferBid = first;
      if (answered.status === 'completed')
        expect(w.players.some((p) => p.id === first.playerId)).toBe(true);
      else {
        expect(first).toMatchObject({ status: 'rejected', refusedBy: 'player' });
        expect(w.inbox!.find((item) => item.ref === first.id)?.title).toContain('개인 조건 거절');
      }
    },
  );
  it('declines a negotiator counter below the ceiling and raises next day', () => {
    willing();
    const w = world('negotiator');
    delete w.delegationRequests;
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

describe('the selling club answers the 단장 and the owner (→CLUB-52)', () => {
  /** A bid answered at once: placed on the window's last day. */
  function deadline(trait?: StaffTrait) {
    const w = world(trait);
    delete w.delegationRequests;
    w.calendar = { day: transferWindowDays(w.year).winterClose };
    return w;
  }
  const percentOf = (w: World, index: number, percent: number) =>
    ratio(transferOffers(w)[index]!.fee, BigInt(percent), 100n);

  it('always accepts a bid at the asking fee, whatever its draw', () => {
    const w = deadline(),
      index = keenest(w),
      asking = transferOffers(w)[index]!.fee;
    expect(bidOutlook(w, target(w, index), asking)).toMatchObject({ chance: 1, counter: 0 });
    const answered = bid(w, 100, index);
    expect(answered.status).not.toBe('countered');
    expect(answered.refusedBy).not.toBe('club');
    expect(['completed', 'rejected']).toContain(answered.status);
  });

  it('counters at its reservation, between the bid and the asking fee', () => {
    const w = deadline(),
      index = keenest(w),
      asking = BigInt(transferOffers(w)[index]!.fee);
    // A fee the outlook says is surely countered: below every reservation the draw can set.
    const percent = [95, 90, 85, 80, 75, 70, 65, 60].find(
      (p) => bidOutlook(w, target(w, index), percentOf(w, index, p)).counter === 1,
    );
    expect(percent).toBeDefined();
    const fee = percentOf(w, index, percent!);
    placeBid(w, target(w, index), fee);
    const answered = w.bids!.at(-1)!;
    expect(answered.status).toBe('countered');
    expect(BigInt(answered.counterFee!)).toBeGreaterThan(BigInt(fee));
    expect(BigInt(answered.counterFee!)).toBeLessThanOrEqual(asking);
    expect(w.inbox!.find((item) => item.ref === answered.id)?.detail).toContain('구단이 버틴 선');
  });

  it('refuses a low bid outright, naming the factors, and consumes no draw to say so', () => {
    const w = deadline(),
      index = keenest(w),
      fee = percentOf(w, index, 10);
    const before = JSON.stringify(w);
    expect(bidOutlook(w, target(w, index), fee)).toMatchObject({ chance: 0, counter: 0 });
    expect(JSON.stringify(w)).toBe(before);
    placeBid(w, target(w, index), fee);
    const answered = w.bids!.at(-1)!;
    expect(answered).toMatchObject({ status: 'rejected', refusedBy: 'club' });
    expect(w.players.some((p) => p.id === answered.playerId)).toBe(false);
    expect(w.inbox!.find((item) => item.ref === answered.id)?.detail).toContain('구단이 버틴 선');
  });

  it('lowers the reservation by the 단장’s ability, a negotiator more and a vacancy less', () => {
    const director = (w: World, ability: number, trait?: StaffTrait) => {
      const member = w.staff!.find((s) => s.role === 'director')!;
      member.ability = ability;
      delete member.trait;
      if (trait) member.trait = trait;
      return w;
    };
    const line = (w: World) => {
      const index = firstClubOffer(w);
      return bidOutlook(w, target(w, index), percentOf(w, index, 90)).lines.find(
        (l) => l.factor === 'director',
      )?.delta;
    };
    expect(line(director(deadline(), 50))).toBeUndefined();
    expect(line(director(deadline(), 75))).toBeCloseTo(-0.1, 10);
    expect(line(director(deadline(), 50, 'negotiator'))).toBeCloseTo(-0.05, 10);
    const vacant = deadline();
    vacant.staff = vacant.staff!.filter((s) => s.role !== 'director');
    expect(line(vacant)).toBeCloseTo(0.05, 10);
    // An abler 단장 makes the same fee likelier to be accepted.
    const chance = (w: World) => {
      const index = firstClubOffer(w);
      return bidOutlook(w, target(w, index), percentOf(w, index, 85)).chance;
    };
    expect(chance(director(deadline(), 90))).toBeGreaterThan(chance(director(deadline(), 30)));
  });
});

describe('the 단장’s money checks read the wage his bid offers (→ECON-33, →CLUB-53)', () => {
  afterEach(() => vi.restoreAllMocks());
  /** A window's last day, so a bid is answered at once, with the 단장's plan in force. */
  function deadline() {
    const w = world();
    w.calendar = { day: transferWindowDays(w.year).winterClose };
    return w;
  }
  /** Money checks that pass any wage up to the player's demand and refuse anything above it. */
  function demandOnly(demand: Map<string, bigint>) {
    const real = signings.signingVerdict;
    return vi.spyOn(signings, 'signingVerdict').mockImplementation((w, player, ...rest) => {
      const quoted = demand.get(player.id);
      if (quoted !== undefined && BigInt(player.wage) > quoted)
        return { ok: false as const, reason: 'over the plan' };
      return real(w, player, ...rest);
    });
  }

  it('refuses an accepted bid whose 200% wage the plan cannot carry, signing nobody', () => {
    const w = deadline(),
      index = keenest(w),
      offer = transferOffers(w)[index]!,
      cash = w.cash;
    const verdict = demandOnly(new Map([[offer.player.id, BigInt(offer.player.wage)]]));
    placeBid(w, target(w, index), offer.fee, false, 'short', 2);
    const answered = w.bids!.at(-1)!;
    expect(verdict).toHaveBeenCalled();
    expect(verdict.mock.calls.at(-1)![1].wage).toBe((BigInt(offer.player.wage) * 2n).toString());
    expect(answered.status).toBe('rejected');
    expect(w.players.some((p) => p.id === offer.player.id)).toBe(false);
    expect(w.cash).toBe(cash);
  });

  it('declines a counter whose 150% wage the plan cannot carry, signing nobody', () => {
    const w = deadline(),
      index = keenest(w),
      offer = transferOffers(w)[index]!,
      cash = w.cash;
    const percent = [95, 90, 85, 80, 75, 70, 65, 60].find(
      (p) => bidOutlook(w, target(w, index), ratio(offer.fee, BigInt(p), 100n)).counter === 1,
    );
    expect(percent).toBeDefined();
    const verdict = demandOnly(new Map([[offer.player.id, BigInt(offer.player.wage)]]));
    placeBid(w, target(w, index), ratio(offer.fee, BigInt(percent!), 100n), false, 'short', 1.5);
    const answered = w.bids!.at(-1)!;
    expect(verdict.mock.calls.at(-1)![1].wage).toBe(
      ((BigInt(offer.player.wage) * 15000n) / 10000n).toString(),
    );
    expect(answered.status).not.toBe('completed');
    expect(w.players.some((p) => p.id === offer.player.id)).toBe(false);
    expect(w.cash).toBe(cash);
  });
});
