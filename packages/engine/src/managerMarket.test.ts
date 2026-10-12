import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { ManagerRule, ManagerStyle } from '../../contracts/src/types';
import {
  advanceRound,
  clubManager,
  clubOf,
  COMPENSATION,
  contractSeason,
  createWorld,
  dailyStaff,
  FREE_AGENTS,
  MANAGER_RENEWAL_MARGIN,
  managerCandidates,
  managerOffers,
  managerPayoff,
  marketOf,
  MARKET_REFRESH_ROUNDS,
  operate,
  ownLeagueClubs,
  refreshManagerMarket,
  renewalDay,
  simulateSeason,
  staffQuote,
  STYLE_INFO,
  yearlyStaff,
} from './index';
import { ratio } from './primitives';

const world = (seed = 'market') =>
  createWorld({ country: 'ENG', name: 'Market FC', color: '#334455', seed, difficulty: 2 });

describe('manager market (STAFF-17)', () => {
  it('opens with the season four and drops the man the owner hires', () => {
    const w = world();
    const free = managerCandidates(w).filter((c) => c.source === 'free');
    expect(free.map((c) => c.id)).toEqual(managerOffers(w).map((offer) => offer.id));
    const hired = free[1],
      founding = w.manager.id;
    operate(w, { type: 'hire', id: hired.id });
    expect(w.manager.id).toBe(hired.id);
    expect(managerCandidates(w).some((c) => c.id === hired.id)).toBe(false);
    // The founding all-rounder has no school to offer the market; a schooled manager does.
    expect(w.managerMarket!.free.some((m) => m.id === founding)).toBe(false);
    const next = managerCandidates(w).find((c) => c.source === 'free')!;
    operate(w, { type: 'hire', id: next.id });
    expect(w.managerMarket!.free.some((m) => m.id === hired.id)).toBe(true);
    validateWorld(w);
  });

  it('pays compensation for another club manager and the club names his successor', () => {
    const w = world();
    const target = managerCandidates(w).find((c) => c.source === 'club')!;
    const club = w.clubs.find((c) => c.id === target.club)!;
    // The founding manager is owed 25% of his wage for each of his three seasons left.
    const cash = BigInt(w.cash),
      payoff = BigInt(ratio(w.manager.wage, BigInt(w.manager.until - w.year), 4n));
    expect(w.manager.until - w.year).toBe(3);
    expect(BigInt(target.compensation!)).toBe(
      (BigInt(target.wage) * COMPENSATION[0]) / COMPENSATION[1],
    );
    operate(w, { type: 'hire', id: target.id });
    expect(BigInt(w.cash)).toBe(cash - BigInt(target.fee) - BigInt(target.compensation!) - payoff);
    expect(w.manager.id).toBe(target.id);
    expect(w.managerMarket!.clubs[club.id]).toEqual([1, w.year]);
    expect(clubManager(w, club).id).not.toBe(target.id);
    expect(w.events.at(-1)!.detail).toContain(`${club.name}에서 영입`);
  });

  it('hires for the term the owner chooses and pays the predecessor per season left', () => {
    const w = world('market-terms');
    w.cash = '999999999';
    const [first, second, third] = managerCandidates(w).filter(
      (c) => c.source === 'free' && c.style !== 'firefighter',
    );
    operate(w, { type: 'hire', id: first.id, term: 5 });
    expect(w.manager).toMatchObject({
      id: first.id,
      wage: first.wage,
      since: w.year,
      until: w.year + 5,
      term: 5,
    });
    expect(w.events.at(-1)!.detail).toContain(`계약 ${contractSeason(w.year + 5)} 시즌 끝까지`);
    // Replacing him at once pays 25% of his wage for each of his five seasons left.
    const payoff = ratio(first.wage, 5n, 4n);
    expect(managerPayoff(w)).toBe(payoff);
    const cash = BigInt(w.cash);
    operate(w, { type: 'hire', id: second.id, term: 2 });
    expect(BigInt(w.cash)).toBe(cash - BigInt(second.fee) - BigInt(payoff));
    expect(w.manager).toMatchObject({ id: second.id, until: w.year + 2, term: 2 });
    // In the pool he carries no term of ours.
    const pooled = w.managerMarket!.free.find((m) => m.id === first.id)!;
    expect(pooled.term).toBeUndefined();
    // Without a choice a candidate signs for his school's length.
    operate(w, { type: 'hire', id: third.id });
    expect(w.manager.until).toBe(w.year + STYLE_INFO[third.style].term);
    expect(w.manager.term).toBeUndefined();
    validateWorld(w);
  });

  it('moves every four rounds within 4-8 free agents, the same for the same seed', () => {
    const a = world('moving'),
      b = world('moving');
    for (let i = 0; i < MARKET_REFRESH_ROUNDS * 3; i++) {
      advanceRound(a, undefined, false);
      advanceRound(b, undefined, false);
    }
    expect(a.managerMarket).toBeDefined();
    expect(a.managerMarket!.round).toBe(MARKET_REFRESH_ROUNDS * 3);
    expect(a.managerMarket!.free.length).toBeGreaterThanOrEqual(FREE_AGENTS.min);
    expect(a.managerMarket!.free.length).toBeLessThanOrEqual(FREE_AGENTS.max);
    expect(canonical(a.managerMarket)).toBe(canonical(b.managerMarket));
    validateWorld(a);
  });

  it('lets struggling clubs of our league sack their managers into the pool', () => {
    let sacked = 0;
    for (let n = 0; n < 6 && !sacked; n++) {
      const w = world(`sacking-${n}`);
      simulateSeason(w);
      sacked += w.events.filter((e) => e.kind === 'rival-sacking').length;
      const changed = Object.keys(w.managerMarket?.clubs ?? {});
      if (sacked) {
        expect(changed.length).toBeGreaterThan(0);
        expect(ownLeagueClubs(w).length).toBeGreaterThan(0);
      }
    }
    expect(sacked).toBeGreaterThan(0);
  });

  it('keeps the market apart from every other draw of a refresh', () => {
    const w = world('apart');
    const before = canonical({ ...w, managerMarket: undefined });
    refreshManagerMarket(w);
    expect(canonical({ ...w, managerMarket: undefined })).toBe(before);
    expect(clubOf(w).id).toBe(w.playerClub);
  });
});

describe('delegated manager renewal (STAFF-18)', () => {
  /**
   * 1 April for an OVR-70 organizer whose contract ends at the close, with the manager post
   * delegated and a market of the given free agents (school, OVR).
   */
  function april(seed: string, free: [ManagerStyle, number][], rule?: ManagerRule) {
    const w = world(seed);
    w.cash = '999999999';
    w.delegation = { ...w.delegation, manager: true };
    if (rule) operate(w, { type: 'manager-rule', rule });
    w.manager = { ...w.manager, style: 'organizer', ability: 70, potential: 70, until: w.year + 1 };
    const market = structuredClone(marketOf(w));
    market.free = free.map(([style, ability], i) => ({
      ...market.free[i],
      style,
      ability,
      potential: ability,
      born: w.year - 50,
      wage: staffQuote(w, 120 + ability),
    }));
    w.managerMarket = market;
    w.calendar = { day: renewalDay(w.year) };
    dailyStaff(w);
    return w;
  }

  it('takes the renewal against a free agent less than 3 better under the rule', () => {
    const { manager, year } = april('renew-kept', [
      ['organizer', 70 + MANAGER_RENEWAL_MARGIN - 1],
      ['counter', 60],
    ]);
    expect(manager).toMatchObject({ interim: false, until: year + 3 });
    expect(manager.term).toBeUndefined();
    // Under 같은 학파 우선 his school's best counts, not a stronger man of another school.
    const w = april('renew-school', [
      ['organizer', 71],
      ['positional', 85],
    ]);
    expect(w.manager.until).toBe(w.year + 3);
    expect(w.inbox!.at(-1)).toMatchObject({ kind: 'staff-report', attention: false });
    expect(w.inbox!.at(-1)!.title).toContain('감독 재계약');
  });

  it('lets him go for a free agent 3+ better and appoints at the close without stopping', () => {
    const w = april('renew-replaced', [
      ['organizer', 70 + MANAGER_RENEWAL_MARGIN],
      ['counter', 60],
    ]);
    const { id, name } = w.manager,
      rival = w.managerMarket!.free[0];
    expect(w.manager.until).toBe(w.year + 1);
    expect(w.events.some((event) => event.kind === 'manager-renew')).toBe(false);
    const report = w.inbox!.at(-1)!;
    expect(report).toMatchObject({ kind: 'staff-report', attention: false, ref: id });
    expect(report.title).toBe(`수비 조직가 ${name} 감독과 재계약하지 않아요`);
    expect(report.detail).toContain(`OVR ${rival.ability}`);
    // No reminder stops the clock: the staff decided.
    expect(w.inbox!.some((item) => item.kind === 'staff-renewal')).toBe(false);
    w.year++;
    yearlyStaff(w);
    expect(w.critical).toBeUndefined();
    expect(w.manager).toMatchObject({ id: rival.id, until: w.year + 2 });
    expect(w.inbox!.find((item) => item.id === report.id)!.read).toBe(true);
    // Under 능력 최고 a stronger man of another school counts.
    const best = april(
      'renew-best',
      [
        ['organizer', 71],
        ['positional', 85],
      ],
      'best',
    );
    expect(best.manager.until).toBe(best.year + 1);
    expect(best.inbox!.at(-1)!.detail).toContain('능력 최고 기준으로 OVR 85');
  });
});

describe('strategy reservation (ECON-22)', () => {
  it('reserves a strategy at any time and applies it as the next season starts', () => {
    const w = world('reserve');
    operate(w, { type: 'build', build: { fans: 'community' } });
    expect(() => operate(w, { type: 'build', build: { youth: 'pathway' } })).toThrow('한 번');
    operate(w, { type: 'build', build: { youth: 'pathway' }, name: '다음 계획', next: true });
    expect(w.buildNext).toEqual({ build: { youth: 'pathway' }, name: '다음 계획' });
    // Reserving the strategy in force cancels the reservation.
    operate(w, { type: 'build', build: { fans: 'community' }, next: true });
    expect(w.buildNext).toBeUndefined();
    operate(w, { type: 'build', build: { youth: 'pathway' }, name: '다음 계획', next: true });
    validateWorld(w);
    const year = w.year;
    simulateSeason(w);
    expect(w.year).toBe(year + 1);
    expect(w.build).toEqual({ youth: 'pathway' });
    expect(w.buildYear).toBe(w.year);
    expect(w.buildNext).toBeUndefined();
    expect(w.events.some((e) => e.kind === 'build' && e.title === '운영 전략 · 다음 계획')).toBe(
      true,
    );
  });
});
