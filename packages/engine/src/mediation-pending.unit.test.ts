import { describe, expect, it, vi, onTestFinished } from 'vitest';
import type { SigningRequest, TransferBid } from '../../contracts/src/types';
import { message } from '../../contracts/src/messages';
import * as personalTerms from './personal-terms';
import { respondBid } from './transfers';
import { mediationPreview } from './mediation';
import { canonical } from '../../contracts/src/index';
import { marketCandidate, worldMarketFixture } from './world-market.testkit';
import { basicStaff } from './staff';
import { staffAuthority, holdRows } from './testing';
import { currentDay } from './calendar';
import { transferOffers } from './scout-search';
import {
  detectMediations,
  delegatedMediations,
  requestMet,
  resolveDelegatedMediations,
} from './mediation';
import { recruitmentProjection } from './signings';

function fixture() {
  const w = worldMarketFixture();
  w.calendar = { day: 0 };
  w.staff = basicStaff(w);
  w.settings = staffAuthority(4);
  w.squads = {};
  w.clubs[1]!.country = 'ENG';
  const p = marketCandidate(w, w.clubs[1]!, 'CM');
  // A failed first target leaves a real alternative for financial mediation.
  marketCandidate(w, w.clubs[1]!, 'CM', 23);
  const offer = transferOffers(w).find((o) => o.player.id === p.id)!;
  expect(offer).toBeDefined();
  const request: SigningRequest = { kind: 'short', line: 'MF', pick: p.id };
  w.shortlist = {
    year: w.year,
    day: 0,
    entries: [{ playerId: p.id, line: 'MF' }],
    requests: [request],
  };
  const bid: TransferBid = {
    id: 'covering-bid',
    direction: 'out',
    playerId: p.id,
    club: w.clubs[1]!.id,
    fee: '1',
    year: w.year,
    day: currentDay(w),
    due: 3,
    status: 'pending',
    offer,
  };
  w.cash = '0';
  return { w, bid, request };
}

describe('mediation reads the ordinary pending-squad projection (→CLUB-33/34/36)', () => {
  it.each(['pending', 'countered'] as const)(
    'an owner’s %s bid covers the request until it fails',
    (status) => {
      const { w, bid, request } = fixture();
      bid.status = status;
      w.bids = [bid];
      const before = canonical(w);
      expect(requestMet(w, request, { year: w.year, day: 0 })).toBe(true);
      expect(detectMediations(w)).toEqual([]);
      expect(w.bids).toEqual([bid]);
      expect(w.recruitmentArrivals).toBeUndefined();
      expect(canonical(w)).toBe(before);
      bid.status = 'rejected';
      expect(requestMet(w, request, { year: w.year, day: 0 })).toBe(false);
      expect(detectMediations(w)).toHaveLength(1);
    },
  );

  it('counts only fitting positions and a negotiator’s actual outstanding haggle', () => {
    const { w, bid } = fixture();
    const request: SigningRequest = { kind: 'upgrade', line: 'MF', slot: 6, position: 'CM' };
    w.bids = [bid];
    const from = { year: w.year, day: 0 };
    expect(requestMet(w, request, from)).toBe(true);
    expect(requestMet(w, { ...request, position: 'GK' }, from)).toBe(false);
    w.staff = w.staff!.map((s) => (s.role === 'director' ? { ...s, trait: 'negotiator' } : s));
    bid.staff = 'upgrade';
    bid.status = 'rejected';
    expect(recruitmentProjection(w).arriving).toHaveLength(1);
    expect(requestMet(w, request, from)).toBe(true);
    bid.refusedBy = 'player';
    expect(requestMet(w, request, from)).toBe(false);
  });

  it('leaves an existing delegated mediation pending without a second bid or promise while covered', () => {
    const { w, bid, request } = fixture();
    expect(detectMediations(w)).toHaveLength(1);
    w.bids = [bid];
    w.cash = w.income = '999999999999';
    holdRows(w, { direction: { recruitmentSupport: 'manager' } });
    expect(requestMet(w, request, { year: w.year, day: 0 })).toBe(true);
    expect(delegatedMediations(w)).toEqual([]);
    const before = canonical(w);
    expect(resolveDelegatedMediations(w)).toBe(0);
    expect(canonical(w)).toBe(before);
    expect(w.bids).toHaveLength(1);
    expect(w.promises).toBeUndefined();
    bid.status = 'rejected';
    expect(delegatedMediations(w)).toHaveLength(1);
  });
  it('rechecks the second queued row after the first places a bid covering both requests', () => {
    const { w, request } = fixture();
    w.shortlist!.requests.push({
      kind: 'upgrade',
      line: 'MF',
      position: 'CM',
      slot: 6,
      pick: request.pick,
    });
    expect(detectMediations(w)).toHaveLength(2);
    w.cash = w.income = '999999999999';
    holdRows(w, { direction: { recruitmentSupport: 'manager' } });
    expect(resolveDelegatedMediations(w)).toBe(1);
    expect(w.bids).toHaveLength(1);
    expect(w.mediations!.map((m) => m.status)).toEqual(['resolved', 'pending']);
    expect(w.promises).toBeUndefined();
    expect(w.recruitmentArrivals).toBeUndefined();
    expect(resolveDelegatedMediations(w)).toBe(0);
  });

  it('closes a parked mediation after its covering counter succeeds, without a second bid or promise', () => {
    const { w, bid } = fixture();
    const [mediation] = detectMediations(w);
    w.cash = w.income = '999999999999';
    w.bids = [{ ...bid, status: 'countered', counterFee: '1' }];
    const trust = w.manager.trust;
    expect(resolveDelegatedMediations(w)).toBe(0);
    const answer = vi
      .spyOn(personalTerms, 'termsAnswer')
      .mockReturnValue({ accept: true, chance: 1, logOdds: 9, lines: [] });
    onTestFinished(() => answer.mockRestore());
    respondBid(w, bid.id, true);
    expect(w.bids![0]!.status).toBe('completed');
    expect(w.recruitmentArrivals).toHaveLength(1);
    expect(resolveDelegatedMediations(w)).toBe(1);
    expect(w.mediations![0]!.resolution).toMatchObject({
      result: message('mediation.request.arrived'),
    });
    expect(w.mediations![0]!.resolution!.promise).toBeUndefined();
    expect(
      w.inbox!.some(
        (i) => i.ref === mediation!.id && i.detail === message('mediation.request.arrived'),
      ),
    ).toBe(true);
    expect(w.bids).toHaveLength(1);
    expect(w.promises).toBeUndefined();
    expect(w.manager.trust).toBe(trust);
    const settled = canonical(w);
    expect(resolveDelegatedMediations(w)).toBe(0);
    expect(canonical(w)).toBe(settled);
  });

  it('counts an earlier current-window bid but keeps arrivals bounded by creation; owner previews stay explicit', () => {
    const { w, bid, request } = fixture();
    const [mediation] = detectMediations(w);
    w.calendar!.day = 1;
    mediation!.created.day = 1;
    w.bids = [bid];
    expect(requestMet(w, request, mediation!.created)).toBe(true);
    w.cash = w.income = '999999999999';
    expect(mediationPreview(w, mediation!.id, 'director').result).not.toBe(
      message('mediation.request.arrived'),
    );
    bid.status = 'rejected';
    w.recruitmentArrivals = [
      {
        player: bid.playerId,
        name: bid.offer!.player.name,
        at: { year: w.year, day: 0 },
        position: 'CM',
        positions: { CM: 3 },
      },
    ];
    expect(requestMet(w, request, mediation!.created)).toBe(false);
  });
});
