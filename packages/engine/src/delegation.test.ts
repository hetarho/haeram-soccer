import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { canonical, validateWorld } from '../../contracts/src/index';
import { careerWorld } from './career.testkit';
import { operatingCosts } from './finance';
import { operate } from './operations';
import { policyEffects, policyOf } from './policy';
import { directionOf } from './direction';
import { affordable } from './staff';
import { signingVerdict } from './signings';
import { staffAuthority } from './testing';
import { settingsOf } from './responsibilities';
import { addEvent } from './events';
import {
  actedLevel,
  delegateOf,
  requestOf,
  settingDelegate,
  temperamentOf,
  type Temperament,
} from './delegation-info';
import { applyDelegatePlans, delegatePlan, spendingStance } from './delegation';
import { holdTemperament, keyWith } from './delegation.testkit';

/** A club whose people all plan, with `cash` in the demo's proportion to its fixed costs. */
function club(seed: string, cashPerFixed: [bigint, bigint] = [200n, 126n]) {
  const w = careerWorld({ seed });
  w.settings = staffAuthority(4);
  const annual = BigInt(operatingCosts(w).annual);
  w.cash = ((annual * cashPerFixed[0]) / cashPerFixed[1]).toString();
  return { w, annual, cash: BigInt(w.cash) };
}
const shareOf = (amount: string, of: bigint) => Number((BigInt(amount) * 10000n) / of) / 10000;

describe('a delegated person turns the request into his own plan', () => {
  it('spends about 20M of 200M asked for the minimum and about 100M asked to spend freely', () => {
    // 200M of cash against 126M of yearly fixed costs, as the demo club holds.
    const { w, annual, cash } = club('delegation-200');
    holdTemperament(w, 'director', 'balanced');
    const little = delegatePlan(w, 'recruitment', 1),
      lot = delegatePlan(w, 'recruitment', 5);
    expect(shareOf(little.budget, cash)).toBeCloseTo(0.1, 2);
    expect(shareOf(lot.budget, cash)).toBeCloseTo(0.5, 2);
    expect([little.response, lot.response]).toEqual(['followed', 'followed']);
    // His cutoff: 12 weeks of fixed costs stay untouched whatever is asked.
    expect(BigInt(lot.reserve)).toBe((annual * 12n) / 46n);
    expect(lot.reserve).toBe(little.reserve);
    // Each step between them adds the same share.
    const steps = ([1, 2, 3, 4, 5] as const).map((level) =>
      shareOf(delegatePlan(w, 'recruitment', level).budget, cash),
    );
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('a cautious 단장 asked to spend freely holds back, a bold one asked to spare spends more', () => {
    const { w, annual, cash } = club('delegation-cautious');
    holdTemperament(w, 'director', 'balanced');
    const balanced = delegatePlan(w, 'recruitment', 5);
    holdTemperament(w, 'director', 'cautious');
    const cautious = delegatePlan(w, 'recruitment', 5);
    expect(cautious).toMatchObject({ request: 5, level: 4, response: 'tempered' });
    // He keeps half a year of fixed costs and spends about two thirds of what a balanced one would.
    expect(BigInt(cautious.reserve)).toBe((annual * 23n) / 46n);
    expect(shareOf(cautious.budget, cash)).toBeCloseTo(0.33, 2);
    expect(BigInt(cautious.budget) * 10n).toBeLessThan(BigInt(balanced.budget) * 7n);
    // A request he already shares is followed.
    expect(delegatePlan(w, 'recruitment', 2)).toMatchObject({ level: 2, response: 'followed' });
    holdTemperament(w, 'director', 'bold');
    expect(delegatePlan(w, 'recruitment', 2)).toMatchObject({ level: 3, response: 'raised' });
    expect(delegatePlan(w, 'recruitment', 1)).toMatchObject({ level: 1, response: 'followed' });
    expect(BigInt(delegatePlan(w, 'recruitment').reserve)).toBe((annual * 6n) / 46n);
  });

  it('with cash below his cutoff nobody spends: no budget, no signing, no hire, cheaper settings', () => {
    const { w, annual } = club('delegation-broke');
    holdTemperament(w, 'director', 'balanced');
    holdTemperament(w, 'youth', 'balanced').trait = 'spotter';
    w.cash = ((annual * 6n) / 46n).toString();
    const plan = delegatePlan(w, 'recruitment', 5);
    expect(plan).toMatchObject({ response: 'noMoney', spare: '0', budget: '0', left: '0' });
    const player = { ...structuredClone(w.players[0]), id: 'delegation:incoming' };
    expect(signingVerdict(w, player, '0')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('남겨 둘 돈'),
    });
    expect(affordable(w, 0n, 0n, 'staff')).toBe(false);
    expect(delegatePlan(w, 'sales')).toMatchObject({ response: 'noMoney' });

    applyDelegatePlans(w, 'season');
    expect(policyOf(w).academy).toBe(1);
    expect(directionOf(w, 'youthGoal')).toBe('sell');
    expect(directionOf(w, 'renewal')).toBe('frugal');
    expect(directionOf(w, 'coaches')).toBe('cheap');
    expect(directionOf(w, 'manager')).toBe('cheap');
  });

  it("sets his work's numbers himself, and the engine runs on them", () => {
    const { w, annual } = club('delegation-academy', [10n, 1n]);
    const coach = holdTemperament(w, 'youth', 'bold');
    coach.trait = 'spotter';
    const before = w.inbox?.length ?? 0;
    operate(w, { type: 'delegation-request', responsibility: 'academy', level: 5 });
    expect(w.delegationRequests).toEqual({ academy: 5 });
    // A bold youth coach asked to spend freely runs the top academy and debuts early.
    expect(policyOf(w).academy).toBe(5);
    expect(directionOf(w, 'debut')).toBe('early');
    expect(policyEffects(policyOf(w)).academyUnits).toBeGreaterThan(0);
    expect(BigInt(operatingCosts(w).annual)).toBeGreaterThan(annual);
    const report = w.inbox!.slice(before).find((item) => item.kind === 'staff-report')!;
    expect(report.title).toContain(coach.name);
    expect(report.detail).toContain('유소년 투자');
    // The owner reads his numbers but cannot change them while the work is delegated.
    expect(settingDelegate(w, { policy: 'academy' })).toBe('academy');
    expect(() => operate(w, { type: 'club-policy', key: 'academy', level: 1 })).toThrow('위임 중');
    expect(() => operate(w, { type: 'club-direction', key: 'debut', choice: 'late' })).toThrow(
      '위임 중',
    );
    // Asked for the minimum he cuts back at once.
    operate(w, { type: 'delegation-request', responsibility: 'academy', level: 1 });
    expect(policyOf(w).academy).toBe(1);
    expect(directionOf(w, 'youthGoal')).toBe('minimal');
    // Taken back, his settings stay until the owner changes them, and the owner may.
    const settings = structuredClone(settingsOf(w));
    settings.responsibilities.academy = 'direct';
    operate(w, { type: 'settings', settings });
    expect(directionOf(w, 'youthGoal')).toBe('minimal');
    operate(w, { type: 'club-policy', key: 'academy', level: 3 });
    expect(policyOf(w).academy).toBe(3);
    // A request is kept while the work is direct, 적당히 as absent.
    operate(w, { type: 'delegation-request', responsibility: 'academy', level: 3 });
    expect(w.delegationRequests).toBeUndefined();
    expect(policyOf(w).academy).toBe(3);
  });

  it('delegating makes the plan at once; a season and a window re-plan only what changed', () => {
    const { w } = club('delegation-handover', [10n, 1n]);
    holdTemperament(w, 'director', 'balanced');
    const settings = structuredClone(settingsOf(w));
    settings.responsibilities.recruitment = 'direct';
    operate(w, { type: 'settings', settings });
    w.delegationRequests = { recruitment: 5 };
    expect(policyOf(w).recruitment).toBe(3);
    settings.responsibilities.recruitment = 'delegated';
    operate(w, { type: 'settings', settings });
    expect(policyOf(w).recruitment).toBe(5);
    const events = w.events.length;
    applyDelegatePlans(w, 'season', ['recruitment']);
    expect(w.events.slice(events).filter((event) => event.kind === 'delegate-plan')).toEqual([]);
  });

  it("measures the season's signing budget before this season's fees, so each fee spends it once", () => {
    const { w } = club('delegation-spent');
    holdTemperament(w, 'director', 'balanced');
    const before = delegatePlan(w, 'recruitment'),
      fee = BigInt(before.budget) / 4n;
    addEvent(w, 'transfer-in', 'signing', 'signing', fee.toString());
    w.cash = (BigInt(w.cash) - fee).toString();
    const after = delegatePlan(w, 'recruitment');
    expect(after.budget).toBe(before.budget);
    expect(after.spent).toBe(fee.toString());
    expect(BigInt(after.left)).toBe(BigInt(before.budget) - fee);
  });

  it('sells harder at runways set by his cutoff and the sales request', () => {
    const { w } = club('delegation-sales');
    holdTemperament(w, 'director', 'balanced');
    expect(spendingStance(w, 'sales').sellSteps).toEqual([12, 30]);
    w.delegationRequests = { sales: 1 };
    expect(spendingStance(w, 'sales').sellSteps).toEqual([24, 60]);
    holdTemperament(w, 'director', 'cautious');
    w.delegationRequests = { sales: 5 };
    // Asked to hold at all costs, a cautious 단장 still sells a step sooner.
    expect(spendingStance(w, 'sales').sellSteps).toEqual([17, 43]);
  });
});

describe('people and requests', () => {
  it('gives each person one fixed temperament, three in ten cautious, four balanced, three bold', () => {
    const counts: Record<Temperament, number> = { cautious: 0, balanced: 0, bold: 0 };
    for (let n = 0; n < 3000; n++) counts[temperamentOf(`staff:${n}`)]++;
    expect(counts.cautious / 3000).toBeCloseTo(0.3, 1);
    expect(counts.balanced / 3000).toBeCloseTo(0.4, 1);
    expect(counts.bold / 3000).toBeCloseTo(0.3, 1);
    expect(temperamentOf(keyWith('bold'))).toBe('bold');
    expect(temperamentOf('staff:7')).toBe(temperamentOf('staff:7'));
    expect(actedLevel(3, 'cautious')).toBe(3);
  });

  it('reads a world saved before requests as 적당히 and keeps a stored request through a save', () => {
    const { w } = club('delegation-save');
    expect(w.delegationRequests).toBeUndefined();
    expect(requestOf(w, 'contracts')).toBe(3);
    // A vacant post plans cautiously.
    w.staff = w.staff!.filter((member) => member.role !== 'director');
    expect(delegateOf(w, 'recruitment')).toMatchObject({ temperament: 'cautious' });
    w.delegationRequests = { recruitment: 5, sales: 1 };
    const loaded: World = validateWorld(JSON.parse(canonical(w)));
    expect(loaded.delegationRequests).toEqual({ recruitment: 5, sales: 1 });
    expect(() =>
      validateWorld(JSON.parse(canonical({ ...w, delegationRequests: { sponsors: 2 } }))),
    ).toThrow();
  });

  it('plans the same way twice for the same world', () => {
    const a = club('delegation-same').w,
      b = club('delegation-same').w;
    applyDelegatePlans(a, 'season');
    applyDelegatePlans(b, 'season');
    expect(canonical(a)).toBe(canonical(b));
  });
});
