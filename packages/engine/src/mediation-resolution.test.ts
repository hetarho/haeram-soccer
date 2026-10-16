import { describe, it, expect } from 'vitest';
import { createWorld, transferOffers } from './index';
import { detectMediations, resolveMediation, resolveDelegatedMediations } from './mediation';
import { lineOf } from './player';
import { requestCandidates, signingVerdict } from './signings';
import { canonical, validateWorld } from '../../contracts/src/index';
function fixture() {
  const w = createWorld({
    country: 'ENG',
    name: 'Resolve Mediation',
    color: '#224466',
    seed: 'resolution',
    level: 'normal',
  });
  const offers = transferOffers(w)
    .filter((o) => o.available && lineOf(o.player.position) === 'MF')
    .sort((a, b) => (BigInt(a.fee) > BigInt(b.fee) ? -1 : 1));
  const named = offers[0];
  w.shortlist = {
    year: w.year,
    day: 0,
    entries: [{ playerId: named.player.id, line: 'MF' }],
    requests: [{ kind: 'short', line: 'MF', pick: named.player.id }],
  };
  w.cash = '0';
  w.settings!.responsibilities.recruitment = 'direct';
  detectMediations(w);
  return { w, id: w.mediations![0].id, named };
}
function rich(w: ReturnType<typeof createWorld>) {
  w.cash = '999999999999';
  w.income = '999999999999';
  w.round = 23;
}
describe('financial mediation resolution', () => {
  it('director-first defers without a promise or numerical reaction and is idempotent', () => {
    const { w, id } = fixture(),
      trust = w.manager.trust,
      morale = w.morale,
      cash = w.cash;
    resolveMediation(w, id, 'director');
    expect(w.promises).toBeUndefined();
    expect(w.bids).toEqual([]);
    expect(w.manager.trust).toBe(trust);
    expect(w.morale).toBe(morale);
    expect(w.cash).toBe(cash);
    const before = canonical(w);
    resolveMediation(w, id, 'manager');
    expect(canonical(w)).toBe(before);
    validateWorld(w);
  });
  it('balanced pursues the cheapest feasible alternative by a real ordinary move', () => {
    const { w, id, named } = fixture();
    rich(w);
    const pool = requestCandidates(w, w.mediations![0].target)
      .filter(
        ({ offer }) =>
          offer.player.id !== named.player.id &&
          BigInt(offer.fee) < BigInt(named.fee) &&
          signingVerdict(w, offer.player, offer.freeAgent ? '0' : offer.fee).ok,
      )
      .sort((a, b) =>
        BigInt(a.offer.fee) < BigInt(b.offer.fee)
          ? -1
          : BigInt(a.offer.fee) > BigInt(b.offer.fee)
            ? 1
            : BigInt(a.offer.player.wage) < BigInt(b.offer.player.wage)
              ? -1
              : 1,
      );
    expect(pool.length).toBeGreaterThan(0);
    const pick = pool[0].offer;
    resolveMediation(w, id, 'balanced', 'delegated');
    expect(w.mediations![0].resolution!.result).toContain(pick.player.name);
    if (pick.freeAgent)
      expect(w.recruitmentArrivals!.some((a) => a.player === pick.player.id)).toBe(true);
    else
      expect(w.bids!.some((b) => b.playerId === pick.player.id && b.status === 'pending')).toBe(
        true,
      );
    expect(w.promises).toBeUndefined();
  });
  it('manager-first sends a real named bid, never a fictitious completed arrival', () => {
    const { w, id, named } = fixture();
    rich(w);
    resolveMediation(w, id, 'manager', 'delegated');
    expect(w.bids!.find((b) => b.playerId === named.player.id)).toMatchObject({
      status: 'pending',
      staff: 'short',
    });
    expect(w.recruitmentArrivals).toBeUndefined();
    expect(w.promises).toBeUndefined();
  });
  it('unaffordable or missing choices create a fixed real promise and no repeated promise', () => {
    for (const support of ['balanced', 'manager'] as const) {
      const { w, id } = fixture();
      resolveMediation(w, id, support, 'delegated');
      expect(w.promises).toHaveLength(1);
      expect(w.promises![0]).toMatchObject({
        mediation: id,
        status: 'pending',
        target: { line: 'MF' },
      });
      const before = canonical(w);
      resolveMediation(w, id, support, 'delegated');
      expect(canonical(w)).toBe(before);
      validateWorld(w);
    }
    const { w, id, named } = fixture();
    rich(w);
    w.bids = [
      {
        id: 'already-tried',
        direction: 'out',
        playerId: named.player.id,
        fee: named.fee,
        year: w.year,
        day: 0,
        due: 1,
        status: 'rejected',
      },
    ];
    resolveMediation(w, id, 'manager', 'delegated');
    expect(w.promises).toHaveLength(1);
  });
  it('uses standing policy for delegation and keeps a direct case override separate, respecting owner versus staff finance permission', () => {
    const delegated = fixture();
    delegated.w.direction = { recruitmentSupport: 'director' };
    delegated.w.settings!.responsibilities.recruitment = 'delegated';
    resolveDelegatedMediations(delegated.w);
    expect(delegated.w.mediations![0].resolution!.support).toBe('director');
    const { w, id, named } = fixture();
    w.direction = { recruitmentSupport: 'director' };
    w.cash = (BigInt(named.fee) + 1n).toString();
    expect(signingVerdict(w, named.player, named.fee).ok).toBe(false);
    resolveMediation(w, id, 'manager', 'owner');
    expect(w.bids!.some((b) => b.playerId === named.player.id)).toBe(true);
    expect(w.direction.recruitmentSupport).toBe('director');
    expect(w.cash).toBe((BigInt(named.fee) + 1n).toString());
  });
  it('does not invent a named manager request from an unpicked suitable candidate', () => {
    const { w } = fixture();
    w.mediations = [];
    delete w.shortlist!.requests[0].pick;
    detectMediations(w);
    const record = w.mediations![0];
    expect(record.managerReason).toContain('현재 적합 후보');
    rich(w);
    resolveMediation(w, record.id, 'manager', 'owner');
    expect(w.promises).toHaveLength(1);
    expect(w.bids).toEqual([]);
  });
  it('retains weekly exclusivity, squad caps and financial limits instead of spending twice', () => {
    const { w, id } = fixture();
    rich(w);
    w.bids = [
      {
        id: 'staff-open',
        direction: 'out',
        playerId: 'other',
        fee: '1',
        year: w.year,
        day: 0,
        due: 2,
        status: 'pending',
        staff: 'short',
      },
    ];
    resolveMediation(w, id, 'manager', 'delegated');
    expect(w.bids).toHaveLength(1);
    expect(w.promises).toHaveLength(1);
  });
});
