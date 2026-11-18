import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { canonical, validateWorld } from '../../contracts/src/index';
import { careerWorld } from './career.testkit';
import { operatingCosts } from './finance';
import { operate } from './operations';
import { policyOf } from './policy';
import { directionOf } from './direction';
import { affordable } from './staff';
import { signingVerdict } from './signings';
import { staffAuthority } from './testing';
import { settingsOf } from './responsibilities';
import { addEvent } from './events';
import { activePlayers, clubOf } from './player-state';
import { financeProjection, seasonRevenue } from './projection';
import {
  actedLevel,
  delegateOf,
  personOf,
  requestOf,
  settingDelegate,
  settingPerson,
  temperamentOf,
  type Temperament,
} from './delegation-info';
import {
  applyDelegatePlans,
  delegatePlan,
  insolvencyStop,
  planLines,
  planRevenue,
  replanIfMoved,
  cashFloor,
  floorTest,
  warnCashFloor,
  wagePressure,
  youthPayCap,
} from './delegation';
import { holdTemperament, keyWith } from './delegation.testkit';

/** Players' wages scaled so they take `percent` of the season's projected income. */
function wagesAt(w: World, percent: bigint) {
  const target = (BigInt(seasonRevenue(w)) * percent) / 100n,
    now = BigInt(operatingCosts(w).playerWages);
  for (const player of activePlayers(w))
    player.wage = ((BigInt(player.wage) * target) / now).toString();
}
/**
 * A club in the demo's proportions: its work all delegated to a balanced 단장, the players' wages
 * 52% of the season's income and the cash 1.6 years of fixed costs.
 */
function club(seed: string, wagePercent = 52n) {
  const w = careerWorld({ seed });
  w.settings = staffAuthority(4);
  holdTemperament(w, 'director', 'balanced');
  wagesAt(w, wagePercent);
  w.cash = ((BigInt(operatingCosts(w).annual) * 16n) / 10n).toString();
  return w;
}
const annualOf = (w: World) => BigInt(operatingCosts(w).annual);
/** The plan's income set so the planned loss is `loss` a year; a negative loss is a surplus. */
function lossOf(w: World, loss: bigint) {
  w.budgetPlan = { year: w.year, revenue: (annualOf(w) - loss).toString(), sales: '0' };
}
/** Move only live cash until the actual middle projection is `target`. */
function projectTo(w: World, target: bigint) {
  const projection = financeProjection(w),
    middle = (BigInt(projection.seasonEnd.low) + BigInt(projection.seasonEnd.high)) / 2n;
  w.cash = (BigInt(w.cash) + target - middle).toString();
}

describe('the 단장 plans to a live cash floor (→ECON-33)', () => {
  it('uses each acted step’s floor with a fee once and prorated current plus next season wages', () => {
    const w = club('delegation-floors'), annual = annualOf(w);
    w.round = 23;
    lossOf(w, -10000n);
    const floors = [BigInt(w.cash), annual, annual / 2n, 0n, -annual / 4n];
    for (const step of [1, 2, 3, 4, 5] as const) {
      const floor = cashFloor(step, BigInt(w.cash), annual);
      expect(floor).toBe(floors[step - 1]);
      const projection = { ...financeProjection(w), seasonEnd: { low: (floor + 2000n).toString(), high: (floor + 4000n).toString() } },
        plan = delegatePlan(w, 'recruitment', step, undefined, projection);
      expect(plan.floor).toBe(floor.toString());
      expect(plan.spendable).toBe('3000');
      // £1,500 now + £500 current-season wages + £1,000 next-season wages.
      expect(floorTest(w, plan, { fee: 1500n, wage: 1000n }, projection).ok).toBe(true);
      expect(floorTest(w, plan, { fee: 1501n, wage: 1000n }, projection).ok).toBe(false);
      // Raises read the same data and the same two wage horizons.
      expect(floorTest(w, plan, { wage: 2000n }, projection).ok).toBe(true);
      expect(floorTest(w, plan, { wage: 2001n }, projection).ok).toBe(false);
      expect(BigInt(plan.budget) - BigInt(plan.committed)).toBe(2000n);
    }
    lossOf(w, 1n);
    const plan = delegatePlan(w, 'recruitment', 1), projection = financeProjection(w);
    projection.seasonEnd = { low: (BigInt(w.cash) + annual * 10n).toString(), high: (BigInt(w.cash) + annual * 10n).toString() };
    expect(floorTest(w, plan, {}, projection)).toMatchObject({ ok: false, loss: 1n });
  });

  it('reads live injections and costs rather than granting another budget at a plan', () => {
    const w = club('delegation-live');
    w.delegationRequests = { recruitment: 4 };
    const before = delegatePlan(w, 'recruitment');
    w.cash = (BigInt(w.cash) + 10000n).toString();
    expect(BigInt(delegatePlan(w, 'recruitment').spendable)).toBe(BigInt(before.spendable) + 10000n);
    const added = delegatePlan(w, 'recruitment');
    applyDelegatePlans(w, 'window', ['recruitment']);
    expect(delegatePlan(w, 'recruitment').spendable).toBe(added.spendable);
    w.players[0].wage = (BigInt(w.players[0].wage) + 1000n).toString();
    expect(BigInt(delegatePlan(w, 'recruitment').spendable)).toBeLessThan(BigInt(added.spendable));
  });

  it('reserves live bid fees once and excludes the settling bid from both cash checks', () => {
    const w = club('delegation-pending'), annual = annualOf(w),
      candidate = { ...w.players[0], id: 'reserved-signing', wage: '0' };
    w.delegationRequests = { recruitment: 4 };
    w.cash = (annual * 10n).toString();
    const before = delegatePlan(w, 'recruitment'), fee = BigInt(before.spendable) * 2n / 3n;
    w.bids = [{ id: 'reserved-bid', direction: 'out', playerId: candidate.id, fee: fee.toString(),
      year: w.year, day: 0, due: 1, status: 'pending', staff: 'upgrade' }];
    expect(BigInt(delegatePlan(w, 'recruitment').spendable)).toBe(BigInt(before.spendable) - fee);
    expect(signingVerdict(w, candidate, fee.toString()).ok).toBe(false);
    expect(signingVerdict(w, candidate, fee.toString(), undefined, 'reserved-bid').ok).toBe(true);
    w.bids[0].status = 'completed';
    w.cash = (BigInt(w.cash) - fee).toString();
    expect(BigInt(delegatePlan(w, 'recruitment').spendable)).toBe(BigInt(before.spendable) - fee);
  });

  it('keeps the cautious insolvency stop and the short-line free signing exception distinct', () => {
    const w = club('delegation-stop'), incoming = { ...w.players[0], id: 'incoming', wage: '1' };
    w.cash = (annualOf(w) * 10n).toString();
    w.delegationRequests = { recruitment: 1 };
    lossOf(w, 1000n);
    expect(signingVerdict(w, incoming, '0', 'upgrade', undefined, { freeAgent: true }).ok).toBe(false);
    expect(signingVerdict(w, incoming, '0', 'short', undefined, { freeAgent: true }).ok).toBe(true);
    const projection = financeProjection(w);
    projection.seasonEnd = { low: '-1', high: '100000' };
    expect(floorTest(w, { level: 4, revenue: planRevenue(w) }, {}, projection).ok).toBe(true);
    expect(insolvencyStop(w, 0n, 0n, false, 'recruitment', projection)).toBeDefined();
    w.cash = '1';
    expect(signingVerdict(w, incoming, '0', 'short', undefined, { freeAgent: true }).ok).toBe(false);
    holdTemperament(w, 'director', 'bold');
    w.delegationRequests = { recruitment: 5, staff: 3 };
    w.cash = (annualOf(w) * 60n).toString();
    expect(insolvencyStop(w, BigInt(w.cash), 0n, true)).toBeUndefined();
    expect(insolvencyStop(w, BigInt(w.cash), 0n, true, 'staff')).toBeDefined();
  });

  it('retains temperament step logic without a second reserve', () => {
    const w = club('delegation-temperament');
    holdTemperament(w, 'director', 'cautious');
    const plan = delegatePlan(w, 'recruitment', 5);
    expect(plan).toMatchObject({ request: 5, level: 4, response: 'tempered', floor: '0' });
    expect(planLines(w, plan)[0]).toContain('안정 지향');
    holdTemperament(w, 'director', 'bold');
    expect(delegatePlan(w, 'recruitment', 2)).toMatchObject({ level: 3, response: 'raised' });
  });

  it('uses the current-bill floor test to choose frugal renewals', () => {
    const w = club('delegation-frugal');
    w.delegationRequests = { contracts: 4 };
    projectTo(w, 0n);
    expect(delegatePlan(w, 'contracts').choices).toContainEqual(expect.objectContaining({ option: 'standard' }));
    projectTo(w, -1n);
    expect(delegatePlan(w, 'contracts').choices).toContainEqual(expect.objectContaining({ option: 'frugal' }));
  });

  it('warns once per season, surviving pruned inbox/events, replans and save round trips', () => {
    const w = careerWorld({ seed: 'delegation-warning' });
    w.settings = staffAuthority(4);
    projectTo(w, 0n);
    warnCashFloor(w);
    expect(w.delegationWarningSeason).toBe(w.year);
    expect(w.inbox!.filter(i => i.title.includes('단장 경고'))).toHaveLength(1);
    w.inbox = []; w.events = [];
    const loaded = validateWorld(JSON.parse(canonical(w)));
    applyDelegatePlans(loaded, 'window');
    warnCashFloor(loaded);
    expect(loaded.inbox!.filter(i => i.title.includes('단장 경고'))).toHaveLength(0);
    loaded.delegationWarningSeason = loaded.year - 1;
    projectTo(loaded, 0n);
    warnCashFloor(loaded);
    expect(loaded.inbox!.filter(i => i.title.includes('단장 경고'))).toHaveLength(1);
  });
});

describe('youth money is the 단장’s, the academy’s football the youth director’s', () => {
  it('sets the academy level and the youth director’s pay cap from a share of the income', () => {
    const w = club('delegation-youth');
    w.cash = '1';
    const coach = holdTemperament(w, 'youth', 'bold');
    coach.trait = 'developer';
    const before = w.inbox?.length ?? 0;
    operate(w, { type: 'delegation-request', responsibility: 'academy', level: 5 });
    const plan = delegatePlan(w, 'academy');
    expect(plan.delegate.post).toBe('director');
    expect(policyOf(w).academy).toBe(plan.youth!.level);
    // The youth director is paid first, the academy from the rest, up to the level asked for.
    expect(BigInt(plan.youth!.cost) + BigInt(plan.youth!.pay)).toBeLessThanOrEqual(
      BigInt(plan.budget),
    );
    expect(plan.youth!.payCap).toBe(plan.budget);
    expect(youthPayCap(w)).toBe(BigInt(plan.youth!.payCap));
    // The youth director's own calls: a developer keeps everyone, a bold one debuts early.
    expect(directionOf(w, 'youthGoal')).toBe('firstTeam');
    expect(directionOf(w, 'debut')).toBe('early');
    const report = w.inbox!.slice(before).find((item) => item.kind === 'staff-report')!;
    expect(report.title).toContain(delegateOf(w).name);
    expect(report.detail).toContain('유소년 몫');
    // The academy's money rows name the 단장, its football rows the youth director.
    expect(settingDelegate(w, { policy: 'academy' })).toBe('academy');
    expect(settingPerson(w, { policy: 'academy' }).post).toBe('director');
    expect(settingPerson(w, { direction: 'debut' })).toMatchObject({
      post: 'youth',
      name: personOf(w, 'youth').name,
    });
    expect(() => operate(w, { type: 'club-policy', key: 'academy', level: 1 })).toThrow('위임 중');
    // A refused change names whose the setting is, as the page's lock does (→ECON-39).
    const held = structuredClone(w),
      names = (post: 'director' | 'youth') => `유소년 운영 · ${personOf(w, post).postLabel} 담당`;
    expect(personOf(w, 'youth').postLabel).not.toBe(personOf(w, 'director').postLabel);
    expect(() => operate(w, { type: 'club-policy', key: 'academy', level: 1 })).toThrow(
      names('director'),
    );
    for (const key of ['youthGoal', 'debut'] as const)
      expect(() => operate(w, { type: 'club-direction', key, choice: 'standard' })).toThrow(
        names('youth'),
      );
    expect(w).toEqual(held);
    // Asked for the minimum he cuts the academy back at once.
    operate(w, { type: 'delegation-request', responsibility: 'academy', level: 1 });
    expect(policyOf(w).academy).toBeLessThan(plan.youth!.level);
    // Taken back, the settings stay until the owner changes them, and the owner may.
    const settings = structuredClone(settingsOf(w));
    settings.responsibilities.academy = 'direct';
    operate(w, { type: 'settings', settings });
    expect(youthPayCap(w)).toBeUndefined();
    operate(w, { type: 'club-policy', key: 'academy', level: 3 });
    expect(policyOf(w).academy).toBe(3);
  });

  it("a youth director's pay past the 단장's cap is not affordable while youth money is delegated", () => {
    const w = club('delegation-youth-pay');
    w.cash = (BigInt(operatingCosts(w).annual) * 10n).toString();
    applyDelegatePlans(w, 'season');
    const cap = youthPayCap(w)!,
      pay = BigInt(personOf(w, 'youth').member?.wage ?? '0');
    expect(affordable(w, 0n, cap - pay, 'youth')).toBe(true);
    expect(affordable(w, 0n, cap - pay + 1n, 'youth')).toBe(false);
    // Other coaches answer only to the insolvency stop.
    expect(affordable(w, 0n, cap * 10n, 'attack')).toBe(true);
  });
});

describe('selling and the plain stop', () => {
  it('sells harder below the floor or in distress and restores calm after an injection', () => {
    const w = club('delegation-sell');
    w.delegationRequests = { sales: 4 };
    projectTo(w, 0n);
    expect(wagePressure(w).level).toBe(0);
    projectTo(w, -1n);
    expect(wagePressure(w).level).toBe(1);
    projectTo(w, 10000n);
    expect(wagePressure(w).level).toBe(0);
    w.distress = { stage: 1, overHalfRounds: 0 };
    expect(wagePressure(w).level).toBe(1);
    w.distress.stage = 2;
    expect(wagePressure(w).level).toBe(2);
  });

  it('delegating makes the plan at once; a season and a window re-plan only what changed', () => {
    const w = club('delegation-handover');
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

  it('reads a world saved before requests and plans as 적당히 on the live projection', () => {
    // The club's own people, so the save's person references hold.
    const w = careerWorld({ seed: 'delegation-save' });
    w.settings = staffAuthority(4);
    expect(w.delegationRequests).toBeUndefined();
    expect(w.budgetPlan).toBeUndefined();
    expect(requestOf(w, 'contracts')).toBe(3);
    expect(planRevenue(w)).toBe(seasonRevenue(w));
    // A vacant post plans cautiously.
    const vacant = structuredClone(w);
    vacant.staff = vacant.staff!.filter((member) => member.role !== 'director');
    expect(delegateOf(vacant)).toMatchObject({ temperament: 'cautious' });
    // A plan from another season reads live too, and the next round's settlement makes one.
    w.budgetPlan = { year: w.year - 1, revenue: '1', sales: '0' };
    expect(planRevenue(w)).toBe(seasonRevenue(w));
    replanIfMoved(w);
    expect(w.budgetPlan).toEqual({ year: w.year, revenue: seasonRevenue(w), sales: '0' });
    w.delegationRequests = { recruitment: 5, sales: 1 };
    applyDelegatePlans(w, 'window');
    const loaded: World = validateWorld(JSON.parse(canonical(w)));
    expect(loaded.delegationRequests).toEqual({ recruitment: 5, sales: 1 });
    expect(loaded.budgetPlan).toEqual(w.budgetPlan);
    expect(() =>
      validateWorld(JSON.parse(canonical({ ...w, delegationRequests: { sponsors: 2 } }))),
    ).toThrow();
  });

  it('plans the same way twice for the same world', () => {
    const a = club('delegation-same'),
      b = club('delegation-same');
    applyDelegatePlans(a, 'season');
    applyDelegatePlans(b, 'season');
    expect(canonical(a)).toBe(canonical(b));
  });
});
