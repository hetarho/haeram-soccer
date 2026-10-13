import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { canonical } from '../../contracts/src/index';
import { COUNTRIES, broadcastingIndex, currency, footballIndex } from '../../catalogs/src/index';
import {
  advanceDays,
  advanceRound,
  broadcastQuote,
  careOffer,
  catchment,
  closeSeason,
  clubOf,
  createWorld,
  DISTRIBUTION_CONFIG,
  EXPENSE_CONFIG,
  financeProjection,
  financialBreakdown,
  footballQuote,
  gateProjection,
  leagueMerit,
  leagueShare,
  matchBonus,
  moneyLabel,
  operate,
  operatingCost,
  operatingCosts,
  operatingExpensesAt,
  parachutePayment,
  prepareSeason,
  quote,
  ratio,
  roundShare,
  settleLeagueMerit,
  settleRound,
  simulateMatch,
  simulateSeason,
  sponsorOffers,
} from './index';
import { professionalStart, sellPlayer } from './testing';
import { advanceEconomy } from './economy';

function world() {
  return createWorld({
    country: 'ENG',
    name: 'Budget Athletic',
    color: '#335544',
    seed: 'finance',
    difficulty: 2,
  });
}

describe('earned, auditable club finances', () => {
  it('earns a larger surplus from commercial choices in a season with identical sporting results', () => {
    const unmanaged = world();
    const managed = world();
    operate(managed, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    operate(managed, { type: 'ticket', price: 0.12 });
    operate(managed, { type: 'campaign', kind: 'outreach' });
    simulateSeason(unmanaged);
    simulateSeason(managed);
    const before = unmanaged.history[0];
    const after = managed.history[0];
    expect([after.won, after.drawn, after.lost, after.rank]).toEqual([
      before.won,
      before.drawn,
      before.lost,
      before.rank,
    ]);
    // The same results either way: the difference is the commercial choices alone, not luck.
    const plain = BigInt(before.income) - BigInt(before.expense);
    const commercial = BigInt(after.income) - BigInt(after.expense);
    const sponsored = managed.events
      .filter((event) => event.year === after.year && event.kind === 'sponsor:local')
      .reduce((sum, event) => sum + BigInt(event.amount!), 0n);
    expect(sponsored).toBeGreaterThan(0n);
    expect(commercial).toBeGreaterThan(plain);
    expect(commercial).toBeGreaterThan(0n);
    expect(managed.events.filter((event) => event.kind === 'support')).toEqual([]);
  });
  it('keeps a real deficit after expenses and currency/calendar progression without creating help', () => {
    const w = world();
    w.cash = '0';
    w.round = 1;
    const cost = operatingCosts(w, 1).nextRound;
    settleRound(w);
    // The league's share still arrives; debt counts rounds toward bankruptcy, never a freeze.
    const share = w.income;
    expect(share).toBe(roundShare(leagueShare(w), 1));
    expect(w.events.find((event) => event.kind === 'league-share')?.amount).toBe(share);
    expect(w.cash).toBe((BigInt(share) - BigInt(cost)).toString());
    expect(w.insolvent).toBe(1);
    expect(w.critical).toBeUndefined();
    expect(w.events.filter((event) => event.kind === 'support')).toEqual([]);
    w.round = 2;
    settleRound(w);
    expect(BigInt(w.cash)).toBeLessThan(BigInt(share) - BigInt(cost));
    expect(w.insolvent).toBe(2);
    expect(w.bankrupt).toBeUndefined();
    const cash = w.cash;
    w.year++;
    advanceEconomy(w, w.year - 1);
    expect(w.cash).toBe(cash);
    prepareSeason(w);
    advanceDays(w, 6, undefined, false);
    expect(w.cash).toBe(cash);
  });

  it('pays no league result bonus, keeps cup bonuses and the main sponsor’s league bonus, home and away', () => {
    const w = world();
    const fixture = w.fixtures.find((f) => f.home === w.playerClub)!;
    const record = simulateMatch(w, fixture, false, true).record;
    // The shirt-front slot opens in 1979 (→ECON-8); this 1950 club holds a contract as if it had.
    const offer = sponsorOffers(w, 'shirt').find((o) => o.kind === 'performance')!;
    w.sponsors = [
      {
        slot: 'shirt',
        name: offer.name,
        kind: offer.kind,
        annual: offer.annual,
        bonus: offer.bonus,
        from: w.year,
        until: offer.until,
        lastPaid: w.year - 1,
        index: offer.index,
      },
    ];
    const win = matchBonus(w, { ...record, score: { home: 2, away: 0 } });
    const draw = matchBonus(w, { ...record, score: { home: 1, away: 1 } });
    const loss = matchBonus(w, { ...record, score: { home: 0, away: 2 } });
    // League results earn the merit payment at the close instead (→ECON-19).
    expect([win.amount, draw.amount, loss.amount]).toEqual(['0', '0', '0']);
    expect(BigInt(win.sponsored)).toBeGreaterThan(BigInt(draw.sponsored));
    expect(BigInt(draw.sponsored)).toBeGreaterThan(0n);
    expect(loss.sponsored).toBe('0');
    const cup = { ...record, kind: 'cup' as const };
    const cupWin = matchBonus(w, { ...cup, score: { home: 2, away: 0 } });
    const cupDraw = matchBonus(w, { ...cup, score: { home: 1, away: 1 } });
    expect(BigInt(cupWin.amount)).toBeGreaterThan(BigInt(cupDraw.amount));
    expect(BigInt(cupDraw.amount)).toBeGreaterThan(0n);
    expect(cupWin.sponsored).toBe('0');
    expect(matchBonus(w, { ...cup, score: { home: 0, away: 2 } }).amount).toBe('0');
    expect(
      matchBonus(w, {
        ...cup,
        home: fixture.away,
        away: w.playerClub,
        score: { home: 0, away: 2 },
      }).amount,
    ).toBe(cupWin.amount);
  });

  it('earns sponsor money once per played league match instead of receiving a full annual grant', () => {
    const w = professionalStart(world());
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    const annual = w.sponsors![0].annual;
    const paid = (world: typeof w) =>
      world.events.filter((event) => event.kind === 'sponsor:local').map((event) => event.amount);
    expect(w.income).toBe('0');
    advanceDays(w, 6, undefined, false);
    expect(paid(w)).toEqual([]);
    advanceRound(w, undefined, false);
    expect(paid(w)).toHaveLength(1);
    expect(BigInt(paid(w)[0]!)).toBeLessThan(BigInt(annual) / 40n);
    while (w.round < 46) advanceRound(w, undefined, false);
    // One ledger entry of the season holds every installment, adding up to the annual amount.
    expect(paid(w)).toEqual([annual]);
    expect(w.sponsors![0].lastPaid).toBe(w.year);
    const oldSave = world();
    operate(oldSave, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    oldSave.sponsors![0].lastPaid = oldSave.year;
    advanceRound(oldSave, undefined, false);
    expect(paid(oldSave)).toEqual([]);
  });

  it('changes ticket demand, attendance and costs through actual operating decisions', () => {
    const w = world();
    const initial = gateProjection(w);
    const expensive = structuredClone(w);
    expensive.ticket = 0.5;
    expect(gateProjection(expensive).attendanceHigh).toBeLessThan(initial.attendanceLow);
    expect(BigInt(gateProjection(expensive).incomeHigh)).toBeLessThan(BigInt(initial.incomeLow));
    operate(w, { type: 'campaign', kind: 'tickets' });
    expect(gateProjection(w).attendanceLow).toBeGreaterThan(initial.attendanceLow);
    expect(BigInt(w.expense)).toBeGreaterThan(0n);
    // More local supporters fill more seats, up to the catchment.
    const followed = structuredClone(w);
    clubOf(followed).fans = Math.min(catchment(w), clubOf(w).fans * 2);
    expect(gateProjection(followed).attendanceLow).toBeGreaterThan(gateProjection(w).attendanceLow);
    // A bigger name than ours draws more, a smaller one fewer.
    const opponent = w.clubs.find(
      (c) => c.id === w.fixtures.find((f) => f.home === w.playerClub)!.away,
    )!;
    const famous = structuredClone(w),
      obscure = structuredClone(w);
    famous.clubs.find((c) => c.id === opponent.id)!.reputation = 90;
    obscure.clubs.find((c) => c.id === opponent.id)!.reputation = 1;
    expect(gateProjection(famous, undefined, opponent.id).attendanceHigh).toBeGreaterThan(
      gateProjection(w).attendanceHigh,
    );
    expect(gateProjection(obscure, undefined, opponent.id).attendanceHigh).toBeLessThan(
      gateProjection(w).attendanceHigh,
    );
    const homeFixture = w.fixtures.find((fixture) => fixture.home === w.playerClub)!;
    const record = simulateMatch(w, homeFixture, false, true).record;
    const winning = structuredClone(w);
    const losing = structuredClone(w);
    winning.ownMatches = [{ ...record, score: { home: 2, away: 0 } }];
    losing.ownMatches = [{ ...record, score: { home: 0, away: 2 } }];
    expect(gateProjection(winning).attendanceLow).toBeGreaterThan(
      gateProjection(losing).attendanceHigh,
    );
    const annual = operatingCost(w);
    operate(w, { type: 'facility' });
    expect(BigInt(operatingCost(w))).toBeGreaterThan(BigInt(annual));
    const player = w.players.find((p) => p.status === 'active' && p.role !== 'GK')!;
    const beforeSale = operatingCost(w);
    sellPlayer(w, player.id);
    expect(BigInt(operatingCost(w))).toBe(BigInt(beforeSale) - BigInt(player.wage));
  });

  it('shows explicit owner capital separately and does not clear an unresolved deficit', () => {
    const w = world();
    w.cash = '-999999999';
    w.critical = '운영자금이 부족합니다.';
    const before = BigInt(w.cash);
    operate(w, { type: 'support' });
    expect(BigInt(w.cash)).toBeGreaterThan(before);
    expect(BigInt(w.cash)).toBeLessThan(0n);
    expect(w.critical).toContain('운영자금');
    const budget = financialBreakdown(w);
    expect(budget.ownerInvestment).toBe(w.income);
    expect(budget.operatingIncome).toBe('0');
    expect(budget.operatingNet).toBe('0');
    expect(clubOf(w).reputation).toBe(10);
  });

  it('logs every receipt and expense, sums to the season books, and pays the merit once', () => {
    const w = world();
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    operate(w, { type: 'campaign', kind: 'outreach' });
    for (let round = 0; round < 8; round++) advanceRound(w, undefined, false);
    settleLeagueMerit(w, 1, 24);
    const snapshot = canonical(w);
    settleLeagueMerit(w, 1, 24);
    expect(canonical(w)).toBe(snapshot);
    const budget = financialBreakdown(w);
    expect(budget.income.reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(BigInt(w.income));
    expect(budget.expense.reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(
      BigInt(w.expense),
    );
    expect(budget.income.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(budget.expense.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(w.events.filter((event) => event.kind === 'operating-cost')).toHaveLength(8);
    expect(w.events.filter((event) => event.kind === 'match-cost').length).toBe(
      w.ownMatches.filter((match) => match.home === w.playerClub).length,
    );
    const bottom = world();
    settleLeagueMerit(bottom, 24, 24);
    expect(bottom.income).toBe('0');
  });

  it('names owner requests and win bonuses in the season ledger, leaving no catch-all line', () => {
    const w = world();
    operate(w, { type: 'care', kind: 'meeting' });
    operate(w, { type: 'care', kind: 'camp' });
    operate(w, { type: 'care', kind: 'friendly' });
    while (!w.events.some((event) => event.kind === 'win-bonus') && w.round < 46) {
      if (careOffer(w, 'win-bonus').available) operate(w, { type: 'care', kind: 'win-bonus' });
      advanceRound(w, undefined, false);
    }
    const total = (kind: string) =>
      w.events
        .filter((event) => event.kind === kind)
        .reduce((sum, event) => sum + BigInt(event.amount ?? '0'), 0n)
        .toString();
    expect(BigInt(total('care:camp'))).toBeGreaterThan(0n);
    expect(BigInt(total('care:friendly'))).toBeGreaterThan(0n);
    expect(BigInt(total('win-bonus'))).toBeGreaterThan(0n);
    const budget = financialBreakdown(w);
    const line = (rows: typeof budget.income, key: string) =>
      rows.find((row) => row.key === key)?.amount;
    expect(line(budget.expense, 'care')).toBe(total('care:camp'));
    expect(line(budget.income, 'care:friendly')).toBe(total('care:friendly'));
    expect(line(budget.expense, 'win-bonus')).toBe(total('win-bonus'));
    expect(budget.income.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(budget.expense.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(budget.income.reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(BigInt(w.income));
    expect(budget.expense.reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(
      BigInt(w.expense),
    );
  });

  it('books renewals and hires the delegated staff make at the close to the new season', () => {
    const w = world();
    w.cash = '999999999';
    w.delegation = { ...w.delegation, staff: true };
    // A paid coach whose contract ends at this close; the volunteers' terms end too.
    w.staff = w.staff!.map((member) =>
      member.role === 'attack'
        ? { ...member, ability: 90, wage: quote(clubOf(w).country, w.year, 90), until: w.year + 1 }
        : member,
    );
    simulateSeason(w);
    const renewal = w.events.find((event) => event.kind === 'staff-renew')!;
    expect(renewal.year).toBe(w.year);
    expect(BigInt(renewal.amount!)).toBeGreaterThan(0n);
    const budget = financialBreakdown(w);
    const line = (key: string) => budget.expense.find((row) => row.key === key)?.amount;
    expect(line('staff-renew')).toBe(renewal.amount);
    expect(BigInt(line('staff-hire')!)).toBeGreaterThan(0n);
    expect(budget.income.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(budget.expense.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(budget.expense.reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(
      BigInt(w.expense),
    );
  });

  it('writes money in the one notation of the app', () => {
    const spain = createWorld({
      country: 'ESP',
      name: 'Notation CF',
      color: '#335544',
      seed: 'notation',
      difficulty: 2,
    });
    const euro = { ...spain, year: 2001 },
      sterling = { ...world(), year: 1950 };
    const eur = (euros: number) => moneyLabel(euro, String(Math.round(euros * 100)));
    expect(moneyLabel(euro, '9999999')).toBe('€99,999');
    expect(eur(100_000)).toBe('€100K');
    expect(eur(123_456.78)).toBe('€123K');
    expect(eur(1_234_567)).toBe('€1.23M');
    expect(eur(12_345_678)).toBe('€12.3M');
    expect(eur(999_999_999)).toBe('€999M');
    expect(eur(1_500_000_000)).toBe('€1.50B');
    expect(eur(-1_500_000)).toBe('−€1.50M');
    expect(moneyLabel(sterling, String(12_345 * 240))).toBe('£12,345');
    expect(moneyLabel(sterling, String(1_234_567 * 240))).toBe('£1.23M');
  });
});

describe('the league distribution', () => {
  it('pays the division’s equal share in league-round installments that sum to the season’s share', () => {
    const w = professionalStart(world());
    const share = leagueShare(w);
    expect(BigInt(share)).toBeGreaterThan(0n);
    while (w.round < 46) advanceRound(w, undefined, false);
    // One ledger entry a season, grown by every round's installment.
    const entries = w.events.filter((e) => e.year === w.year && e.kind === 'league-share');
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(share);
    expect(financialBreakdown(w).income.find((row) => row.key === 'league-share')).toMatchObject({
      label: '리그 분배금',
      amount: share,
    });
  });

  it('shares more in higher divisions of every country, priced on the broadcasting index', () => {
    for (const profile of COUNTRIES) {
      const table = DISTRIBUTION_CONFIG.share[profile.code];
      // Every professional division and the amateur league below them.
      expect(table).toHaveLength(profile.groups.length + 1);
      for (let tier = 1; tier < table.length; tier++)
        expect(table[tier]).toBeLessThan(table[tier - 1]);
    }
    const late = { ...world(), year: 2010 },
      units = DISTRIBUTION_CONFIG.share.ENG[0];
    expect(broadcastingIndex('ENG', 2010).real).toBeGreaterThan(footballIndex('ENG', 2010).real);
    expect(leagueShare(late, 0)).toBe(broadcastQuote('ENG', 2010, units));
    expect(BigInt(leagueShare(late, 0))).toBeGreaterThan(BigInt(footballQuote('ENG', 2010, units)));
    // Before television the league's money is a small fraction of prices.
    const early = { ...world(), year: 1955 };
    expect(BigInt(leagueShare(early, 0)) * 4n).toBeLessThan(BigInt(quote('ENG', 1955, units)));
  });

  it('scales the top-flight share, merit and parachute from 1955 to 2005 by the broadcasting index', () => {
    // In pounds, so the pre-decimal penny (240 a pound) and the new penny compare.
    const pounds = (amount: string, year: number) =>
      Number(BigInt(amount)) / currency('ENG', year).units;
    const at = (year: number) => {
      const w = { ...world(), year };
      clubOf(w).tier = 0;
      return w;
    };
    const growth = (index: typeof footballIndex) =>
      index('ENG', 2005).value / index('ENG', 1955).value;
    const broadcasting = growth(broadcastingIndex),
      football = growth(footballIndex);
    // The two indices tell very different stories over these fifty years.
    expect(broadcasting / football).toBeGreaterThan(10);
    const scaled = (money: (w: World) => string) =>
      pounds(money(at(2005)), 2005) / pounds(money(at(1955)), 1955);
    expect(scaled((w) => leagueShare(w)) / broadcasting).toBeCloseTo(1, 4);
    expect(scaled((w) => leagueMerit(w, 1, 20)) / broadcasting).toBeCloseTo(1, 4);
    // A club relegated from the top flight into the second tier keeps half the share it lost.
    const relegated = (year: number) => {
      const w = at(year);
      clubOf(w).tier = 1;
      w.history = [{ year: year - 1, tier: 0 } as World['history'][number]];
      return parachutePayment(w);
    };
    expect(pounds(relegated(1955), 1955)).toBeGreaterThan(0);
    expect(
      pounds(relegated(2005), 2005) / pounds(relegated(1955), 1955) / broadcasting,
    ).toBeCloseTo(1, 4);
  });

  it('orders the merit by final position, the champion taking 1.6× the bottom club up top and 1.3× below', () => {
    const top = world(),
      below = world();
    clubOf(top).tier = 0;
    clubOf(below).tier = 1;
    for (const [w, champion] of [
      [top, 1.6],
      [below, 1.3],
    ] as const) {
      const clubs = 20,
        share = BigInt(leagueShare(w));
      const merits = Array.from({ length: clubs }, (_, i) => BigInt(leagueMerit(w, i + 1, clubs)));
      for (let i = 1; i < clubs; i++) expect(merits[i]).toBeLessThan(merits[i - 1]);
      expect(merits[clubs - 1]).toBe(0n);
      expect(Number(share + merits[0]) / Number(share)).toBeCloseTo(champion, 5);
    }
  });

  it('keeps half the lost share for the one season after a relegation', () => {
    const w = world();
    simulateSeason(w);
    // The season just closed was played a division higher: the club went down into this one.
    const tier = clubOf(w).tier,
      last = w.history.length - 1;
    w.history[last] = { ...w.history[last], tier: tier - 1 };
    const lost = BigInt(leagueShare(w, tier - 1)) - BigInt(leagueShare(w, tier));
    const parachute = ratio(lost.toString(), 500n, 1000n);
    expect(BigInt(parachute)).toBeGreaterThan(0n);
    expect(parachutePayment(w)).toBe(parachute);
    const line = financeProjection(w).seasonLines.find((row) => row.key === 'parachute');
    expect(line).toMatchObject({ label: '강등 보전금', amount: parachute });
    while (w.round < 46) advanceRound(w, undefined, false);
    const paid = w.events.filter((e) => e.year === w.year && e.kind === 'parachute');
    expect(paid).toHaveLength(1);
    expect(paid[0].amount).toBe(parachute);
    expect(financialBreakdown(w).income.find((row) => row.key === 'parachute')?.amount).toBe(
      parachute,
    );
    // One season only; staying up or going up pays none.
    expect(parachutePayment({ ...w, year: w.year + 1 })).toBe('0');
    for (const before of [tier, tier + 1]) {
      const other = structuredClone(w);
      other.history[last].tier = before;
      expect(parachutePayment(other)).toBe('0');
      expect(financeProjection(other).lines.some((row) => row.key === 'parachute')).toBe(false);
    }
  });
});

describe('operating expenses (→ECON-30)', () => {
  const entries = (w: World) =>
    w.events.filter((e) => e.year === w.year && e.kind === 'operating-expenses');

  it('charges each division its own amount on the football index, the amateur level least', () => {
    for (const profile of COUNTRIES) {
      const table = EXPENSE_CONFIG[profile.code];
      // Every professional division and the amateur league below them.
      expect(table).toHaveLength(profile.groups.length + 1);
      for (let tier = 1; tier < table.length; tier++)
        expect(table[tier]).toBeLessThan(table[tier - 1]);
      for (let tier = 0; tier < table.length; tier++)
        expect(BigInt(operatingExpensesAt(profile.code, 2010, tier))).toBe(
          BigInt(footballQuote(profile.code, 2010, table[tier])),
        );
    }
    const units = EXPENSE_CONFIG.ENG[0];
    // Before commercialisation the index is prices; from it, football money outgrows prices.
    expect(operatingExpensesAt('ENG', 1950, 0)).toBe(quote('ENG', 1950, units));
    expect(footballIndex('ENG', 2010).real).toBeGreaterThan(1);
    expect(BigInt(operatingExpensesAt('ENG', 2010, 0))).toBeGreaterThan(
      BigInt(quote('ENG', 2010, units)),
    );
    // A club pays its own division's amount, in its season's money.
    const w = world(),
      own = clubOf(w);
    expect(operatingCosts(w).expenses).toBe(operatingExpensesAt('ENG', w.year, own.tier));
    own.tier = 0;
    const late = { ...w, year: 2010 };
    expect(operatingCosts(late).expenses).toBe(operatingExpensesAt('ENG', 2010, 0));
  });

  it('pays them each league round as a fixed cost on their own ledger line', () => {
    const w = professionalStart(world()),
      costs = operatingCosts(w);
    expect(BigInt(costs.annual)).toBe(
      [
        costs.playerWages,
        costs.managerWage,
        costs.maintenance,
        costs.marketing,
        costs.academy,
        costs.staffWages,
        costs.expenses,
      ].reduce((sum, part) => sum + BigInt(part), 0n),
    );
    // Fixed costs and the runway read the annual total.
    expect(operatingCost(w)).toBe(costs.annual);
    expect(costs.payments.expenses).toBe(roundShare(costs.expenses, 1));
    while (w.round < 46) advanceRound(w, undefined, false);
    // One ledger entry a season, grown by every round's installment.
    expect(entries(w)).toHaveLength(1);
    expect(entries(w)[0].amount).toBe(costs.expenses);
    const budget = financialBreakdown(w);
    expect(budget.expense.find((row) => row.key === 'operating-expenses')).toMatchObject({
      label: '운영 경비',
      amount: costs.expenses,
    });
    expect(budget.expense.some((row) => row.key === 'older-ledger')).toBe(false);
  });

  it('counts them in the cash warning and the bankruptcy threshold', () => {
    const start = () => {
      const w = world();
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
  });

  it('follows the division played this season, so a promotion changes them from the first round', () => {
    const w = world(),
      amateur = clubOf(w).tier;
    while (w.round < 46) advanceRound(w, undefined, false);
    const before = operatingCosts(w).expenses;
    expect(entries(w)[0].amount).toBe(before);
    // The amateur champions go up into the last professional division.
    w.tables[w.playerClub].points = 999;
    closeSeason(w);
    const tier = clubOf(w).tier;
    expect(tier).toBe(amateur - 1);
    const expenses = operatingExpensesAt('ENG', w.year, tier);
    expect(BigInt(expenses)).toBeGreaterThan(BigInt(operatingExpensesAt('ENG', w.year, amateur)));
    expect(operatingCosts(w).expenses).toBe(expenses);
    expect(financeProjection(w).seasonLines.find((line) => line.key === 'expenses')).toMatchObject({
      label: '운영 경비',
      amount: `-${expenses}`,
    });
    advanceRound(w, undefined, false);
    expect(entries(w)).toHaveLength(1);
    expect(entries(w)[0].amount).toBe(roundShare(expenses, 1));
  });
});
