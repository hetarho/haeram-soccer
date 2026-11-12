import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import { careerWorld } from './career.testkit';
import { operate } from './operations';
import { operatingCosts } from './finance';
import { policyOf, POLICY_DEFAULTS } from './policy';
import { academyPotentialBonus } from './academy';
import { delegatePlan } from './delegation';
import { holdTemperament } from './delegation.testkit';
import { managerMatches, bestFreeAgent } from './managerMarket';
import { appointDelegatedManager } from './ops-staff';
import { dailyStaff, seasonStaff } from './staff';
import { staffTalkVerdict } from './contracts';
import { signingVerdict } from './signings';
import { transferOffers } from './scout-search';
import { facilityInvestmentPreview } from './investment';
import { progressFacilityWorks, trainingGroundTerms } from './facilities';

function world() {
  const w = careerWorld({ seed: 'owner-office-instructions' });
  w.cash = '999999999999999';
  return w;
}

describe('owner office instructions and investment', () => {
  it("stores each duty's request without changing a signed contract", () => {
    const w = world(),
      wage = w.manager.wage;
    operate(w, { type: 'delegation-request', responsibility: 'manager', level: 5 });
    operate(w, { type: 'delegation-request', responsibility: 'staff', level: 1 });
    expect(w.delegationRequests).toEqual({ manager: 5, staff: 1 });
    expect(w.manager.wage).toBe(wage);
    expect(validateWorld(structuredClone(w)).delegationRequests).toEqual(w.delegationRequests);
    // 적당히 is the default and is not stored.
    operate(w, { type: 'delegation-request', responsibility: 'manager', level: 3 });
    expect(w.delegationRequests).toEqual({ staff: 1 });
    expect(() =>
      operate(w, { type: 'delegation-request', responsibility: 'sponsors' as never, level: 3 }),
    ).toThrow();
  });

  it("never lets the fallback manager search spend below the 단장's cutoff", () => {
    const w = world();
    w.cash = '0';
    const manager = w.manager.id;
    expect(managerMatches(w)).toEqual([]);
    expect(bestFreeAgent(w)).toBeUndefined();
    expect(appointDelegatedManager(w)).toBeUndefined();
    expect(w.cash).toBe('0');
    expect(w.manager.id).toBe(manager);
  });

  it('keeps a paid coach until expiry, then uses a volunteer when renewing would break the cutoff', () => {
    const w = world();
    operate(w, { type: 'hire-staff', role: 'attack', candidate: 1, term: 1 });
    const coach = w.staff!.find((person) => person.role === 'attack')!;
    expect(BigInt(coach.wage)).toBeGreaterThan(0n);
    w.cash = '0';
    w.settings!.responsibilities.staff = 'delegated';
    dailyStaff(w);
    expect(w.staff!.find((person) => person.role === 'attack')!.id).toBe(coach.id);
    w.year++;
    seasonStaff(w);
    expect(w.staff!.find((person) => person.role === 'attack')!.wage).toBe('0');
  });

  it("bounds a delegated signing by what is left of the 단장's season budget", () => {
    const w = world();
    w.round = 1;
    w.income = w.cash;
    holdTemperament(w, 'director', 'balanced');
    operate(w, { type: 'delegation-request', responsibility: 'recruitment', level: 1 });
    const offer = transferOffers(w)[0],
      fee = (BigInt(delegatePlan(w, 'recruitment').left) + 1n).toString();
    expect(signingVerdict(w, offer.player, fee)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('영입에 쓸 돈'),
    });
    operate(w, { type: 'delegation-request', responsibility: 'recruitment', level: 5 });
    expect(signingVerdict(w, offer.player, fee)).toMatchObject({ ok: true });
    // A renewal is not bounded by the signing budget.
    const player = w.players.find((person) => person.status === 'active')!;
    player.talk = { kind: 'renew', demand: '1', floor: '1', year: w.year, day: 0 };
    expect(staffTalkVerdict(w, player)).toMatchObject({ accept: true });
  });

  it('discards a retired grassroots value from old saves, costs and intake potential', () => {
    const plain = world(),
      legacy = structuredClone(plain);
    legacy.policy = Object.assign({ ...POLICY_DEFAULTS }, { grassroots: 5 });
    expect(policyOf(legacy)).not.toHaveProperty('grassroots');
    expect(operatingCosts(legacy)).toEqual(operatingCosts(plain));
    expect(academyPotentialBonus(legacy)).toBe(academyPotentialBonus(plain));
    expect(validateWorld(legacy).policy).not.toHaveProperty('grassroots');
  });

  it('charges construction once and applies the new facility effects only on completion', () => {
    const w = world(),
      quote = facilityInvestmentPreview(w, 'training'),
      cash = BigInt(w.cash);
    operate(w, { type: 'facility-upgrade', part: 'training', from: 0, cost: quote.cost });
    expect(BigInt(w.cash)).toBe(cash - BigInt(quote.cost));
    expect(trainingGroundTerms(w).growth).toBe(1);
    expect(() =>
      operate(w, { type: 'facility-upgrade', part: 'training', from: 0, cost: quote.cost }),
    ).toThrow('진행 중');
    expect(BigInt(w.cash)).toBe(cash - BigInt(quote.cost));
    w.calendar = { day: 90 };
    progressFacilityWorks(w);
    expect(trainingGroundTerms(w)).toMatchObject({ growth: 1.06, recoveryBonus: 1, goodwill: 1 });
    expect(facilityInvestmentPreview(w, 'training').partMaintenanceBefore).toBe(
      quote.partMaintenanceAfter,
    );
  });
});
