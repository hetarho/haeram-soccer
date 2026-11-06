import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import { careerWorld } from './career.testkit';
import { operate } from './operations';
import { operatingCosts } from './finance';
import { policyOf, POLICY_DEFAULTS } from './policy';
import { academyPotentialBonus } from './academy';
import { financeStance } from './direction';
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
  it('stores independent duty instructions without changing an existing contract or another budget', () => {
    const w = world(),
      wage = w.manager.wage;
    operate(w, { type: 'decision-finance', responsibility: 'manager', choice: 'aggressive' });
    operate(w, { type: 'decision-finance', responsibility: 'staff', choice: 'stable' });
    operate(w, { type: 'decision-wage-limit', responsibility: 'manager', amount: '12345' });
    operate(w, { type: 'decision-wage-limit', responsibility: 'staff', amount: '0' });
    expect(financeStance(w, 'manager').runway).toBe(6);
    expect(financeStance(w, 'staff').runway).toBe(30);
    expect(financeStance(w, 'recruitment').runway).toBe(13);
    expect(w.manager.wage).toBe(wage);
    const loaded = validateWorld(structuredClone(w));
    expect(loaded.decisionBudgets).toEqual(w.decisionBudgets);
    operate(w, { type: 'decision-wage-limit', responsibility: 'manager', amount: null });
    expect(w.decisionBudgets!.manager!.maxAnnualWage).toBeUndefined();
    expect(w.decisionBudgets!.staff!.maxAnnualWage).toBe('0');
  });

  it('never lets the fallback manager search exceed the annual limit', () => {
    const w = world();
    operate(w, { type: 'club-direction', key: 'manager', choice: 'developer' });
    operate(w, { type: 'decision-wage-limit', responsibility: 'manager', amount: '0' });
    const cash = w.cash,
      manager = w.manager.id;
    expect(managerMatches(w)).toEqual([]);
    expect(bestFreeAgent(w)).toBeUndefined();
    expect(appointDelegatedManager(w)).toBeUndefined();
    expect(w.cash).toBe(cash);
    expect(w.manager.id).toBe(manager);
  });

  it('keeps a paid coach until expiry, then uses a volunteer instead of renewing above budget', () => {
    const w = world();
    operate(w, { type: 'hire-staff', role: 'attack', candidate: 1, term: 1 });
    const coach = w.staff!.find((person) => person.role === 'attack')!;
    expect(BigInt(coach.wage)).toBeGreaterThan(0n);
    operate(w, { type: 'decision-wage-limit', responsibility: 'staff', amount: '0' });
    w.settings!.responsibilities.staff = 'delegated';
    dailyStaff(w);
    expect(w.staff!.find((person) => person.role === 'attack')!.id).toBe(coach.id);
    w.year++;
    seasonStaff(w);
    expect(w.staff!.find((person) => person.role === 'attack')!.wage).toBe('0');
  });

  it('applies separate player renewal and recruitment limits even when fees and runway fit', () => {
    const w = world();
    w.round = 1;
    w.income = w.cash;
    const player = w.players.find((person) => person.status === 'active')!;
    player.talk = { kind: 'renew', demand: '1', floor: '1', year: w.year, day: 0 };
    operate(w, { type: 'decision-wage-limit', responsibility: 'contracts', amount: '0' });
    expect(staffTalkVerdict(w, player)).toMatchObject({ accept: false });
    expect(staffTalkVerdict(w, player)).toHaveProperty(
      'reason',
      expect.stringContaining('1인당 연봉 한도'),
    );
    operate(w, { type: 'decision-wage-limit', responsibility: 'contracts', amount: null });
    expect(staffTalkVerdict(w, player)).toMatchObject({ accept: true });
    const offer = transferOffers(w)[0];
    operate(w, { type: 'decision-wage-limit', responsibility: 'recruitment', amount: '0' });
    expect(signingVerdict(w, offer.player, '0')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('1인당 연봉 한도'),
    });
    expect(staffTalkVerdict(w, player)).toMatchObject({ accept: true });
    operate(w, { type: 'decision-wage-limit', responsibility: 'recruitment', amount: null });
    expect(signingVerdict(w, offer.player, '0')).toMatchObject({ ok: true });
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
