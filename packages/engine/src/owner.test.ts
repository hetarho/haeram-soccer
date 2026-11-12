import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { MatchRecord, OwnerTrait, TransferFact, World } from '../../contracts/src/types';
import { operate } from './operations';
import { advanceEconomy } from './economy';
import {
  businessChance,
  ffpRoom,
  hasOwner,
  livingCost,
  nextSettlement,
  OWNER_PENDING_MESSAGE,
  ownerClose,
  ownerDay,
  ownerSettleGap,
  seasonLivingCost,
  settlementDays,
  stakeAmount,
} from './owner';
import { FFP, OWNER_BUSINESS, OWNER_LIVING, OWNER_SETTLEMENTS, OWNER_TRAITS } from './owner-config';
import { SEASON_END_DAY, seasonDayOf } from './calendar';
import { clubOf } from './player-state';
import { quote } from './quotes';
import { ratio, scaleBy } from './primitives';
import { financialBreakdown, seasonResult, seasonTurnover } from './finance';
import {
  fanMoodAfterLeagueMatch,
  fanMoodClose,
  fanMoodIdentity,
  fanMoodRound,
  fanMoodTransfer,
} from './fan-mood';
import { withOwner } from './testing';
import { careerWorld } from './career.testkit';

/** A career taken over; its owner state is the takeover's until a test sets its own. */
const world = () => careerWorld({ seed: 'owner-foundation' });
/** A career with no owner state, as a hand-built world holds it: every owner rule stands aside. */
const unowned = () => {
  const w = world();
  delete w.owner;
  return w;
};

const OWNER_COMMANDS = [
  { type: 'owner-stake', percent: 20 },
  { type: 'owner-inject', amount: '1000' },
  { type: 'owner-dividend', share: 50 },
] as const;

describe('owner commands (→OWNER-7/9/11)', () => {
  it.each(OWNER_COMMANDS)('refuses $type while the career has no owner', (cmd) => {
    const w = unowned(),
      before = canonical(w);
    expect(() => operate(w, cmd)).toThrow(OWNER_PENDING_MESSAGE);
    expect(canonical(w)).toBe(before);
  });
});

describe('owner hooks without an owner', () => {
  it('return at once and change nothing in a career with no owner state', () => {
    const w = unowned(),
      before = canonical(w);
    // The hooks never read their facts without an owner, so stand-ins serve.
    const result = { id: 'league:1', home: w.playerClub } as MatchRecord,
      fact = { direction: 'in', player: w.players[0]!.id, fee: '1' } as TransferFact;
    ownerDay(w);
    ownerClose(w);
    ownerSettleGap(w, { year: w.year, day: 0 }, { year: w.year + 7, day: 0 });
    fanMoodAfterLeagueMatch(w, result);
    fanMoodRound(w);
    fanMoodClose(w);
    fanMoodTransfer(w, fact);
    fanMoodIdentity(w);
    expect(canonical(w)).toBe(before);
  });
  it('treats a career as owned, its owner state or none, and only an ownerless world as nobody’s', () => {
    expect(hasOwner(world())).toBe(true);
    const w = unowned();
    expect(hasOwner(w)).toBe(true);
    expect(hasOwner({ playerClub: '' })).toBe(false);
  });
});

describe('a currency change (→ECON-6)', () => {
  it('converts the fortune, the FFP injections and the loan once, keeping the takeover facts', () => {
    const w = world();
    // 240 old pence to the pound became 100 new pence in 1971.
    w.year = 1970;
    w.currency = 'GBP-LSD';
    const owner = withOwner(w, {
      fortune: '-24000',
      ffpInjections: [{ season: 1969, amount: '4800' }],
    });
    w.loan = { balance: '48000', installment: '9600', seasonsLeft: 4 };
    const takeover = structuredClone(owner.takeover);
    w.year = 1971;
    advanceEconomy(w, 1970);
    expect(w.currency).toBe('GBP');
    expect(w.owner!.fortune).toBe('-10000');
    expect(w.owner!.ffpInjections).toEqual([{ season: 1969, amount: '2000' }]);
    expect(w.loan).toEqual({ balance: '20000', installment: '4000', seasonsLeft: 4 });
    expect(w.owner!.takeover).toEqual(takeover);
    // Exactly once: the same money again converts nothing more.
    const after = canonical(w);
    advanceEconomy(w, 1970);
    expect(canonical(w)).toBe(after);
  });
});

/**
 * A taken-over career in `year`: the founded world with an owner's state and `fortune`, his
 * starting fortune 10,000,000 so each settlement's living costs are 25,000 at takeover prices.
 */
function ownerWorld(year = 1950, fortune?: string) {
  const w = world();
  w.year = year;
  if (year >= 1971) w.currency = 'GBP';
  const owner = withOwner(w, fortune === undefined ? {} : { fortune });
  owner.takeover.fortune = '10000000';
  w.income = '0';
  w.expense = '0';
  return w;
}
const kinds = (w: World, kind: string) => w.events.filter((e) => e.kind === kind);
const on = (w: World, day: number) => {
  w.calendar = { day };
  ownerDay(w);
};

describe('the business settlements (→OWNER-7/8)', () => {
  const MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  it('settle on the 1st of each month from September to June, and nowhere else in the season', () => {
    const w = ownerWorld();
    operate(w, { type: 'owner-stake', percent: 10 });
    for (let day = 0; day <= SEASON_END_DAY; day++) on(w, day);
    const days = MONTHS.map((month) => seasonDayOf(1950, month, 1));
    expect(settlementDays(1950)).toEqual(days);
    expect(OWNER_SETTLEMENTS).toBe(11);
    expect(kinds(w, 'owner-business')).toHaveLength(10);
    expect(kinds(w, 'owner-living')).toHaveLength(10);
    expect(kinds(w, 'owner-living').map((e) => e.detail.split(' · ')[0])).toEqual([
      '1950년 9월 1일 정산',
      '1950년 10월 1일 정산',
      '1950년 11월 1일 정산',
      '1950년 12월 1일 정산',
      '1951년 1월 1일 정산',
      '1951년 2월 1일 정산',
      '1951년 3월 1일 정산',
      '1951년 4월 1일 정산',
      '1951년 5월 1일 정산',
      '1951년 6월 1일 정산',
    ]);
  });
  it('win or lose 5% of the staked share at 60%, 70% for 성공한 사업가, replayed by the seed', () => {
    const day = seasonDayOf(1950, 11, 1);
    const rate = (traits: OwnerTrait[]) => {
      const w = ownerWorld(),
        start = w.owner!.fortune,
        stake = BigInt(stakeAmount({ ...w, owner: { ...w.owner!, stake: 40 } })),
        living = BigInt(livingCost(w, 1950, day));
      // 40% of the fortune staked, 5% of it won or lost.
      expect(stake).toBe((BigInt(start) * 40n * 5n) / 10000n);
      w.owner!.traits = traits;
      let wins = 0;
      for (let i = 0; i < 2000; i++) {
        w.seed = `odds:${i}`;
        w.events = [];
        w.owner!.fortune = start;
        w.owner!.stake = 40;
        on(w, day);
        const after = BigInt(w.owner!.fortune) + living - BigInt(start);
        expect([stake, -stake]).toContain(after);
        if (after > 0n) wins++;
      }
      return wins / 2000;
    };
    const base = rate([]),
      businessman = rate(['businessman']);
    expect(OWNER_BUSINESS.chance).toBe(0.6);
    expect(OWNER_BUSINESS.swing).toBe(5);
    expect(OWNER_TRAITS.businessman.success).toBe(0.7);
    expect(base).toBeGreaterThan(0.56);
    expect(base).toBeLessThan(0.64);
    expect(businessman).toBeGreaterThan(0.66);
    expect(businessman).toBeLessThan(0.74);
    const a = ownerWorld(),
      b = ownerWorld();
    for (const w of [a, b]) {
      w.owner!.stake = 50;
      on(w, day);
    }
    expect(a.owner!.fortune).toBe(b.owner!.fortune);
  });
  it('stake nothing at zero or below, pay living costs into debt and open 구단주 파산 위기', () => {
    const day = seasonDayOf(1950, 11, 1),
      w = ownerWorld(1950, '-1000'),
      living = livingCost(w, 1950, day);
    w.owner!.stake = 100;
    expect(stakeAmount(w)).toBe('0');
    on(w, day);
    expect(kinds(w, 'owner-business')).toHaveLength(0);
    expect(w.owner!.fortune).toBe((-1000n - BigInt(living)).toString());
    expect(w.owner!.ownerCrisis).toEqual({ since: { year: 1950, day } });
    expect(w.inbox!.at(-1)!.title).toContain('구단주 파산 위기');
    expect(w.inbox!.at(-1)!.attention).toBe(false);
    // The crisis opens once and runs to the close.
    const items = w.inbox!.length;
    on(w, seasonDayOf(1950, 2, 1));
    expect(w.inbox!.length).toBe(items);
    expect(w.owner!.ownerCrisis!.since.day).toBe(day);
  });
  it('take 0.8% of the starting fortune a season, grown with prices, split over its settlements', () => {
    const w = ownerWorld(1950),
      season = scaleBy(w.owner!.takeover.fortune, OWNER_LIVING.season, 10000n),
      grown = (year: number) =>
        ratio(season, BigInt(quote('ENG', year, 100000)), BigInt(quote('ENG', 1950, 100000)));
    expect(OWNER_LIVING.season).toBe(0.008);
    expect(seasonLivingCost(w)).toBe(season);
    // The season's eleven settlements pay the whole of it, none more than a minor unit apart.
    const days = [...settlementDays(1950), SEASON_END_DAY + 1],
      shares = days.map((day) => BigInt(livingCost(w, 1950, day)));
    expect(shares.reduce((sum, share) => sum + share, 0n)).toBe(BigInt(season));
    expect(shares.every((share) => share - shares[0]! <= 1n && shares[0]! - share <= 1n)).toBe(
      true,
    );
    expect(livingCost(w)).toBe(shares[0]!.toString());
    expect(seasonLivingCost(w, 1960)).toBe(grown(1960));
    expect(BigInt(seasonLivingCost(w, 1960))).toBeGreaterThan(BigInt(season));
    // From 1971 the quotes are in decimal pence, so the costs carry on in the new money.
    w.year = 1971;
    w.currency = 'GBP';
    expect(seasonLivingCost(w)).toBe(grown(1971));
    // A settlement of an earlier season's prices is carried into the new money: 100 for 240.
    expect(seasonLivingCost(w, 1970)).toBe(ratio(grown(1970), 100n, 240n));
    expect(BigInt(seasonLivingCost(w))).toBeGreaterThan(BigInt(seasonLivingCost(w, 1970)));
  });
  it('pay the close its share, and a whole season of living costs by the close', () => {
    const w = ownerWorld();
    for (let day = 0; day <= SEASON_END_DAY; day++) on(w, day);
    w.calendar = { day: SEASON_END_DAY + 1 };
    ownerClose(w);
    const paid = kinds(w, 'owner-living').reduce((sum, e) => sum + BigInt(e.amount!), 0n);
    expect(kinds(w, 'owner-living')).toHaveLength(11);
    expect(paid).toBe(BigInt(seasonLivingCost(w)));
  });
  it('name the next settlement: the next month’s 1st, the close, then next season’s first', () => {
    const w = ownerWorld();
    w.calendar = { day: 0 };
    expect(nextSettlement(w)).toEqual({ year: 1950, day: seasonDayOf(1950, 9, 1) });
    w.calendar = { day: seasonDayOf(1950, 11, 1) };
    expect(nextSettlement(w)).toEqual({ year: 1950, day: seasonDayOf(1950, 12, 1) });
    w.calendar = { day: seasonDayOf(1950, 6, 1) };
    expect(nextSettlement(w)).toEqual({ year: 1950, day: SEASON_END_DAY + 1 });
    w.calendar = { day: SEASON_END_DAY + 1 };
    expect(nextSettlement(w)).toEqual({ year: 1951, day: seasonDayOf(1951, 9, 1) });
    expect(businessChance(w)).toBe(OWNER_BUSINESS.chance);
  });
});

describe('a calendar jump (→WORLD-14)', () => {
  it('settles every month of the skipped seasons and nothing outside the gap', () => {
    const w = ownerWorld(1938);
    w.owner!.stake = 10;
    ownerSettleGap(w, { year: 1938, day: SEASON_END_DAY + 1 }, { year: 1946, day: 0 });
    // 1939/40 to 1945/46: ten monthly dates and a close a season.
    expect(kinds(w, 'owner-living')).toHaveLength(77);
    expect(kinds(w, 'owner-business')).toHaveLength(77);
    expect(kinds(w, 'owner-living')[0]!.detail).toContain('1939년 9월 1일');
    expect(kinds(w, 'owner-living').at(-1)!.detail).toContain('1946년');
    // Each paid at its own season's prices, booked in the season in play.
    expect(kinds(w, 'owner-living')[0]!.amount).toBe(livingCost(w, 1939, seasonDayOf(1939, 9, 1)));
    expect(kinds(w, 'owner-living').at(-1)!.amount).toBe(livingCost(w, 1945, SEASON_END_DAY + 1));
    expect(kinds(w, 'owner-living').every((e) => e.year === 1938)).toBe(true);
    const part = ownerWorld(1950);
    ownerSettleGap(
      part,
      { year: 1950, day: seasonDayOf(1950, 11, 1) },
      { year: 1950, day: seasonDayOf(1950, 5, 1) },
    );
    // December to May: six settlements after 1 November up to 1 May.
    expect(kinds(part, 'owner-living')).toHaveLength(6);
  });
});

describe('owner commands with an owner (→OWNER-7/9/11)', () => {
  it('set the stake in whole percent and the dividend on its dial, refusing anything else', () => {
    const w = ownerWorld();
    operate(w, { type: 'owner-stake', percent: 35 });
    operate(w, { type: 'owner-dividend', share: 75 });
    expect(w.owner!.stake).toBe(35);
    expect(w.owner!.dividendShare).toBe(75);
    for (const percent of [-1, 101, 2.5])
      expect(() => operate(w, { type: 'owner-stake', percent })).toThrow('사업 투자 비중');
    expect(() => operate(w, { type: 'owner-dividend', share: 30 as unknown as 25 })).toThrow(
      '배당 비율',
    );
    expect(w.owner!.stake).toBe(35);
    expect(w.owner!.dividendShare).toBe(75);
  });
  it('inject the fortune into cash as owner capital outside turnover, never beyond it', () => {
    const w = ownerWorld(1950, '500000'),
      cash = BigInt(w.cash),
      turnover = seasonTurnover(w);
    operate(w, { type: 'owner-inject', amount: '200000' });
    expect(w.owner!.fortune).toBe('300000');
    expect(BigInt(w.cash)).toBe(cash + 200000n);
    expect(seasonTurnover(w)).toBe(turnover);
    expect(seasonResult(w)).toBe('0');
    expect(
      financialBreakdown(w).income.find((line) => line.key === 'owner-injection')?.amount,
    ).toBe('200000');
    // Before 2011 nothing is counted for FFP.
    expect(w.owner!.ffpInjections).toEqual([]);
    const before = canonical(w);
    expect(() => operate(w, { type: 'owner-inject', amount: '300001' })).toThrow('구단주 자금');
    expect(() => operate(w, { type: 'owner-inject', amount: '0' })).toThrow('금액');
    w.owner!.fortune = '-5';
    expect(() => operate(w, { type: 'owner-inject', amount: '1' })).toThrow(
      '투입할 구단주 자금이 없어요',
    );
    w.owner!.fortune = '300000';
    expect(canonical(w)).toBe(before);
  });
});

describe('FFP (→OWNER-10)', () => {
  /** A top-flight club in `year`, its owner rich enough to pass any cap. */
  const topFlight = (year: number, country: 'ENG' | 'ESP' = 'ENG') => {
    const w = country === 'ENG' ? world() : spain();
    w.year = year;
    w.currency = country === 'ENG' ? 'GBP' : 'EUR';
    clubOf(w).tier = 0;
    withOwner(w, { fortune: '1000000000000' });
    return w;
  };
  const spain = () => careerWorld({ country: 'ESP', seed: 'owner-ffp' });
  it('applies from 2011/12 in the top flight only', () => {
    expect(ffpRoom(topFlight(FFP.start - 1))).toBeUndefined();
    expect(ffpRoom(topFlight(FFP.start))).toBeDefined();
    const lower = topFlight(2012);
    clubOf(lower).tier = 1;
    expect(ffpRoom(lower)).toBeUndefined();
    // Below the top flight any amount goes in, and still counts for the window.
    operate(lower, { type: 'owner-inject', amount: '9000000000' });
    expect(lower.owner!.ffpInjections).toEqual([{ season: 2012, amount: '9000000000' }]);
  });
  it('caps a euro club at €45m to 2014/15 and €30m from 2015/16 over three seasons', () => {
    const w = topFlight(2012, 'ESP');
    expect(ffpRoom(w)).toBe('4500000000');
    expect(() => operate(w, { type: 'owner-inject', amount: '4500000001' })).toThrow(
      '재정적 페어플레이',
    );
    operate(w, { type: 'owner-inject', amount: '4000000000' });
    expect(ffpRoom(w)).toBe('500000000');
    w.year = 2014;
    expect(ffpRoom(w)).toBe('500000000');
    expect(() => operate(w, { type: 'owner-inject', amount: '500000001' })).toThrow(
      '재정적 페어플레이',
    );
    // 2012's money leaves the window in 2015, when the cap is €30m.
    w.year = 2015;
    expect(ffpRoom(w)).toBe('3000000000');
    operate(w, { type: 'owner-inject', amount: '1000000000' });
    expect(w.owner!.ffpInjections).toEqual([{ season: 2015, amount: '1000000000' }]);
  });
  it('converts the cap for a club outside the euro at the game’s rates', () => {
    const w = topFlight(2012),
      room = BigInt(ffpRoom(w)!);
    // €45m is £25–45m at the game's 2012 rates (→ECON-35: €1.04–1.24 per £ by 2025).
    expect(room).toBeGreaterThan(2_500_000_000n);
    expect(room).toBeLessThan(4_500_000_000n);
    expect(() => operate(w, { type: 'owner-inject', amount: (room + 1n).toString() })).toThrow(
      '재정적 페어플레이',
    );
    operate(w, { type: 'owner-inject', amount: room.toString() });
    expect(ffpRoom(w)).toBe('0');
  });
});

describe('the season close (→OWNER-11/14)', () => {
  const closing = (fortune: string, income: string, expense: string, cash: string) => {
    const w = ownerWorld(1950, fortune);
    w.calendar = { day: SEASON_END_DAY + 1 };
    w.income = income;
    w.expense = expense;
    w.cash = cash;
    return w;
  };
  it('pays the dial’s share of a positive result from cash, capped at the cash above zero', () => {
    const w = closing('100000', '900000', '500000', '1000000'),
      living = BigInt(livingCost(w, 1950, SEASON_END_DAY + 1));
    w.owner!.dividendShare = 50;
    ownerClose(w);
    expect(kinds(w, 'owner-dividend').map((e) => e.amount)).toEqual(['200000']);
    expect(w.cash).toBe('800000');
    expect(w.expense).toBe('700000');
    expect(BigInt(w.owner!.fortune)).toBe(300000n - living);
    expect(
      financialBreakdown(w).expense.find((line) => line.key === 'owner-dividend')?.amount,
    ).toBe('200000');
    const capped = closing('100000', '900000', '500000', '150000');
    capped.owner!.dividendShare = 100;
    ownerClose(capped);
    expect(kinds(capped, 'owner-dividend').map((e) => e.amount)).toEqual(['150000']);
    expect(capped.cash).toBe('0');
  });
  it('pays the share of a profitable season’s result without the owner’s injection', () => {
    const w = closing('900000', '900000', '500000', '1000000');
    w.owner!.dividendShare = 50;
    operate(w, { type: 'owner-inject', amount: '500000' });
    // Income 1,400,000 with the injection, expense 500,000: the club earned 400,000.
    expect(seasonResult(w)).toBe('400000');
    ownerClose(w);
    expect(kinds(w, 'owner-dividend').map((e) => e.amount)).toEqual(['200000']);
    expect(w.cash).toBe('1300000');
  });
  it('pays nothing for a loss season, or from injections, or from cash below zero', () => {
    const loss = closing('100000', '400000', '500000', '1000000');
    loss.owner!.dividendShare = 100;
    ownerClose(loss);
    expect(kinds(loss, 'owner-dividend')).toHaveLength(0);
    // An injection is not profit: the result without it is the loss.
    const injected = closing('900000', '400000', '500000', '1000000');
    injected.owner!.dividendShare = 100;
    operate(injected, { type: 'owner-inject', amount: '500000' });
    expect(seasonResult(injected)).toBe('-100000');
    ownerClose(injected);
    expect(kinds(injected, 'owner-dividend')).toHaveLength(0);
    const indebted = closing('100000', '900000', '500000', '-1');
    indebted.owner!.dividendShare = 100;
    ownerClose(indebted);
    expect(kinds(indebted, 'owner-dividend')).toHaveLength(0);
  });
  it('settles the close day after the dividend, so the dividend can be staked', () => {
    const w = closing('0', '900000', '500000', '1000000');
    w.owner!.dividendShare = 100;
    w.owner!.stake = 50;
    ownerClose(w);
    const business = kinds(w, 'owner-business');
    expect(business).toHaveLength(1);
    // 5% of half the 400,000 taken home.
    expect(['10000', '-10000']).toContain(business[0]!.amount);
    expect(kinds(w, 'owner-living')).toHaveLength(1);
  });
  it('ends the career when the fortune is still below zero after the close', () => {
    const w = closing('-50000', '400000', '500000', '1000000');
    w.owner!.ownerCrisis = { since: { year: 1950, day: seasonDayOf(1950, 2, 1) } };
    ownerClose(w);
    expect(w.ended).toBe('owner');
    expect(kinds(w, 'owner-bankruptcy')).toHaveLength(1);
    expect(() => operate(w, { type: 'owner-stake', percent: 1 })).toThrow('구단 운영이 끝났어요');
    // The dividend is the way back: a profit taken home clears the crisis.
    const saved = closing('-50000', '2000000', '500000', '2000000');
    saved.owner!.ownerCrisis = { since: { year: 1950, day: seasonDayOf(1950, 2, 1) } };
    saved.owner!.dividendShare = 25;
    ownerClose(saved);
    expect(saved.ended).toBeUndefined();
    expect(saved.owner!.ownerCrisis).toBeUndefined();
    expect(BigInt(saved.owner!.fortune)).toBeGreaterThan(0n);
  });
});
