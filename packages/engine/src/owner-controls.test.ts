import { describe, expect, it } from 'vitest';
import type { PolicyLevel } from '../../contracts/src/types';
import { careerWorld } from './career.testkit';
import { operate } from './operations';
import { policyEffects, policyOf } from './policy';
import { directionOf } from './direction';
import { talkGoodwill } from './contracts';
import { progressFacilityWorks } from './facilities';
import { facilityInvestmentPreview } from './investment';
import { worldMarketOffer } from './world-market';
import { squad } from './world';

function world() {
  const w = careerWorld({ seed: 'owner-controls' });
  w.cash = '999999999999999';
  return w;
}
const goodwillOf = (w: ReturnType<typeof world>) =>
  talkGoodwill(
    w,
    w.players.find((p) => p.status === 'active')!,
  );

describe('owner controls as released (→ECON-16/17/22/25/32, CLUB-26)', () => {
  it('holds each dial, preset, card and row the owner sets, records each change and refuses a bad one', () => {
    const w = world(),
      events = w.events.length;
    operate(w, { type: 'club-policy', key: 'support', level: 5 });
    operate(w, { type: 'club-ticket', price: 0.08 });
    operate(w, { type: 'club-build', slot: 'culture', choice: 'family' });
    operate(w, { type: 'club-direction', key: 'renewal', choice: 'frugal' });
    expect(policyOf(w).support).toBe(5);
    expect(policyEffects(policyOf(w)).goodwill).toBe(15);
    expect(w.ticket).toBe(0.08);
    expect(w.build?.culture).toBe('family');
    expect(directionOf(w, 'renewal')).toBe('frugal');
    expect(w.events.slice(events).map((event) => event.kind)).toEqual([
      'club-policy',
      'club-ticket',
      'club-build',
      'club-direction',
    ]);
    const before = structuredClone(w);
    expect(() =>
      operate(w, { type: 'club-policy', key: 'support', level: 6 as PolicyLevel }),
    ).toThrow();
    expect(() => operate(w, { type: 'club-ticket', price: 0.06 })).toThrow();
    expect(() => operate(w, { type: 'club-build', slot: 'culture', choice: 'nonsense' })).toThrow();
    expect(() =>
      operate(w, { type: 'club-direction', key: 'renewal', choice: 'nonsense' }),
    ).toThrow();
    expect(w).toEqual(before);
    operate(w, { type: 'club-build', slot: 'culture', choice: 'standard' });
    operate(w, { type: 'club-direction', key: 'renewal', choice: 'standard' });
    expect(w.build).not.toHaveProperty('culture');
    expect(w.direction).not.toHaveProperty('renewal');
    // A row a delegated person sets is his: the owner's change is refused and changes nothing.
    w.settings!.responsibilities.contracts = 'delegated';
    const held = structuredClone(w);
    expect(() => operate(w, { type: 'club-direction', key: 'renewal', choice: 'frugal' })).toThrow(
      '위임 중',
    );
    expect(w).toEqual(held);
  });

  it('adds the completed training ground to contract-talk goodwill, +1 to +5% by level', () => {
    const w = world(),
      base = goodwillOf(w);
    expect(base.parts.some((part) => part.label === '훈련장')).toBe(false);
    const added = [1, 2, 3, 4, 5].map((level) => {
      w.trainingGround = level;
      const goodwill = goodwillOf(w);
      return {
        part: goodwill.parts.find((part) => part.label === '훈련장')?.percent,
        total: goodwill.percent - base.percent,
      };
    });
    expect(added).toEqual([1, 2, 3, 4, 5].map((level) => ({ part: level, total: level })));
  });

  it('leaves goodwill unchanged while a training ground work is under way, until it opens', () => {
    const w = world(),
      base = goodwillOf(w).percent,
      quote = facilityInvestmentPreview(w, 'training');
    operate(w, { type: 'facility-upgrade', part: 'training', from: 0, cost: quote.cost });
    expect(goodwillOf(w).percent).toBe(base);
    w.calendar = { day: 90 };
    progressFacilityWorks(w);
    expect(w.trainingGround).toBe(1);
    expect(goodwillOf(w).percent).toBe(base + 1);
  });

  it("keeps a given player's asking fee the same at recruitment levels 1 and 5", () => {
    const w = world(),
      club = w.clubs.find((c) => c.id !== w.playerClub && squad(w, c).length)!,
      player = squad(w, club)[0]!,
      target = { world: w.id, kind: 'club' as const, clubId: club.id, playerId: player.id };
    operate(w, { type: 'club-policy', key: 'recruitment', level: 1 });
    const cautious = worldMarketOffer(w, target)!;
    operate(w, { type: 'club-policy', key: 'recruitment', level: 5 });
    const ready = worldMarketOffer(w, target)!;
    expect(BigInt(cautious.fee)).toBeGreaterThan(0n);
    expect(ready.fee).toBe(cautious.fee);
    expect(ready.loanFee).toBe(cautious.loanFee);
  });
});
