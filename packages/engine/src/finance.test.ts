import { legacySettings } from './responsibilities';
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
  clubOf,
  createWorld,
  DISTRIBUTION_CONFIG,
  financialBreakdown,
  footballQuote,
  gateProjection,
  INCOME_KINDS,
  isIncomeKind,
  leagueMerit,
  leagueShare,
  matchBonus,
  moneyLabel,
  operate,
  operatingCost,
  operatingCosts,
  parachutePayment,
  prepareSeason,
  progressFacilityWorks,
  quote,
  roundShare,
  settleLeagueMerit,
  settleRound,
  simulateMatch,
  simulateSeason,
  sponsorOffers,
} from './index';
import { sellPlayer } from './testing';
import { advanceEconomy } from './economy';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { world } from './finance.testkit';

describe('earned, auditable club finances', () => {
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

  it('changes ticket demand, attendance and costs through actual operating decisions', () => {
    const w = world();
    const initial = gateProjection(w);
    const expensive = structuredClone(w);
    expensive.ticket = 0.5;
    expect(gateProjection(expensive).attendanceHigh).toBeLessThan(initial.attendanceLow);
    expect(BigInt(gateProjection(expensive).incomeHigh)).toBeLessThan(BigInt(initial.incomeLow));
    // 주변 투자 lifts home demand while it is paid with the operating costs (→ECON-34).
    operate(w, { type: 'policy', key: 'localInvest', level: 3 });
    expect(gateProjection(w).attendanceLow).toBeGreaterThan(initial.attendanceLow);
    expect(BigInt(operatingCosts(w).investment)).toBeGreaterThan(0n);
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
    // A training ground level adds upkeep once its work is done (→ECON-32).
    w.cash = '100000000';
    operate(w, { type: 'facility', part: 'training' });
    expect(operatingCost(w)).toBe(annual);
    w.facilityWorks!.training!.day -= 90;
    progressFacilityWorks(w);
    expect(BigInt(operatingCost(w))).toBeGreaterThan(BigInt(annual));
    const player = w.players.find((p) => p.status === 'active' && p.position !== 'GK')!;
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
    const w = cachedWorld('sponsored-8-rounds', () => {
      const w = world();
      operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
      operate(w, { type: 'policy', key: 'localInvest', level: 2 });
      for (let round = 0; round < 8; round++) advanceRound(w, undefined, false);
      return w;
    });
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
    const w = cachedWorld('owner-requests', () => {
      const w = world();
      operate(w, { type: 'care', kind: 'meeting' });
      operate(w, { type: 'care', kind: 'camp' });
      operate(w, { type: 'care', kind: 'friendly' });
      while (!w.events.some((event) => event.kind === 'win-bonus') && w.round < 46) {
        if (careOffer(w, 'win-bonus').available) operate(w, { type: 'care', kind: 'win-bonus' });
        advanceRound(w, undefined, false);
      }
      return w;
    });
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

  it('isIncomeKind accepts every income kind and no expense kind', () => {
    const budget = financialBreakdown(world()),
      keys = (rows: typeof budget.income) =>
        rows.map((row) => row.key).filter((key) => key !== 'older-ledger');
    expect(keys(budget.income)).toEqual(INCOME_KINDS);
    expect(INCOME_KINDS).toEqual(
      expect.arrayContaining([
        'gate',
        'sponsor:local',
        'sponsor:shirt',
        'care:friendly',
        'support',
      ]),
    );
    for (const kind of INCOME_KINDS) expect(isIncomeKind(kind)).toBe(true);
    expect(keys(budget.expense).length).toBeGreaterThan(0);
    for (const kind of keys(budget.expense)) expect(isIncomeKind(kind)).toBe(false);
    // Paid owner requests book to the expense line `care`; only the friendly earns.
    for (const kind of ['care:meeting', 'care:camp', 'toString', ''])
      expect(isIncomeKind(kind)).toBe(false);
  });

  it('books renewals and hires the delegated staff make at the close to the new season', () => {
    // The season's league rounds are played ahead; the close runs here.
    const w = cachedWorld('delegated-staff-before-close', () => {
      const w = world();
      w.cash = '999999999';
      w.intervention = 4;
      w.settings = legacySettings(4);
      // Paid coaches whose contracts end at this close: the ablest one the staff keep (no candidate
      // is 3 better), the other no longer meets 코치 기조 최고 수준 and is replaced.
      w.direction = { coaches: 'elite' };
      w.staff = w.staff!.map((member) =>
        member.role === 'attack'
          ? {
              ...member,
              ability: 90,
              wage: quote(clubOf(w).country, w.year, 90),
              until: w.year + 1,
            }
          : member.role === 'defense'
            ? {
                ...member,
                ability: 40,
                wage: quote(clubOf(w).country, w.year, 15),
                until: w.year + 1,
              }
            : member,
      );
      while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
      return w;
    });
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
      level: 'easy' as const,
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
    // Before television paid the league its money follows prices.
    const early = { ...world(), year: 1955 };
    expect(Number(leagueShare(early, 0)) / Number(quote('ENG', 1955, units))).toBeCloseTo(1, 3);
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
    expect(broadcasting / football).toBeGreaterThan(5);
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
});
