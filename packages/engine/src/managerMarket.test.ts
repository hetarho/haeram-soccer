import { legacySettings } from './responsibilities';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type {
  Founding,
  Manager,
  ManagerStyle,
  ManagerTrait,
  World,
} from '../../contracts/src/types';
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
  managerMatches,
  managerOffers,
  managerPayoff,
  managerPickPreview,
  marketOf,
  MARKET_REFRESH_ROUNDS,
  operate,
  operatingCosts,
  ownLeagueClubs,
  refreshManagerMarket,
  renewalDay,
  simulateSeason,
  staffQuote,
  STYLE_INFO,
  yearlyStaff,
} from './index';
import { ratio } from './primitives';
import { cachedWorld, simulatedWorld } from '../../../tests/fixtures/worlds';

const founding = (seed: string): Founding => ({
  country: 'ENG',
  name: 'Market FC',
  color: '#334455',
  seed,
  level: 'easy' as const,
});
const world = (seed = 'market') => simulatedWorld(founding(seed));

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
    // One run comes from the shared cache, built in its own pass; the other is played here.
    const a = simulatedWorld(founding('moving'), { rounds: MARKET_REFRESH_ROUNDS * 3 }),
      b = createWorld(founding('moving'));
    for (let i = 0; i < MARKET_REFRESH_ROUNDS * 3; i++) advanceRound(b, undefined, false);
    expect(a.managerMarket).toBeDefined();
    expect(a.managerMarket!.round).toBe(MARKET_REFRESH_ROUNDS * 3);
    expect(a.managerMarket!.free.length).toBeGreaterThanOrEqual(FREE_AGENTS.min);
    expect(a.managerMarket!.free.length).toBeLessThanOrEqual(FREE_AGENTS.max);
    expect(canonical(a.managerMarket)).toBe(canonical(b.managerMarket));
    validateWorld(a);
  });

  it('lets struggling clubs of our league sack their managers into the pool', () => {
    const sackings = (w: World) => w.events.filter((e) => e.kind === 'rival-sacking').length;
    /** One step of `simulateSeason`: a round, or the close once the rounds are played. */
    const step = (w: World) => {
      if (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
      else simulateSeason(w);
    };
    // The first seed's season up to the step whose market refresh sacks somebody; that step
    // is played here.
    const before = cachedWorld('before-first-sacking', () => {
      for (let n = 0; n < 6; n++) {
        const w = world(`sacking-${n}`);
        for (let closed = false; !closed;) {
          const snapshot = JSON.stringify(w);
          closed = w.round >= 46 || !!w.bankrupt;
          step(w);
          if (sackings(w)) return JSON.parse(snapshot) as World;
        }
      }
      return null;
    });
    let sacked = 0;
    if (before) {
      const w = before;
      step(w);
      sacked += sackings(w);
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

/** A free agent as the tests need him: school and OVR, with the other attributes given. */
interface Agent {
  style: ManagerStyle;
  ovr: number;
  potential?: number;
  flexibility?: number;
  pride?: number;
  youth?: number;
  trait?: ManagerTrait;
  wage?: string;
}
/** Replaces the market's free agents with `agents`, each asking the going wage unless given. */
function withAgents(w: World, agents: Agent[]) {
  const market = structuredClone(marketOf(w));
  const base = market.free[0];
  market.free = agents.map((agent, i) => {
    const { trait: _trait, ...rest } = base;
    void _trait;
    return {
      ...rest,
      id: `agent-${i}`,
      name: `Agent ${i}`,
      style: agent.style,
      ability: agent.ovr,
      potential: agent.potential ?? agent.ovr,
      flexibility: agent.flexibility ?? 50,
      pride: agent.pride ?? 50,
      youth: agent.youth ?? 50,
      ...(agent.trait ? { trait: agent.trait } : {}),
      born: w.year - 50,
      wage: agent.wage ?? staffQuote(w, 120 + agent.ovr),
    } satisfies Manager;
  });
  w.managerMarket = market;
  return market.free;
}
const ids = (w: World) => managerMatches(w).map((m) => m.id);
/** Makes the proud manager resign over one more strong demand (→STAFF-5). */
function resignOverDemand(w: World) {
  w.manager = { ...w.manager, pride: 90, trust: 20, conflicts: 2 };
  operate(w, { type: 'tactics', tactic: 'counter', tone: 'demand' });
}
/** Sets one direction row (→ECON-25). */
const row = (w: World, key: 'manager' | 'school' | 'finance', option: string) =>
  operate(w, { type: 'direction', key, option });
/** A rich club with the manager post delegated (level 3) under 감독 기조 and 선호 학파. */
function delegated(seed: string, manager = 'standard', school = 'any') {
  const w = world(seed);
  w.cash = '999999999';
  w.intervention = 3;
  w.settings = legacySettings(3);
  row(w, 'manager', manager);
  row(w, 'school', school);
  return w;
}

describe('선호 학파 and 감독 기조 (STAFF-18)', () => {
  it("choose the candidates the staff appoint, in the option's order", () => {
    const w = delegated('criteria-filter');
    withAgents(w, [
      { style: 'developer', ovr: 70, potential: 84, flexibility: 60, pride: 40, youth: 85 },
      { style: 'positional', ovr: 82, flexibility: 30, pride: 90, youth: 60, trait: 'youth' },
      { style: 'motivator', ovr: 64, potential: 80, flexibility: 70, pride: 50, trait: 'stable' },
      { style: 'counter', ovr: 76, flexibility: 55, pride: 70, youth: 45, trait: 'rotation' },
      // A young man still short of his level asks less than the going wage of his OVR.
      { style: 'gegenpress', ovr: 74, potential: 90, wage: staffQuote(w, 120 + 60) },
    ]);
    // 표준: everyone, the highest OVR first.
    expect(ids(w)).toEqual(['agent-1', 'agent-3', 'agent-4', 'agent-0', 'agent-2']);
    row(w, 'school', 'developer');
    expect(ids(w)).toEqual(['agent-0']);
    row(w, 'school', 'any');
    // 육성가: youth work 60 or more, the best developer first.
    row(w, 'manager', 'developer');
    expect(ids(w)).toEqual(['agent-0', 'agent-1']);
    row(w, 'manager', 'young');
    expect(ids(w)).toEqual(['agent-4', 'agent-0', 'agent-1', 'agent-2', 'agent-3']);
    row(w, 'manager', 'cheap');
    expect(ids(w)).toEqual(['agent-4', 'agent-2', 'agent-0', 'agent-3', 'agent-1']);
    row(w, 'manager', 'young');
    row(w, 'school', 'gegenpress');
    expect(ids(w)).toEqual(['agent-4']);
    // The staff would appoint the first; with nobody, the card says why and that 표준 waits.
    expect(managerPickPreview(w).pick?.id).toBe('agent-4');
    row(w, 'manager', 'standard');
    row(w, 'school', 'headcoach');
    expect(managerPickPreview(w)).toEqual({
      reason:
        '감독 기조에 맞는 감독이 없어요 · 데이터 헤드코치 학파의 후보가 없어요 · 임시 감독 체제로 기다려요',
    });

    // Only those the club can afford: cash after the fee still keeps 재정 기조's runway (13
    // rounds at 표준, 20 at 신중) with his wage in place of the current manager's.
    row(w, 'school', 'any');
    const best = managerCandidates(w).find((m) => m.id === 'agent-1')!;
    const runway = (wage: string, rounds: bigint) =>
      ((BigInt(operatingCosts(w).annual) + BigInt(wage) - BigInt(w.manager.wage)) / 46n) * rounds;
    w.cash = (BigInt(best.fee) + runway(best.wage, 13n)).toString();
    expect(ids(w)[0]).toBe('agent-1');
    w.cash = (BigInt(best.fee) + runway(best.wage, 13n) - 1n).toString();
    expect(ids(w)[0]).toBe('agent-3');
    w.cash = (BigInt(best.fee) + runway(best.wage, 13n)).toString();
    row(w, 'finance', 'careful');
    expect(ids(w)[0]).not.toBe('agent-1');
    row(w, 'finance', 'standard');
    w.cash = '0';
    expect(ids(w)).toEqual([]);
    expect(managerPickPreview(w).reason).toContain('자금 여력에 맞는 후보가 없어요');
  });

  it("검증된 승부사 poaches other clubs' managers, counting their compensation", () => {
    const w = delegated('criteria-poach');
    withAgents(w, [{ style: 'organizer', ovr: 40 }]);
    expect(managerMatches(w).every((m) => m.source === 'free')).toBe(true);
    row(w, 'manager', 'proven');
    const target = managerMatches(w)[0];
    expect(target.source).toBe('club');
    const club = w.clubs.find((c) => c.id === target.club)!;
    // His compensation counts toward what the club must afford.
    const runway =
      ((BigInt(operatingCosts(w).annual) + BigInt(target.wage) - BigInt(w.manager.wage)) / 46n) *
      13n;
    const cost = BigInt(target.fee) + BigInt(target.compensation!);
    w.cash = (cost + runway - 1n).toString();
    expect(managerMatches(w).some((m) => m.id === target.id)).toBe(false);
    w.cash = (cost + runway).toString();
    expect(managerMatches(w)[0].id).toBe(target.id);
    expect(managerPickPreview(w).reason).toContain(`${club.name} · 웃돈`);
    // Appointed by the staff, he leaves his club, which takes its compensation and names a successor.
    w.cash = '999999999';
    const cash = BigInt(w.cash);
    resignOverDemand(w);
    expect(w.manager.id).toBe(target.id);
    expect(w.manager.until).toBe(w.year + 3);
    expect(BigInt(w.cash)).toBe(cash - cost);
    expect(w.managerMarket!.clubs[club.id]).toEqual([1, w.year]);
    expect(clubManager(w, club).id).not.toBe(target.id);
    expect(w.events.at(-1)!.detail).toContain(`${club.name}에서 영입`);
    expect(w.inbox!.at(-1)!.detail).toContain('웃돈');
    validateWorld(w);
  });

  it('표준 waits with the interim, without stopping the clock, and appoints once a match arrives', () => {
    const w = delegated('criteria-wait', 'standard', 'motivator');
    withAgents(w, [
      { style: 'organizer', ovr: 70 },
      { style: 'counter', ovr: 80 },
    ]);
    resignOverDemand(w);
    expect(w.manager.interim).toBe(true);
    expect(w.critical).toBeUndefined();
    const waiting = () => w.inbox!.filter((item) => item.ref === w.manager.id);
    expect(waiting()).toHaveLength(1);
    expect(waiting()[0]).toMatchObject({
      kind: 'staff-report',
      attention: true,
      title: '감독 선임 대기: 감독 기조에 맞는 감독이 없어요',
    });
    expect(waiting()[0].detail).toBe(
      '동기부여형 학파의 후보가 없어요 · 선호 학파 동기부여형 · 감독 기조 표준 · 임시 감독 체제로 계속해요',
    );
    // The staff look again every day without repeating themselves.
    dailyStaff(w);
    dailyStaff(w);
    expect(w.manager.interim).toBe(true);
    expect(waiting()).toHaveLength(1);
    const report = waiting()[0];
    // Once a match is on the market they appoint him, and the report is settled.
    const [, arrival] = withAgents(w, [
      { style: 'organizer', ovr: 70 },
      { style: 'motivator', ovr: 86 },
    ]);
    dailyStaff(w);
    expect(w.manager).toMatchObject({ id: arrival.id, interim: false, until: w.year + 2 });
    expect(w.inbox!.find((item) => item.id === report.id)!.read).toBe(true);
    // Without delegation an interim the owner kept stays.
    const kept = delegated('criteria-wait-owner');
    kept.intervention = 2;
    kept.settings = legacySettings(2);
    resignOverDemand(kept);
    delete kept.critical;
    dailyStaff(kept);
    expect(kept.manager.interim).toBe(true);
  });

  it('the other options fall back to the best affordable free agent in their order', () => {
    const w = delegated('criteria-best', 'cheap', 'headcoach');
    withAgents(w, [
      { style: 'organizer', ovr: 72 },
      { style: 'counter', ovr: 58 },
      { style: 'developer', ovr: 66 },
    ]);
    expect(managerMatches(w)).toEqual([]);
    expect(managerPickPreview(w)).toMatchObject({ pick: { id: 'agent-1' }, fallback: true });
    resignOverDemand(w);
    // The cheapest, as 저비용 orders them, though nobody is of the school.
    expect(w.manager).toMatchObject({ id: 'agent-1', interim: false });
    expect(w.critical).toBeUndefined();
    expect(w.inbox!.at(-1)!.detail).toMatch(
      /^선호 학파와 감독 기조에 맞는 감독이 없어 단장이 가장 나은 자유계약 감독을 2시즌 계약했어요 · /,
    );
    // Other clubs' managers are never the fallback, and nobody affordable keeps the interim.
    const broke = delegated('criteria-best-broke', 'proven', 'headcoach');
    withAgents(broke, [{ style: 'organizer', ovr: 72 }]);
    broke.cash = '0';
    resignOverDemand(broke);
    expect(broke.manager.interim).toBe(true);
    expect(broke.critical).toBeUndefined();
    expect(broke.inbox!.at(-1)).toMatchObject({
      attention: true,
      title: '감독 선임 대기: 감독 기조에 맞는 감독이 없어요',
    });
  });

  it('1 April renews a manager who meets the rows unless a match beats him by 3 in their order, and keeps one who does not when nobody matches', () => {
    /** 1 April for an OVR-70 organizer of youth work 70 whose contract ends at the close. */
    function april(seed: string, agents: Agent[], manager = 'standard', school = 'any') {
      const w = delegated(seed, manager, school);
      w.manager = {
        ...w.manager,
        style: 'organizer',
        ability: 70,
        potential: 70,
        youth: 70,
        born: w.year - 50,
        until: w.year + 1,
      };
      withAgents(w, agents);
      w.calendar = { day: renewalDay(w.year) };
      dailyStaff(w);
      return w;
    }
    const renewed = (w: World, term = 2) => w.manager.until === w.year + 1 + term;

    // 표준 (OVR first): 3 better beats him, 2 better does not.
    const kept = april('april-ovr-kept', [
      { style: 'positional', ovr: 70 + MANAGER_RENEWAL_MARGIN - 1 },
    ]);
    expect(renewed(kept)).toBe(true);
    expect(kept.manager.term).toBeUndefined();
    expect(kept.inbox!.at(-1)).toMatchObject({
      kind: 'staff-report',
      attention: false,
      title: `수비 조직가 ${kept.manager.name} 감독 재계약`,
    });
    expect(kept.inbox!.at(-1)!.detail).toMatch(
      /^선호 학파와 감독 기조에 맞아 단장이 2시즌 더 계약했어요/,
    );
    const gone = april('april-ovr-gone', [
      { style: 'positional', ovr: 70 + MANAGER_RENEWAL_MARGIN },
    ]);
    const { id, name } = gone.manager;
    expect(gone.manager.until).toBe(gone.year + 1);
    const report = gone.inbox!.at(-1)!;
    expect(report).toMatchObject({
      kind: 'staff-report',
      attention: false,
      ref: id,
      title: `수비 조직가 ${name} 감독과 재계약하지 않아요`,
    });
    expect(report.detail).toContain('Agent 0(OVR 73/73');
    // No reminder stops the clock; at the close the staff appoint the match.
    expect(gone.inbox!.some((item) => item.kind === 'staff-renewal')).toBe(false);
    gone.year++;
    yearlyStaff(gone);
    expect(gone.critical).toBeUndefined();
    expect(gone.manager).toMatchObject({ id: 'agent-0', until: gone.year + 2 });
    expect(gone.inbox!.find((item) => item.id === report.id)!.read).toBe(true);

    // 젊은 감독 measures potential, 육성가 youth work (both 3 seasons), 저비용 a wage at most 90%
    // of his renewal wage.
    expect(
      renewed(april('april-pot-kept', [{ style: 'counter', ovr: 60, potential: 72 }], 'young'), 3),
    ).toBe(true);
    expect(
      renewed(april('april-pot-gone', [{ style: 'counter', ovr: 60, potential: 73 }], 'young'), 3),
    ).toBe(false);
    expect(
      renewed(
        april('april-youth-kept', [{ style: 'counter', ovr: 60, youth: 72 }], 'developer'),
        3,
      ),
    ).toBe(true);
    expect(
      renewed(
        april('april-youth-gone', [{ style: 'counter', ovr: 60, youth: 73 }], 'developer'),
        3,
      ),
    ).toBe(false);
    // His renewal wage is the going wage of his OVR.
    const going = BigInt(staffQuote(world(), 120 + 70));
    const at = (share: bigint) => ((going * share) / 100n).toString();
    expect(
      renewed(april('april-wage-kept', [{ style: 'counter', ovr: 60, wage: at(91n) }], 'cheap')),
    ).toBe(true);
    expect(
      renewed(april('april-wage-gone', [{ style: 'counter', ovr: 60, wage: at(90n) }], 'cheap')),
    ).toBe(false);

    // One who is not of the preferred school stays when nobody is, and makes way when somebody is.
    const alone = april('april-alone', [{ style: 'counter', ovr: 85 }], 'standard', 'developer');
    expect(alone.manager.until).toBe(alone.year + 3);
    expect(alone.inbox!.at(-1)!.detail).toMatch(
      /^감독 기조에 맞는 감독이 없어 단장이 2시즌 더 계약했어요/,
    );
    const replaced = april(
      'april-replaced',
      [{ style: 'developer', ovr: 50 }],
      'standard',
      'developer',
    );
    expect(replaced.manager.until).toBe(replaced.year + 1);
    expect(replaced.inbox!.at(-1)!.detail).toContain('선호 학파·감독 기조에 맞지 않고');
  });
});
