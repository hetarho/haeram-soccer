import { describe, expect, it } from 'vitest';
import type { PolicyLevel, World } from '../../contracts/src/types';
import { validateWorld } from '../../contracts/src/index';
import { COUNTRIES, LOAD_CATALOG, footballIndex } from '../../catalogs/src/index';
import {
  advanceRound,
  assessOperatingExpenses,
  closeSeason,
  clubOf,
  EXPENSE_CONFIG,
  financeProjection,
  fixedCostRunway,
  footballQuote,
  lastSeasonTurnover,
  leagueShare,
  moneyLabel,
  operate,
  operatingCost,
  operatingCosts,
  operatingExpensesAt,
  POLICY_DEFAULTS,
  quote,
  ratio,
  roundShare,
  seasonOperatingExpenses,
  settleRound,
  SUPPORT_EXPENSES,
} from './index';
import { professionalStart } from './testing';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { FOUNDING, world } from './finance.testkit';

describe('operating expenses (→ECON-30)', () => {
  const entries = (w: World) =>
    w.events.filter((e) => e.year === w.year && e.kind === 'operating-expenses');

  it('floors each division on the football index, the amateur level lowest', () => {
    for (const profile of COUNTRIES) {
      const table = EXPENSE_CONFIG.floor[profile.code];
      // Every professional division and the amateur league below them.
      expect(table).toHaveLength(profile.groups.length + 1);
      for (let tier = 1; tier < table.length; tier++)
        expect(table[tier]).toBeLessThan(table[tier - 1]);
      for (let tier = 0; tier < table.length; tier++)
        expect(BigInt(operatingExpensesAt(profile.code, 2010, tier))).toBe(
          BigInt(footballQuote(profile.code, 2010, table[tier])),
        );
    }
    const units = EXPENSE_CONFIG.floor.ENG[0];
    // Before commercialisation the index is prices; from it, football money outgrows prices.
    expect(operatingExpensesAt('ENG', 1950, 0)).toBe(quote('ENG', 1950, units));
    expect(footballIndex('ENG', 2010).real).toBeGreaterThan(1);
    expect(BigInt(operatingExpensesAt('ENG', 2010, 0))).toBeGreaterThan(
      BigInt(quote('ENG', 2010, units)),
    );
  });

  it('records the floor for a club’s first season and pays the recorded amount', () => {
    const w = world(),
      own = clubOf(w);
    // Founded in the amateur league with no completed season: the amateur floor.
    expect(lastSeasonTurnover(w)).toBeUndefined();
    expect(w.operatingExpenses).toBe(operatingExpensesAt('ENG', w.year, own.tier));
    expect(seasonOperatingExpenses(w)).toBe(w.operatingExpenses);
    expect(operatingCosts(w).expenses).toBe(w.operatingExpenses);
    // A professional start is a first season too, at that division's floor.
    const pro = professionalStart(world());
    expect(pro.operatingExpenses).toBe(operatingExpensesAt('ENG', pro.year, clubOf(pro).tier));
    // Fixed costs read the recorded amount, not whatever division or year the club is in later.
    own.tier = 0;
    const late = { ...w, year: 2010 };
    expect(operatingCosts(late).expenses).toBe(w.operatingExpenses);
    expect(operatingCosts({ ...w, operatingExpenses: '123456' }).expenses).toBe('123456');
  });

  it('counts them in the cash warning and the bankruptcy threshold', () => {
    const start = (support: PolicyLevel = 3) => {
      const w = world();
      if (support !== 3) w.policy = { ...POLICY_DEFAULTS, support };
      w.round = 1;
      const cost = operatingCosts(w, 1),
        share = BigInt(roundShare(leagueShare(w), 1));
      // Cash before the round that leaves `after` once its costs and installments are settled.
      const settle = (after: bigint) => {
        w.cash = (after + BigInt(cost.nextRound) - share).toString();
        settleRound(w);
        expect(BigInt(w.cash)).toBe(after);
        return w;
      };
      return { w, cost, settle };
    };
    // Covering 13 rounds of every fixed cost but the expenses still warns.
    const warned = start(),
      perRound = BigInt(warned.cost.nextRound);
    expect(BigInt(warned.cost.payments.expenses)).toBeGreaterThan(0n);
    warned.settle(perRound * 13n - 1n);
    expect(warned.w.events.some((e) => e.kind === 'cash-warning')).toBe(true);
    expect(warned.w.inbox!.at(-1)!.detail).toContain(moneyLabel(warned.w, warned.cost.nextRound));
    // Debt within half a year of every fixed cost, expenses included, is not yet bankruptcy.
    const annual = BigInt(warned.cost.annual),
      without = annual - BigInt(warned.cost.expenses);
    const inDebt = start().settle(-(without / 2n + 1n));
    expect(inDebt.bankrupt).toBeUndefined();
    expect(inDebt.insolvent).toBe(1);
    const beyond = start().settle(-(annual / 2n + 1n));
    expect(beyond.bankrupt).toBeDefined();
    // Both count them at the squad investment's factor (→ECON-16): ×1.2 needs more rounds' cash
    // and allows a deeper debt than the default level.
    const generous = start(5),
      dearer = BigInt(generous.cost.nextRound);
    expect(dearer).toBeGreaterThan(perRound);
    expect(
      start()
        .settle(perRound * 13n)
        .events.some((e) => e.kind === 'cash-warning'),
    ).toBe(false);
    generous.settle(perRound * 13n);
    expect(generous.w.events.some((e) => e.kind === 'cash-warning')).toBe(true);
    expect(generous.w.inbox!.at(-1)!.detail).toContain(moneyLabel(generous.w, dearer.toString()));
    expect(BigInt(generous.cost.annual) / 2n).toBeGreaterThan(annual / 2n + 1n);
    expect(start(5).settle(-(annual / 2n + 1n)).bankrupt).toBeUndefined();
  });

  it("squad investment scales each round's operating expenses and the runway", () => {
    const w = professionalStart(world()),
      season = w.operatingExpenses!;
    w.cash = (BigInt(operatingCosts(w).annual) * 2n).toString();
    const at = (support: PolicyLevel) => ({ ...w, policy: { ...POLICY_DEFAULTS, support } }),
      standard = operatingCosts(at(3));
    for (const support of [1, 2, 3, 4, 5] as const) {
      const factor = SUPPORT_EXPENSES[support - 1],
        costs = operatingCosts(at(support));
      // The recorded season amount stays; the year's operating expenses scale (→ECON-30).
      expect(costs).toMatchObject({ seasonExpenses: season, operatingFactor: factor });
      expect(costs.expenses).toBe(ratio(season, BigInt(Math.round(factor * 100)), 100n));
      expect(costs.payments.expenses).toBe(roundShare(costs.expenses, 1));
      // Only the operating expenses move: wages, upkeep and policy spend are as at the default.
      expect(BigInt(costs.annual) - BigInt(standard.annual)).toBe(
        BigInt(costs.expenses) - BigInt(season),
      );
      // Fixed costs and the runway count them (→ECON-12).
      expect(operatingCost(at(support))).toBe(costs.annual);
    }
    const runway = (support: PolicyLevel) => fixedCostRunway(w.cash, operatingCost(at(support)));
    expect(runway(3)).toBe(92);
    expect(runway(5)).toBeLessThan(runway(4));
    expect(runway(4)).toBeLessThan(runway(3));
    expect(runway(1)).toBeGreaterThan(runway(3));

    // Each round books its share at the factor in force at that settlement; a change acts from the
    // next one and leaves the recorded season amount as it is.
    operate(w, { type: 'policy', key: 'support', level: 5 });
    advanceRound(w, undefined, false);
    const first = roundShare(operatingCosts(at(5)).expenses, 1);
    expect(entries(w)).toHaveLength(1);
    expect(entries(w)[0].amount).toBe(first);
    expect(BigInt(first)).toBeGreaterThan(BigInt(roundShare(season, 1)));
    expect(entries(w)[0].detail).toContain('선수단 투자 ×1.2');
    operate(w, { type: 'policy', key: 'support', level: 1 });
    advanceRound(w, undefined, false);
    const second = roundShare(operatingCosts(at(1)).expenses, 2);
    expect(entries(w)[0].amount).toBe((BigInt(first) + BigInt(second)).toString());
    expect(BigInt(second)).toBeLessThan(BigInt(roundShare(season, 2)));
    expect(entries(w)[0].detail).toContain('선수단 투자 ×0.9');
    expect(w.operatingExpenses).toBe(season);
  });

  /** The configured share of a turnover (→ECON-30). */
  const shareOf = (turnover: string) =>
    ratio(turnover, BigInt(Math.round(EXPENSE_CONFIG.share * 10000)), 10000n);
  it('raises the floor from the first round after a promotion', () => {
    const amateur = clubOf(world()).tier,
      w = simulatedWorld(FOUNDING, { rounds: 46 }, DISABLED_RELEASE);
    const before = operatingCosts(w).expenses;
    expect(entries(w)[0].amount).toBe(before);
    // The amateur champions go up into the last professional division, after a season whose
    // income is left out of the ledger so its turnover's share stays below the new floor.
    w.tables[w.playerClub].points = 999;
    w.events = w.events.filter(
      (e) =>
        e.year !== w.year ||
        !(
          ['gate', 'league-share', 'match-bonus', 'cup-prize'].includes(e.kind) ||
          e.kind.startsWith('sponsor:')
        ),
    );
    w.income = '0';
    closeSeason(w);
    const tier = clubOf(w).tier;
    expect(tier).toBe(amateur - 1);
    const floor = operatingExpensesAt('ENG', w.year, tier);
    expect(BigInt(floor)).toBeGreaterThan(BigInt(operatingExpensesAt('ENG', w.year, amateur)));
    expect(BigInt(shareOf(lastSeasonTurnover(w)!))).toBeLessThan(BigInt(floor));
    expect(w.operatingExpenses).toBe(floor);
    expect(operatingCosts(w).expenses).toBe(floor);
    expect(financeProjection(w).seasonLines.find((line) => line.key === 'expenses')).toMatchObject({
      label: '운영 경비',
      amount: `-${floor}`,
    });
    advanceRound(w, undefined, false);
    expect(entries(w)).toHaveLength(1);
    expect(entries(w)[0].amount).toBe(roundShare(floor, 1));
  });

  describe('after a completed season', () => {
    // One played season, closed with extra ledger entries of its final round.
    const close = (extra: Record<string, bigint> = {}) => {
      const w = simulatedWorld(FOUNDING, { rounds: 46 }, DISABLED_RELEASE);
      for (const [kind, amount] of Object.entries(extra)) {
        w.events.push({
          year: w.year,
          round: 46,
          kind,
          title: kind,
          detail: '',
          amount: amount.toString(),
          currency: w.currency,
        });
        w.income = (BigInt(w.income) + amount).toString();
        w.cash = (BigInt(w.cash) + amount).toString();
      }
      closeSeason(w);
      return w;
    };
    const floorOf = (w: World) => operatingExpensesAt('ENG', w.year, clubOf(w).tier);

    it('pays the share of a high turnover instead of the floor', () => {
      const plain = close(),
        rich = close({ 'cup-prize': 50_000_000n });
      // The season's ledger income, nothing left out.
      const turnover = lastSeasonTurnover(rich)!;
      expect(turnover).toBe(rich.history.at(-1)!.income);
      expect(BigInt(turnover)).toBe(BigInt(lastSeasonTurnover(plain)!) + 50_000_000n);
      expect(BigInt(shareOf(turnover))).toBeGreaterThan(BigInt(floorOf(rich)));
      expect(rich.operatingExpenses).toBe(shareOf(turnover));
      expect(operatingCosts(rich).expenses).toBe(rich.operatingExpenses);
      advanceRound(rich, undefined, false);
      expect(entries(rich)[0].detail).toContain(
        `직전 시즌 매출의 ${Math.round(EXPENSE_CONFIG.share * 100)}%`,
      );
      expect(entries(rich)[0].amount).toBe(roundShare(rich.operatingExpenses!, 1));
    });

    it('pays the division amount in a season after a relegation', () => {
      const rich = close({ 'cup-prize': 50_000_000n });
      expect(rich.operatingExpenses).toBe(shareOf(lastSeasonTurnover(rich)!));
      // The same close, as if last season had been played a division higher.
      const relegated = structuredClone(rich);
      relegated.history.at(-1)!.tier = clubOf(relegated).tier - 1;
      expect(assessOperatingExpenses(relegated)).toBe(floorOf(relegated));
      // Promoted from below, the turnover's share still counts.
      const promoted = structuredClone(rich);
      promoted.history.at(-1)!.tier = clubOf(promoted).tier + 1;
      expect(assessOperatingExpenses(promoted)).toBe(rich.operatingExpenses);
    });

    it('leaves player sales, compensation and owner capital out of the turnover', () => {
      const plain = close(),
        sold = close({
          'transfer-out': 40_000_000n,
          'free-transfer-compensation': 20_000_000n,
          support: 30_000_000n,
        });
      expect(BigInt(sold.history.at(-1)!.income)).toBe(
        BigInt(plain.history.at(-1)!.income) + 90_000_000n,
      );
      expect(lastSeasonTurnover(sold)).toBe(lastSeasonTurnover(plain));
      expect(sold.operatingExpenses).toBe(plain.operatingExpenses);
      expect(plain.operatingExpenses).toBe(assessOperatingExpenses(plain));
    });

    it('converts last season’s turnover when the currency changed at the close', () => {
      const w = close({ 'cup-prize': 50_000_000n });
      // The same season as if it had been the last of pre-decimal pounds (240 pence) before the
      // new penny (100): every amount carried at 100/240.
      const decimal = { ...w, currency: 'GBP', year: 1971 };
      decimal.history = [...w.history.slice(0, -1), { ...w.history.at(-1)!, year: 1970 }];
      decimal.events = w.events.map((e) => (e.year === w.year - 1 ? { ...e, year: 1970 } : e));
      expect(lastSeasonTurnover(decimal)).toBe(ratio(lastSeasonTurnover(w)!, 100n, 240n));
    });

    it('loads a world saved without the amount at the floor of the division played now', () => {
      // As rules 1.15 saved it (and a 1.16 world from before the field).
      const load = (w: World) => {
        const legacy: World = { ...structuredClone(w), engine: '1.15.0' };
        delete legacy.operatingExpenses;
        return validateWorld(legacy, LOAD_CATALOG);
      };
      // A rich close, three rounds into its season, and that load's season played out.
      const { closed, rich, played } = cachedWorld('loaded-season', () => {
        const rich = close({ 'cup-prize': 50_000_000n });
        const closed = structuredClone(rich);
        for (let i = 0; i < 3; i++) advanceRound(rich, undefined, false);
        const played = load(rich);
        while (played.round < 46) advanceRound(played, undefined, false);
        return { closed, rich, played };
      });
      expect(BigInt(closed.operatingExpenses!)).toBeGreaterThan(BigInt(floorOf(closed)));
      const loaded = load(rich);
      expect(loaded.operatingExpenses).toBeUndefined();
      expect(seasonOperatingExpenses(loaded)).toBe(floorOf(rich));
      // Everything else reads as it did before the load: the floor is this season's amount.
      const atFloor = { ...structuredClone(rich), operatingExpenses: floorOf(rich) };
      expect(operatingCosts(loaded)).toEqual(operatingCosts(atFloor));
      expect(financeProjection(loaded)).toEqual(financeProjection(atFloor));
      // The amount survives a save, and only as money that is never negative.
      expect(validateWorld(structuredClone(rich)).operatingExpenses).toBe(rich.operatingExpenses);
      expect(() => validateWorld({ ...structuredClone(rich), operatingExpenses: '-1' })).toThrow();
      // The next season start records it from the turnover again.
      closeSeason(played);
      expect(played.operatingExpenses).toBe(assessOperatingExpenses(played));
    });
  });
});
