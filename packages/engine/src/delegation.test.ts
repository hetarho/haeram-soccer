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
import { seasonRevenue } from './projection';
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
  spendingStance,
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
const share = (amount: string, of: string) => Number((BigInt(amount) * 1000n) / BigInt(of)) / 10;

describe('the 단장 plans on the season’s income, not on the cash in the bank', () => {
  it('asked for the minimum he spends no fees on a demo-like club, asked to spend freely he spends a fifth of its income', () => {
    const w = club('delegation-demo'),
      little = delegatePlan(w, 'recruitment', 1),
      lot = delegatePlan(w, 'recruitment', 5);
    expect(BigInt(little.revenue)).toBeGreaterThan(0n);
    expect(little.revenue).toBe(seasonRevenue(w));
    // Squad cost (wages and fees) may take 45% of the income asked for the minimum, 80% freely.
    expect(share(little.budget, little.revenue)).toBeCloseTo(45, 0);
    expect(share(lot.budget, lot.revenue)).toBeCloseTo(80, 0);
    // The wages already take 52%: nothing is left for fees at 45%, 28% of the income at 80%.
    expect(little).toMatchObject({ over: true, left: '0', response: 'followed' });
    expect(lot.over).toBe(false);
    expect(share(lot.left, lot.revenue)).toBeCloseTo(28, 0);
    // Each step between them leaves at least as much.
    const left = ([1, 2, 3, 4, 5] as const).map((level) =>
      BigInt(delegatePlan(w, 'recruitment', level).left),
    );
    expect(left).toEqual([...left].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(left[4]).toBeGreaterThan(left[2] * 2n);
    // The renewals' room and the youth money move with the request too.
    expect(BigInt(delegatePlan(w, 'contracts', 5).left)).toBeGreaterThan(
      BigInt(delegatePlan(w, 'contracts', 1).left),
    );
    expect(delegatePlan(w, 'academy', 5).youth!.level).toBeGreaterThan(
      delegatePlan(w, 'academy', 1).youth!.level,
    );
  });

  it('plans the same whatever the cash, which only the plain insolvency stop reads', () => {
    const w = club('delegation-cash'),
      rich = delegatePlan(w, 'recruitment', 5);
    w.cash = (BigInt(w.cash) / 20n).toString();
    expect(delegatePlan(w, 'recruitment', 5)).toEqual(rich);
    // With almost no cash, the stop holds a spend the plan would allow.
    w.cash = '1';
    expect(insolvencyStop(w, 0n, 0n)).toContain('현금이 바닥나지 않게');
    expect(signingVerdict(w, { ...w.players[0], id: 'x', wage: '1' }, '1').reason).toContain(
      '현금이 바닥나지 않게',
    );
  });

  it('a cautious 단장 asked to spend freely settles a step lower and says why', () => {
    const w = club('delegation-cautious');
    holdTemperament(w, 'director', 'cautious');
    const cautious = delegatePlan(w, 'recruitment', 5);
    expect(cautious).toMatchObject({ request: 5, level: 4, response: 'tempered' });
    expect(share(cautious.budget, cautious.revenue)).toBeCloseTo(70, 0);
    const [why] = planLines(w, cautious);
    expect(why).toContain('안정 지향');
    expect(why).toContain('위험');
    holdTemperament(w, 'director', 'balanced');
    expect(BigInt(cautious.left)).toBeLessThan(BigInt(delegatePlan(w, 'recruitment', 5).left));
    // A request he shares is followed; a bold 단장 asked to spare spends a step more.
    holdTemperament(w, 'director', 'cautious');
    expect(delegatePlan(w, 'recruitment', 2)).toMatchObject({ level: 2, response: 'followed' });
    holdTemperament(w, 'director', 'bold');
    expect(delegatePlan(w, 'recruitment', 2)).toMatchObject({ level: 3, response: 'raised' });
  });

  it('a revenue drop lowers the budget at his next plan although the cash is unchanged', () => {
    const w = club('delegation-revenue');
    w.delegationRequests = { recruitment: 5 };
    applyDelegatePlans(w, 'window');
    const before = delegatePlan(w, 'recruitment'),
      cash = w.cash,
      inbox = w.inbox?.length ?? 0;
    expect(w.budgetPlan).toMatchObject({ year: w.year, revenue: before.revenue });
    // The crowds fall away: the projection drops, the plan holds until he plans again.
    clubOf(w).fans = Math.round(clubOf(w).fans / 4);
    expect(BigInt(seasonRevenue(w))).toBeLessThan((BigInt(before.revenue) * 9n) / 10n);
    expect(delegatePlan(w, 'recruitment').budget).toBe(before.budget);
    replanIfMoved(w);
    const after = delegatePlan(w, 'recruitment');
    expect(w.cash).toBe(cash);
    expect(after.revenue).toBe(seasonRevenue(w));
    expect(BigInt(after.budget)).toBeLessThan(BigInt(before.budget));
    expect(BigInt(after.left)).toBeLessThan(BigInt(before.left));
    const report = w.inbox!.slice(inbox).find((item) => item.kind === 'staff-report')!;
    expect(report.detail).toContain('수입 예상이 바뀌어');
    // A small move does not re-plan.
    const reports = w.inbox!.length;
    replanIfMoved(w);
    expect(w.inbox!.length).toBe(reports);
  });

  it('puts a share of this season’s sales back into signings and re-plans after a big sale', () => {
    const w = club('delegation-sales');
    applyDelegatePlans(w, 'window');
    const before = delegatePlan(w, 'recruitment'),
      fee = BigInt(before.revenue) / 10n;
    addEvent(w, 'transfer-out', 'sale', 'sale', fee.toString());
    const after = delegatePlan(w, 'recruitment');
    expect(after.reinvestShare).toBe(40);
    expect(BigInt(after.reinvest)).toBe((fee * 40n) / 100n);
    expect(BigInt(after.left)).toBe(BigInt(before.left) + (fee * 40n) / 100n);
    const inbox = w.inbox?.length ?? 0;
    replanIfMoved(w);
    expect(w.budgetPlan?.sales).toBe(fee.toString());
    expect(w.inbox!.slice(inbox).some((item) => item.detail.includes('선수 판매'))).toBe(true);
  });

  it("measures the season's fees once: each signing spends what is left, never the base", () => {
    const w = club('delegation-spent');
    w.delegationRequests = { recruitment: 5 };
    const before = delegatePlan(w, 'recruitment'),
      fee = BigInt(before.left) / 4n;
    addEvent(w, 'transfer-in', 'signing', 'signing', fee.toString());
    w.cash = (BigInt(w.cash) - fee).toString();
    const after = delegatePlan(w, 'recruitment');
    expect(after.budget).toBe(before.budget);
    expect(after.spent).toBe(fee.toString());
    expect(BigInt(after.left)).toBe(BigInt(before.left) - fee);
  });

  it("the engine runs on his numbers: signings and renewals inside the squad's share", () => {
    const w = club('delegation-verdicts');
    w.delegationRequests = { recruitment: 5 };
    const plan = delegatePlan(w, 'recruitment'),
      incoming = { ...structuredClone(w.players[0]), id: 'delegation:incoming', wage: '0' };
    expect(signingVerdict(w, incoming, plan.left).ok).toBe(true);
    expect(signingVerdict(w, incoming, (BigInt(plan.left) + 1n).toString()).reason).toContain(
      '영입에 쓸 돈',
    );
    // A wage that takes the bill past 80% of the income is refused whatever the fee.
    const room = BigInt(plan.budget) - BigInt(plan.committed);
    expect(signingVerdict(w, { ...incoming, wage: (room + 1n).toString() }, '0').reason).toContain(
      '연봉 총액',
    );
    // Asked for the minimum, wages already past 45%: no fee at all, and no new wage either —
    // except a free agent for a line the team cannot field, which only the cash stop reads.
    w.delegationRequests = { recruitment: 1 };
    expect(signingVerdict(w, incoming, '1').ok).toBe(false);
    const free = { ...incoming, wage: '100000' };
    expect(signingVerdict(w, free, '0', 'upgrade').ok).toBe(false);
    expect(signingVerdict(w, free, '0', 'short')).toMatchObject({ ok: true });
    expect(signingVerdict(w, free, '1', 'short').ok).toBe(false);
    w.cash = '1';
    expect(signingVerdict(w, free, '0', 'short').reason).toContain('현금이 바닥나지 않게');
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
  it('sells harder once the wage bill passes the sales line the request sets', () => {
    const w = club('delegation-sell', 65n);
    applyDelegatePlans(w, 'window');
    // 적당히: the line is at 60%, 65% passes it by less than ten points.
    expect(spendingStance(w, 'sales').sellAbove).toEqual([60, 70]);
    expect(wagePressure(w)).toMatchObject({ level: 1 });
    w.delegationRequests = { sales: 1 };
    expect(wagePressure(w)).toMatchObject({ level: 2 });
    w.delegationRequests = { sales: 5 };
    expect(wagePressure(w)).toMatchObject({ level: 0 });
    // Asked to hold at all costs, a cautious 단장 still sells a step sooner.
    holdTemperament(w, 'director', 'cautious');
    expect(spendingStance(w, 'sales').sellAbove).toEqual([68, 78]);
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
