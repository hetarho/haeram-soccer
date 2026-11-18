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
  LOSS_RUNWAY,
  requestOf,
  RESERVE_YEARS,
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
  runwayTest,
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
const annualOf = (w: World) => BigInt(operatingCosts(w).annual);
/** The plan's income set so the planned loss is `loss` a year; a negative loss is a surplus. */
function lossOf(w: World, loss: bigint) {
  w.budgetPlan = { year: w.year, revenue: (annualOf(w) - loss).toString(), sales: '0' };
}
/** The cash that leaves `capital` above the reserve the plan for `key` keeps back. */
function cashWith(w: World, key: 'recruitment' | 'sales' | 'contracts', capital: bigint) {
  const years = delegatePlan(w, key).reserveYears;
  w.cash = (capital + (annualOf(w) * BigInt(Math.round(years * 100))) / 100n).toString();
}

describe('the 단장 plans on a loss runway, not a share of income (→ECON-33)', () => {
  it('reads the runway and the reserve from the step he acts on and his temperament', () => {
    expect(LOSS_RUNWAY).toEqual({ 1: 0, 2: 6, 3: 4, 4: 2, 5: 1 });
    expect(RESERVE_YEARS).toEqual({
      cautious: { 1: 1, 2: 1, 3: 0.5, 4: 0.5, 5: 0.25 },
      balanced: { 1: 1, 2: 0.5, 3: 0.25, 4: 0, 5: 0 },
      bold: { 1: 0.5, 2: 0.25, 3: 0, 4: 0, 5: 0 },
    });
    const w = club('delegation-reserves'),
      annual = annualOf(w);
    w.cash = (annual * 10n).toString();
    for (const temperament of ['cautious', 'balanced', 'bold'] as const) {
      holdTemperament(w, 'director', temperament);
      const capital = ([1, 2, 3, 4, 5] as const).map((request) => {
        const plan = delegatePlan(w, 'recruitment', request),
          years = RESERVE_YEARS[temperament][plan.level];
        expect(plan).toMatchObject({ reserveYears: years, runway: LOSS_RUNWAY[plan.level] });
        expect(BigInt(plan.capital)).toBe(
          annual * 10n - (annual * BigInt(Math.round(years * 100))) / 100n,
        );
        return BigInt(plan.capital);
      });
      // A bigger request never keeps more back.
      expect(capital).toEqual([...capital].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    // A cautious 단장 acts on 아낌없이 at 넉넉히: half a year kept back, a two-season runway.
    holdTemperament(w, 'director', 'cautious');
    expect(delegatePlan(w, 'recruitment', 5)).toMatchObject({
      level: 4,
      reserveYears: 0.5,
      runway: 2,
    });
    w.cash = '-1';
    // Negative cash releases no capital.
    expect(delegatePlan(w, 'recruitment', 5).capital).toBe('0');
  });

  it('at 최소한만 refuses a signing that would make a planned loss and lets one within income pass', () => {
    const w = club('delegation-income'),
      annual = annualOf(w),
      surplus = annual / 10n;
    w.delegationRequests = { recruitment: 1 };
    lossOf(w, -surplus);
    w.cash = (annual * 3n).toString();
    const plan = delegatePlan(w, 'recruitment'),
      incoming = { ...structuredClone(w.players[0]), id: 'delegation:incoming' };
    expect(plan).toMatchObject({ level: 1, runway: 0, loss: '0', over: false });
    // Within income: his wage leaves no planned loss, and the fee comes out of the capital.
    expect(runwayTest(w, plan, { fee: annual, wage: surplus / 2n }).ok).toBe(true);
    expect(signingVerdict(w, { ...incoming, wage: (surplus / 2n).toString() }, '1').ok).toBe(true);
    // A wage past the surplus makes a planned loss: refused whatever the fee.
    expect(runwayTest(w, plan, { wage: surplus + 1n })).toMatchObject({ ok: false, loss: 1n });
    expect(signingVerdict(w, { ...incoming, wage: (surplus + 1n).toString() }, '0').ok).toBe(false);
    // A fee past the available capital is refused too.
    expect(runwayTest(w, plan, { fee: BigInt(plan.capital) + 1n }).ok).toBe(false);
    expect(planLines(w, plan).join(' ')).toContain('수입 안에서 운영');
  });

  it('at 아낌없이 a club holding 196 seasons of its income in cash (£15.7M against £80K) commits far above its income until the runway test fails', () => {
    const w = club('delegation-funded'),
      annual = annualOf(w),
      income = annual / 2n,
      cash = income * 196n;
    w.delegationRequests = { recruitment: 5 };
    w.budgetPlan = { year: w.year, revenue: income.toString(), sales: '0' };
    w.cash = cash.toString();
    const plan = delegatePlan(w, 'recruitment');
    // 균형형 at 아낌없이: nothing kept back, one season of the planned loss to cover.
    expect(plan).toMatchObject({ level: 5, runway: 1, reserveYears: 0, capital: cash.toString() });
    expect(BigInt(plan.loss)).toBe(annual - income);
    // Ten times the income in wages, and the rest of the cash in fees: the test just passes.
    const wage = income * 10n,
      fee = cash - (annual + wage - income);
    expect(runwayTest(w, plan, { fee, wage }).ok).toBe(true);
    expect(runwayTest(w, plan, { fee: fee + 1n, wage }).ok).toBe(false);
    // The wage bill he shows as carried is exactly what the test lets through.
    const room = BigInt(plan.budget) - BigInt(plan.committed);
    expect(room).toBeGreaterThan(wage);
    expect(runwayTest(w, plan, { wage: room }).ok).toBe(true);
    expect(runwayTest(w, plan, { wage: room + 1n }).ok).toBe(false);
    // No share of income caps the wage bill: the signing passes the whole of his checks.
    const star = { ...structuredClone(w.players[0]), id: 'delegation:star', wage: wage.toString() };
    expect(signingVerdict(w, star, (fee / 2n).toString()).ok).toBe(true);
    expect(signingVerdict(w, star, (fee + 1n).toString()).ok).toBe(false);
    expect(planLines(w, plan).join(' ')).toContain('현금으로 1시즌');
  });

  it('shows the room for raises the runway test accepts, the reserve kept on current costs', () => {
    // Income equal to the fixed costs, 아껴서 (six seasons, half a year back for a 균형형 단장)
    // and a little capital: each unit of raise adds a unit of loss; the reserve stays on today's
    // costs (→ECON-33), so the raise does not also hold half of itself back.
    const w = club('delegation-raise-room');
    w.delegationRequests = { contracts: 2 };
    lossOf(w, 0n);
    cashWith(w, 'contracts', 10_000n);
    const plan = delegatePlan(w, 'contracts'),
      left = BigInt(plan.left);
    expect(plan).toMatchObject({ runway: 6, reserveYears: 0.5, capital: '10000' });
    expect(BigInt(plan.budget) - BigInt(plan.committed)).toBe(left);
    expect(runwayTest(w, plan, { wage: left }).ok).toBe(true);
    expect(runwayTest(w, plan, { wage: left + 1n }).ok).toBe(false);
    // 10,000 / 6 rounded down: a raise of 1,666 is six seasons of 9,996 and passes.
    expect(left).toBe(1666n);
    expect(runwayTest(w, plan, { wage: 1666n })).toMatchObject({ ok: true, capital: 10_000n });
  });

  it('reserves live bid fees once and releases the current bid reservation when settling it', () => {
    const w = club('delegation-pending-capital'),
      annual = annualOf(w),
      candidate = { ...w.players[0], id: 'reserved-signing', wage: '0' },
      fee = annual * 6n;
    w.cash = (annual * 10n).toString();
    w.bids = [
      {
        id: 'reserved-bid',
        direction: 'out',
        playerId: candidate.id,
        fee: fee.toString(),
        year: w.year,
        day: 0,
        due: 1,
        status: 'pending',
        staff: 'upgrade',
      },
    ];
    // 균형형 at 최소한만 keeps a year back; the open bid's fee is reserved too.
    expect(BigInt(delegatePlan(w, 'recruitment', 1).capital)).toBe(annual * 3n);
    expect(signingVerdict(w, candidate, fee.toString()).ok).toBe(false);
    expect(signingVerdict(w, candidate, fee.toString(), undefined, 'reserved-bid').ok).toBe(true);
    w.bids[0].status = 'rejected';
    expect(BigInt(delegatePlan(w, 'recruitment', 1).capital)).toBe(annual * 9n);
  });

  it('stops a spend that would run the club out of cash whatever the plan allows', () => {
    const w = club('delegation-cash');
    w.cash = '1';
    expect(insolvencyStop(w, 0n, 0n)).toContain('현금이 바닥나지 않게');
    expect(signingVerdict(w, { ...w.players[0], id: 'x', wage: '0' }, '0').reason).toContain(
      '현금이 바닥나지 않게',
    );
    // A 공격형 단장 acting on 아낌없이 may spend to zero cash; every other decision keeps 4 rounds.
    holdTemperament(w, 'director', 'bold');
    w.cash = (annualOf(w) * 60n).toString();
    w.delegationRequests = { recruitment: 5, staff: 3 };
    expect(insolvencyStop(w, BigInt(w.cash), 0n, true)).toBeUndefined();
    expect(insolvencyStop(w, BigInt(w.cash) + 1n, 0n, true)).toBeDefined();
    expect(insolvencyStop(w, BigInt(w.cash), 0n, true, 'staff')).toBeDefined();
  });

  it('a cautious 단장 asked to spend freely settles a step lower and says why', () => {
    const w = club('delegation-cautious');
    holdTemperament(w, 'director', 'cautious');
    const cautious = delegatePlan(w, 'recruitment', 5);
    expect(cautious).toMatchObject({ request: 5, level: 4, response: 'tempered', runway: 2 });
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

  it('a revenue drop lowers the wage bill he carries at his next plan although the cash is unchanged', () => {
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
    expect(BigInt(after.loss)).toBeGreaterThanOrEqual(BigInt(before.loss));
    expect(BigInt(after.left)).toBeLessThanOrEqual(BigInt(before.left));
    const report = w.inbox!.slice(inbox).find((item) => item.kind === 'staff-report')!;
    expect(report.detail).toContain('수입 예상이 바뀌어');
    // A small move does not re-plan.
    const reports = w.inbox!.length;
    replanIfMoved(w);
    expect(w.inbox!.length).toBe(reports);
  });

  it('player sales and fees reach cash, and so his capital; a big sale re-plans', () => {
    const w = club('delegation-sales');
    w.cash = (annualOf(w) * 4n).toString();
    applyDelegatePlans(w, 'window');
    const before = delegatePlan(w, 'recruitment'),
      fee = BigInt(before.revenue) / 10n;
    addEvent(w, 'transfer-out', 'sale', 'sale', fee.toString());
    w.cash = (BigInt(w.cash) + fee).toString();
    const sold = delegatePlan(w, 'recruitment');
    expect(BigInt(sold.capital)).toBe(BigInt(before.capital) + fee);
    expect(BigInt(sold.left)).toBe(BigInt(before.left) + fee);
    const inbox = w.inbox?.length ?? 0;
    replanIfMoved(w);
    expect(w.budgetPlan?.sales).toBe(fee.toString());
    expect(w.inbox!.slice(inbox).some((item) => item.detail.includes('선수 판매'))).toBe(true);
    // A fee paid leaves the cash: it is not taken from the capital twice.
    w.cash = (BigInt(w.cash) - fee).toString();
    addEvent(w, 'transfer-in', 'signing', 'signing', fee.toString());
    expect(delegatePlan(w, 'recruitment').capital).toBe(before.capital);
  });

  it('the engine runs on his numbers: signings inside the runway test', () => {
    const w = club('delegation-verdicts');
    // A cautious 단장 acts on 아낌없이 at 넉넉히: half a year back, two seasons of loss to cover.
    holdTemperament(w, 'director', 'cautious');
    w.delegationRequests = { recruitment: 5 };
    lossOf(w, annualOf(w) / 10n);
    w.cash = (annualOf(w) * 3n).toString();
    const plan = delegatePlan(w, 'recruitment'),
      incoming = { ...structuredClone(w.players[0]), id: 'delegation:incoming', wage: '0' };
    expect(plan).toMatchObject({ runway: 2, reserveYears: 0.5, over: false });
    expect(BigInt(plan.left)).toBe(BigInt(plan.capital) - (annualOf(w) / 10n) * 2n);
    expect(signingVerdict(w, incoming, plan.left).ok).toBe(true);
    expect(signingVerdict(w, incoming, (BigInt(plan.left) + 1n).toString()).reason).toContain(
      '시즌분',
    );
    // A wage past the bill the runway carries is refused whatever the fee.
    const room = BigInt(plan.budget) - BigInt(plan.committed);
    expect(signingVerdict(w, { ...incoming, wage: (room + 1n).toString() }, '0').reason).toContain(
      '연봉 총액',
    );
    // Asked for the minimum while making a loss: no fee at all, and no new wage either —
    // except a free agent for a line the team cannot field, which only the cash stop reads.
    w.delegationRequests = { recruitment: 1 };
    expect(signingVerdict(w, incoming, '1').ok).toBe(false);
    const free = { ...incoming, wage: '100000' };
    expect(signingVerdict(w, free, '0', 'upgrade').ok).toBe(false);
    expect(signingVerdict(w, free, '0', 'short', undefined, { freeAgent: true })).toMatchObject({
      ok: true,
    });
    expect(signingVerdict(w, free, '1', 'short').ok).toBe(false);
    w.cash = '1';
    expect(signingVerdict(w, free, '0', 'short', undefined, { freeAgent: true }).reason).toContain(
      '현금이 바닥나지 않게',
    );
  });

  it('renewals at 짠물 while the runway test fails at the current wage bill (→ECON-39)', () => {
    const w = club('delegation-frugal');
    w.delegationRequests = { contracts: 4 };
    lossOf(w, annualOf(w) / 5n);
    const renewal = () =>
      delegatePlan(w, 'contracts').choices.find((choice) => choice.key === 'renewal');
    // 넉넉히: two seasons of the loss to cover. Just enough cash: 표준.
    cashWith(w, 'contracts', (annualOf(w) / 5n) * 2n);
    expect(delegatePlan(w, 'contracts').over).toBe(false);
    expect(renewal()).toMatchObject({ option: 'standard' });
    // One unit less and the test fails: 짠물.
    cashWith(w, 'contracts', (annualOf(w) / 5n) * 2n - 1n);
    expect(delegatePlan(w, 'contracts').over).toBe(true);
    expect(renewal()).toMatchObject({ option: 'frugal' });
    // A raise reads the same test: refused while the loss after it is not covered.
    const plan = delegatePlan(w, 'contracts');
    expect(runwayTest(w, plan, { wage: 1n }).ok).toBe(false);
    cashWith(w, 'contracts', (annualOf(w) / 5n) * 2n + 2n);
    expect(runwayTest(w, delegatePlan(w, 'contracts'), { wage: 1n }).ok).toBe(true);
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
  it('sells harder while the runway test fails, harder still at half the runway (→CLUB-18/52)', () => {
    const w = club('delegation-sell'),
      loss = annualOf(w) / 5n;
    lossOf(w, loss);
    // 균형: four seasons of the loss to cover.
    expect(spendingStance(w, 'sales').runway).toBe(4);
    cashWith(w, 'sales', loss * 4n);
    expect(wagePressure(w)).toMatchObject({ level: 0, seasons: 4, runway: 4 });
    cashWith(w, 'sales', loss * 3n);
    expect(wagePressure(w)).toMatchObject({ level: 1, seasons: 3 });
    cashWith(w, 'sales', loss);
    expect(wagePressure(w)).toMatchObject({ level: 2, seasons: 1 });
    // 적극 매각 allows no loss at all; 끝까지 지키기 a single season.
    w.delegationRequests = { sales: 1 };
    cashWith(w, 'sales', loss * 10n);
    expect(wagePressure(w).level).toBe(2);
    w.delegationRequests = { sales: 5 };
    cashWith(w, 'sales', loss);
    expect(wagePressure(w).level).toBe(0);
    cashWith(w, 'sales', (loss * 7n) / 10n);
    expect(wagePressure(w).level).toBe(1);
    // Within income (적극 매각) the plan's sentence names the income, never the cash's seasons.
    w.delegationRequests = { sales: 1 };
    cashWith(w, 'sales', loss * 10n);
    const pressed = planLines(w, delegatePlan(w, 'sales')).join(' ');
    expect(pressed).toContain('계획 수입을 넘어');
    expect(pressed).not.toContain('적자 허용 기간');
    lossOf(w, -1n);
    expect(planLines(w, delegatePlan(w, 'sales')).join(' ')).toContain('계획 수입 안에 머물러');
    lossOf(w, loss);
    w.delegationRequests = { sales: 5 };
    // Without a planned loss nothing presses him, whatever the cash.
    lossOf(w, -1n);
    w.cash = '0';
    expect(wagePressure(w)).toMatchObject({ level: 0 });
    expect(wagePressure(w).seasons).toBeUndefined();
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
