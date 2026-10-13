import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type {
  Manager,
  ManagerCriteria,
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
  MANAGER_CRITERIA_DEFAULT,
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
const criteria = (changes: Partial<ManagerCriteria>): ManagerCriteria => ({
  ...MANAGER_CRITERIA_DEFAULT,
  ...changes,
});
const ids = (w: World) => managerMatches(w).map((m) => m.id);
/** Makes the proud manager resign over one more strong demand (→STAFF-5). */
function resignOverDemand(w: World) {
  w.manager = { ...w.manager, pride: 90, trust: 20, conflicts: 2 };
  operate(w, { type: 'tactics', tactic: 'counter', tone: 'demand' });
}
/** A rich club with the manager post delegated under `set`. */
function delegated(seed: string, set: Partial<ManagerCriteria> = {}) {
  const w = world(seed);
  w.cash = '999999999';
  w.intervention = 4;
  operate(w, { type: 'hiring', role: 'manager', criteria: criteria(set) });
  return w;
}

describe('manager criteria (STAFF-18)', () => {
  it('manager criteria filter by school, flexibility, pride, youth work, trait and wage cap in the chosen order', () => {
    const w = delegated('criteria-filter');
    withAgents(w, [
      { style: 'developer', ovr: 70, potential: 84, flexibility: 60, pride: 40, youth: 85 },
      { style: 'positional', ovr: 82, flexibility: 30, pride: 90, youth: 60, trait: 'youth' },
      { style: 'motivator', ovr: 64, potential: 80, flexibility: 70, pride: 50, trait: 'stable' },
      { style: 'counter', ovr: 76, flexibility: 55, pride: 70, youth: 45, trait: 'rotation' },
      // A young man still short of his level asks less than the going wage of his OVR.
      { style: 'gegenpress', ovr: 74, potential: 90, wage: staffQuote(w, 120 + 60) },
    ]);
    // The defaults: everyone, the highest OVR first.
    expect(ids(w)).toEqual(['agent-1', 'agent-3', 'agent-4', 'agent-0', 'agent-2']);
    const only = (set: Partial<ManagerCriteria>) => {
      operate(w, { type: 'hiring', role: 'manager', criteria: criteria(set) });
      return ids(w);
    };
    expect(only({ schools: ['developer', 'positional'] })).toEqual(['agent-1', 'agent-0']);
    expect(only({ minFlexibility: 55 })).toEqual(['agent-3', 'agent-0', 'agent-2']);
    expect(only({ maxPride: 50 })).toEqual(['agent-4', 'agent-0', 'agent-2']);
    expect(only({ minYouth: 60 })).toEqual(['agent-1', 'agent-0']);
    expect(only({ traits: ['none'] })).toEqual(['agent-4', 'agent-0']);
    expect(only({ traits: ['youth', 'stable'] })).toEqual(['agent-1', 'agent-2']);
    expect(only({ minOvr: 75 })).toEqual(['agent-1', 'agent-3']);
    // The cap names the going wage of an OVR-70 manager.
    expect(only({ maxWageOvr: 70 })).toEqual(['agent-4', 'agent-0', 'agent-2']);
    expect(only({ priority: 'potential' })).toEqual([
      'agent-4',
      'agent-0',
      'agent-1',
      'agent-2',
      'agent-3',
    ]);
    expect(only({ priority: 'wage' })).toEqual([
      'agent-4',
      'agent-2',
      'agent-0',
      'agent-3',
      'agent-1',
    ]);
    expect(
      only({ schools: ['counter', 'gegenpress'], minFlexibility: 50, priority: 'potential' }),
    ).toEqual(['agent-4', 'agent-3']);
    // The staff would appoint the first; with nobody, the card says which criterion left nobody.
    expect(managerPickPreview(w).pick?.id).toBe('agent-4');
    operate(w, { type: 'hiring', role: 'manager', criteria: criteria({ schools: ['headcoach'] }) });
    expect(managerPickPreview(w)).toEqual({
      reason:
        '기준에 맞는 감독이 없어요 · 데이터 헤드코치 학파의 후보가 없어요 · 임시 감독 체제로 기다려요',
    });

    // Only those the club can afford: cash after the fee still covers 13 rounds of costs with his
    // wage in place of the current manager's.
    operate(w, { type: 'hiring', role: 'manager', criteria: criteria({}) });
    const best = managerCandidates(w).find((m) => m.id === 'agent-1')!;
    const runway = (wage: string) =>
      ((BigInt(operatingCosts(w).annual) + BigInt(wage) - BigInt(w.manager.wage)) / 46n) * 13n;
    w.cash = (BigInt(best.fee) + runway(best.wage)).toString();
    expect(ids(w)[0]).toBe('agent-1');
    w.cash = (BigInt(best.fee) + runway(best.wage) - 1n).toString();
    expect(ids(w)[0]).toBe('agent-3');
    w.cash = '0';
    expect(ids(w)).toEqual([]);
    expect(managerPickPreview(w).reason).toContain('자금 여력에 맞는 후보가 없어요');
  });

  it('poaching counts compensation and only when allowed', () => {
    const w = delegated('criteria-poach');
    withAgents(w, [{ style: 'organizer', ovr: 40 }]);
    expect(managerMatches(w).every((m) => m.source === 'free')).toBe(true);
    operate(w, { type: 'hiring', role: 'manager', criteria: criteria({ poach: true }) });
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
    expect(BigInt(w.cash)).toBe(cash - cost);
    expect(w.managerMarket!.clubs[club.id]).toEqual([1, w.year]);
    expect(clubManager(w, club).id).not.toBe(target.id);
    expect(w.events.at(-1)!.detail).toContain(`${club.name}에서 영입`);
    expect(w.inbox!.at(-1)!.detail).toContain('웃돈');
    validateWorld(w);
  });

  it('기다림 keeps the interim without stopping the clock and appoints once a match arrives', () => {
    const w = delegated('criteria-wait', { minOvr: 85 });
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
      title: '감독 선임 대기: 기준에 맞는 감독이 없어요',
    });
    expect(waiting()[0].detail).toMatch(
      /^OVR 85 이상인 후보가 없어요 · 최소 OVR 85 · .* · 맞는 후보가 없으면 기다림 · 임시 감독 체제로 계속해요$/,
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
    resignOverDemand(kept);
    delete kept.critical;
    dailyStaff(kept);
    expect(kept.manager.interim).toBe(true);
  });

  it('가장 나은 후보 falls back to the best affordable free agent', () => {
    const w = delegated('criteria-best', { minOvr: 99, whenNone: 'best', priority: 'wage' });
    withAgents(w, [
      { style: 'organizer', ovr: 72 },
      { style: 'counter', ovr: 58 },
      { style: 'developer', ovr: 66 },
    ]);
    expect(managerMatches(w)).toEqual([]);
    expect(managerPickPreview(w)).toMatchObject({ pick: { id: 'agent-1' }, fallback: true });
    resignOverDemand(w);
    // The cheapest, as the criteria order, though nobody meets OVR 99.
    expect(w.manager).toMatchObject({ id: 'agent-1', interim: false });
    expect(w.critical).toBeUndefined();
    expect(w.inbox!.at(-1)!.detail).toMatch(
      /^기준에 맞는 감독이 없어 스태프가 가장 나은 자유계약 감독을 2시즌 계약했어요 · /,
    );
    // Other clubs' managers are never the fallback, and nobody affordable keeps the interim.
    const broke = delegated('criteria-best-broke', { minOvr: 99, whenNone: 'best', poach: true });
    withAgents(broke, [{ style: 'organizer', ovr: 72 }]);
    broke.cash = '0';
    resignOverDemand(broke);
    expect(broke.manager.interim).toBe(true);
    expect(broke.critical).toBeUndefined();
    expect(broke.inbox!.at(-1)).toMatchObject({
      attention: true,
      title: '감독 선임 대기: 기준에 맞는 감독이 없어요',
    });
  });

  it('1 April renews a manager who meets the criteria unless a match beats him by 3, and keeps one who does not when nobody matches', () => {
    /** 1 April for an OVR-70 organizer whose contract ends at the close. */
    function april(seed: string, agents: Agent[], set: Partial<ManagerCriteria> = {}) {
      const w = delegated(seed, set);
      w.manager = {
        ...w.manager,
        style: 'organizer',
        ability: 70,
        potential: 70,
        born: w.year - 50,
        until: w.year + 1,
      };
      withAgents(w, agents);
      w.calendar = { day: renewalDay(w.year) };
      dailyStaff(w);
      return w;
    }
    const renewed = (w: World) => w.manager.until === w.year + 1 + MANAGER_CRITERIA_DEFAULT.term;

    // OVR 높은 순: 3 better beats him, 2 better does not.
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
      /^감독 선임 기준에 맞아 스태프가 2시즌 더 계약했어요/,
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

    // 잠재력 높은 순 measures potential; 연봉 낮은 순 a wage at most 90% of his renewal wage.
    expect(
      renewed(
        april('april-pot-kept', [{ style: 'counter', ovr: 60, potential: 72 }], {
          priority: 'potential',
        }),
      ),
    ).toBe(true);
    expect(
      renewed(
        april('april-pot-gone', [{ style: 'counter', ovr: 60, potential: 73 }], {
          priority: 'potential',
        }),
      ),
    ).toBe(false);
    // His renewal wage is the going wage of his OVR.
    const going = BigInt(staffQuote(world(), 120 + 70));
    const at = (share: bigint) => ((going * share) / 100n).toString();
    expect(
      renewed(
        april('april-wage-kept', [{ style: 'counter', ovr: 60, wage: at(91n) }], {
          priority: 'wage',
        }),
      ),
    ).toBe(true);
    expect(
      renewed(
        april('april-wage-gone', [{ style: 'counter', ovr: 60, wage: at(90n) }], {
          priority: 'wage',
        }),
      ),
    ).toBe(false);

    // One who does not meet the criteria stays when nobody does, for the criteria's term, and
    // makes way when somebody does.
    const alone = april('april-alone', [{ style: 'counter', ovr: 85 }], {
      schools: ['developer'],
      term: 4,
    });
    expect(alone.manager.until).toBe(alone.year + 5);
    expect(alone.inbox!.at(-1)!.detail).toMatch(
      /^기준에 맞는 감독이 없어 스태프가 4시즌 더 계약했어요/,
    );
    const replaced = april('april-replaced', [{ style: 'developer', ovr: 50 }], {
      schools: ['developer'],
    });
    expect(replaced.manager.until).toBe(replaced.year + 1);
    expect(replaced.inbox!.at(-1)!.detail).toContain('감독 선임 기준에 맞지 않고');
  });
});
