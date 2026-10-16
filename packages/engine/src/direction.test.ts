import { applyBoard, presetBoard, worldBoard, sameBoard } from './presets';
import { BUILD_PRESETS } from './build';
import { DIRECTION_DEFAULT, directionOf } from './direction';
import { legacySettings } from './responsibilities';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { InterventionLevel } from '../../contracts/src/types';
import {
  activePlayers,
  affordable,
  COACH_CRITERIA_DEFAULT,
  COACH_KEYS,
  coachCriteriaOf,
  coachDelegated,
  coachKey,
  createWorld,
  dailyStaff,
  dailyMarket,
  delegated,
  DIRECTION_INFO,
  DIRECTION_KEYS,
  financeStance,
  managerCriteriaOf,
  MANAGER_CRITERIA_DEFAULT,
  operate,
  operatingCosts,
  overall,
  ownStarters,
  promotionFloor,
  renewalDay,
  saleAllowed,
  saleBar,
  seasonStaff,
  STAFF_ROLES,
  staffStances,
  TALK_RULE_DEFAULT,
  talkRuleOf,
  transferWindowDays,
  untouchableVerdict,
} from './index';

const world = (seed = 'direction') =>
  createWorld({
    country: 'ENG',
    name: 'Direction Town',
    color: '#335577',
    seed,
    level: 'normal' as const,
  });
/** Cash covering `rounds` rounds of the club's fixed costs. */
const cashFor = (w: ReturnType<typeof world>, rounds: number) =>
  ((BigInt(operatingCosts(w).annual) * BigInt(rounds)) / 46n).toString();

describe('direction rows (→ECON-25, ECON-33, CLUB-26, STAFF-15, STAFF-18)', () => {
  it("keeps every row's default as today's criteria and stores only what differs", () => {
    const w = world();
    expect(w.direction).toBeUndefined();
    expect(managerCriteriaOf(w)).toEqual(MANAGER_CRITERIA_DEFAULT);
    expect(coachCriteriaOf(w)).toEqual(COACH_CRITERIA_DEFAULT);
    expect(talkRuleOf(w)).toEqual(TALK_RULE_DEFAULT);
    expect(financeStance(w)).toEqual({
      runway: 13,
      wageShare: 0.65,
      promotionYears: 1,
      sellSteps: [13, 30],
      signing: { margin: 5, upgrades: 1, feeShare: 0.5 },
    });
    expect(DIRECTION_KEYS.map((key) => DIRECTION_INFO[key].label)).toEqual([
      '단장·감독 지원',
      '재계약 기조',
      '선호 학파',
      '감독 기조',
      '코치 기조',
      '재정 기조',
      '육성 목표',
      '데뷔 시점',
    ]);

    operate(w, { type: 'direction', key: 'finance', option: 'careful' });
    expect(w.direction).toEqual({ finance: 'careful' });
    expect(w.events.at(-1)).toMatchObject({ kind: 'policy', title: '재정 기조 · 신중' });
    // The same option again changes and records nothing.
    const events = w.events.length;
    operate(w, { type: 'direction', key: 'finance', option: 'careful' });
    expect(w.events).toHaveLength(events);
    operate(w, { type: 'direction', key: 'school', option: 'developer' });
    operate(w, { type: 'direction', key: 'manager', option: 'developer' });
    operate(w, { type: 'direction', key: 'coaches', option: 'elite' });
    operate(w, { type: 'direction', key: 'renewal', option: 'coreOnly' });
    expect(canonical(validateWorld(JSON.parse(canonical(w))))).toBe(canonical(w));

    // Each option is the search its table states.
    expect(managerCriteriaOf(w)).toMatchObject({
      schools: ['developer'],
      minYouth: 60,
      priority: 'youth',
      term: 3,
      poach: false,
      whenNone: 'best',
    });
    expect(coachCriteriaOf(w)).toEqual({
      volunteer: false,
      minAbility: 65,
      priority: 'ability',
      term: 3,
    });
    expect(talkRuleOf(w)).toEqual({ maxPay: 1.4, minOvr: 0, startersOnly: true });
    operate(w, { type: 'direction', key: 'manager', option: 'proven' });
    expect(managerCriteriaOf(w)).toMatchObject({ priority: 'ovr', poach: true, whenNone: 'best' });
    operate(w, { type: 'direction', key: 'renewal', option: 'youngFirst' });
    expect(talkRuleOf(w)).toEqual({ maxPay: 1.1, minOvr: 0, maxAge: 30 });
    operate(w, { type: 'direction', key: 'renewal', option: 'frugal' });
    expect(talkRuleOf(w).maxPay).toBe(1);
    operate(w, { type: 'direction', key: 'coaches', option: 'volunteer' });
    expect(coachCriteriaOf(w).volunteer).toBe(true);

    // Back to the defaults: the rows, then `direction` itself, go.
    for (const key of DIRECTION_KEYS)
      operate(w, { type: 'direction', key, option: DIRECTION_DEFAULT[key] });
    expect(w.direction).toBeUndefined();
  });

  it('refuses unknown rows and options without changing the world', () => {
    const w = world('direction-refusals');
    const before = canonical(w);
    expect(() =>
      operate(w, { type: 'direction', key: 'mood' as never, option: 'standard' }),
    ).toThrow('방향 줄');
    expect(() => operate(w, { type: 'direction', key: 'finance', option: 'reckless' })).toThrow(
      '재정 기조',
    );
    expect(() => operate(w, { type: 'direction', key: 'school', option: 'tiki-taka' })).toThrow(
      '선호 학파',
    );
    expect(canonical({ ...w, revision: 0 })).toBe(
      canonical({ ...JSON.parse(before), revision: 0 }),
    );
  });

  it('재정 기조 sets the runway the staff keep, the promotion floor and the sale steps', () => {
    const w = world('direction-finance');
    // Twenty rounds of costs: enough for 표준 (13), not for 안정적 (30).
    w.cash = cashFor(w, 20);
    expect(affordable(w, 0n, 0n)).toBe(true);
    operate(w, { type: 'direction', key: 'finance', option: 'stable' });
    expect(affordable(w, 0n, 0n)).toBe(false);
    operate(w, { type: 'direction', key: 'finance', option: 'aggressive' });
    w.cash = cashFor(w, 8);
    expect(affordable(w, 0n, 0n)).toBe(true);

    // Promotions wait below a quarter of a year at 공격적, a year at 표준, two at 안정적.
    const annual = BigInt(operatingCosts(w).annual);
    expect(promotionFloor(w)).toBe(annual / 4n);
    operate(w, { type: 'direction', key: 'finance', option: 'standard' });
    expect(promotionFloor(w)).toBe(annual);
    operate(w, { type: 'direction', key: 'finance', option: 'stable' });
    expect(promotionFloor(w)).toBe(annual * 2n);

    // The sale bar's runway steps move with it: 25 rounds cuts 10 at 표준, 20 at 안정적.
    const p = activePlayers(w).find((x) => w.year - x.born >= 24 && w.year - x.born <= 29)!;
    p.born = w.year - 26;
    p.until = w.year + 3;
    w.cash = cashFor(w, 25);
    operate(w, { type: 'direction', key: 'finance', option: 'standard' });
    expect(saleBar(w, p).percent).toBe(120);
    operate(w, { type: 'direction', key: 'finance', option: 'stable' });
    expect(saleBar(w, p).percent).toBe(110);
    operate(w, { type: 'direction', key: 'finance', option: 'aggressive' });
    expect(saleBar(w, p).percent).toBe(130);
    // An untouchable star: 표준 lowers the price under 30 rounds and sells under 13.
    operate(w, { type: 'direction', key: 'finance', option: 'standard' });
    expect(untouchableVerdict(w, 180, false).accept).toBe(true);
    operate(w, { type: 'direction', key: 'finance', option: 'aggressive' });
    expect(untouchableVerdict(w, 180, false).accept).toBe(false);
  });

  it('매각 기조 sets the sale bar, and 핵심 지키기 never sells a starter', () => {
    const w = world('direction-market');
    w.cash = '999999999999';
    const p = activePlayers(w).find((x) => w.year - x.born >= 24 && w.year - x.born <= 29)!;
    p.born = w.year - 26;
    p.until = w.year + 3;
    const bars: [string | undefined, number][] = [
      [undefined, 130],
      ['selling', 110],
      ['showcase', 120],
      ['hardball', 150],
      ['hold', 150],
    ];
    for (const [market, base] of bars) {
      operate(w, { type: 'build', build: market ? { market: market as never } : {} });
      expect(saleBar(w, p)).toMatchObject({ base, percent: base });
    }
    p.born = w.year - 19;
    p.potential = 99;
    expect(saleBar(w, p).base).toBe(250);
    operate(w, { type: 'build', build: { market: 'selling' } });
    expect(saleBar(w, p).base).toBe(160);
    // An ageing starter with a ready bench player can go, except under 핵심 지키기.
    expect(saleAllowed(w, true, 31, true)).toBe(true);
    expect(saleAllowed(w, true, 29, true)).toBe(false);
    expect(saleAllowed(w, false, 22, false)).toBe(true);
    operate(w, { type: 'build', build: { market: 'hold' } });
    expect(saleAllowed(w, true, 31, true)).toBe(false);
    expect(saleAllowed(w, false, 22, false)).toBe(true);
  });

  it('hands the staff one more group at each level: academy and talks, then sponsors and staff, then transfers', () => {
    expect(COACH_KEYS).toEqual(STAFF_ROLES.map(coachKey));
    const w = world('direction-ladder');
    const at = (level: InterventionLevel) => {
      operate(w, { type: 'intervention', level });
      return {
        academy: delegated(w, 'academy'),
        contracts: delegated(w, 'contracts'),
        business: delegated(w, 'business'),
        manager: delegated(w, 'manager'),
        coaches: STAFF_ROLES.every((role) => coachDelegated(w, role)),
        anyCoach: STAFF_ROLES.some((role) => coachDelegated(w, role)),
        transfers: delegated(w, 'transfers'),
      };
    };
    expect(at(1)).toMatchObject({ academy: false, contracts: false, anyCoach: false });
    expect(at(2)).toMatchObject({
      academy: true,
      contracts: true,
      business: false,
      manager: false,
      anyCoach: false,
      transfers: false,
    });
    expect(at(3)).toMatchObject({ business: true, manager: true, coaches: true, transfers: false });
    expect(at(4)).toMatchObject({ business: true, manager: true, coaches: true, transfers: true });

    // From level 3 the staff refill every vacancy at once; releasing a coach changes no level.
    operate(w, { type: 'intervention', level: 3 });
    operate(w, { type: 'release-staff', role: 'attack' });
    expect(w.intervention).toBe(3);
    w.staff = w.staff!.filter((member) => member.role !== 'scout');
    dailyStaff(w);
    expect(w.staff!.some((member) => member.role === 'scout')).toBe(true);
    expect(w.staff!.some((member) => member.role === 'attack')).toBe(true);

    // The owner is reminded of expiring coaches at level 2; the staff renew them from level 3.
    const spring = (level: InterventionLevel) => {
      const s = world('direction-spring');
      s.cash = '999999999999';
      for (const role of ['attack', 'fitness'] as const)
        operate(s, { type: 'hire-staff', role, candidate: 1, term: 1 });
      operate(s, { type: 'intervention', level });
      s.calendar = { day: renewalDay(s.year) };
      dailyStaff(s);
      return s;
    };
    const owner = spring(2),
      staffRun = spring(3);
    const reminder = owner.inbox!.findLast((item) => item.kind === 'staff-renewal')!;
    expect(reminder.title).toContain('2명');
    expect(staffRun.inbox!.some((item) => item.detail?.includes('공격 코치'))).toBe(false);
    for (const s of [owner, staffRun]) {
      s.year++;
      seasonStaff(s);
    }
    expect(owner.staff!.some((member) => member.role === 'attack')).toBe(false);
    expect(staffRun.staff!.some((member) => member.role === 'attack')).toBe(true);
  });

  it('the staff set stances at window openings by the direction', () => {
    const w = world('direction-stances');
    const starters = new Set(ownStarters(w).map((player) => player.id));
    const bench = activePlayers(w).filter((player) => !starters.has(player.id));
    const [old, young, kept] = bench;
    old.born = w.year - 31;
    young.born = w.year - 20;
    kept.born = w.year - 32;
    // The owner's own stance is never touched.
    operate(w, { type: 'transfer-stance', id: kept.id, stance: 'untouchable' });
    operate(w, { type: 'build', build: { market: 'selling' } });
    operate(w, { type: 'direction', key: 'youthGoal', option: 'sell' });
    // Owners deciding transfers themselves keep every stance.
    w.calendar = { day: transferWindowDays(w.year).summerOpen };
    dailyMarket(w);
    expect(old.stance).toBeUndefined();
    // With transfers delegated the staff list surplus veterans and young non-starters.
    const fresh = world('direction-stances');
    const freshStarters = new Set(ownStarters(fresh).map((player) => player.id));
    const freshBench = activePlayers(fresh).filter((player) => !freshStarters.has(player.id));
    freshBench[0].born = fresh.year - 31;
    freshBench[1].born = fresh.year - 20;
    operate(fresh, { type: 'transfer-stance', id: freshBench[2].id, stance: 'untouchable' });
    freshBench[2].born = fresh.year - 32;
    operate(fresh, { type: 'build', build: { market: 'selling' } });
    operate(fresh, { type: 'direction', key: 'youthGoal', option: 'sell' });
    fresh.intervention = 4;
    fresh.settings = legacySettings(4);
    staffStances(fresh);
    expect(freshBench[0].stance).toBe('listed');
    expect(freshBench[1].stance).toBe('listed');
    expect(freshBench[2].stance).toBe('untouchable');
    expect(ownStarters(fresh).every((player) => player.stance === undefined)).toBe(true);
    expect(fresh.inbox!.at(-1)!.title).toMatch(/^단장이 이적 상태 \d+건을 정했어요$/);
    // 핵심 지키기 marks the three best starters 이적 불가.
    const hold = world('direction-hold');
    operate(hold, { type: 'build', build: { market: 'hold' } });
    hold.intervention = 4;
    hold.settings = legacySettings(4);
    hold.calendar = { day: transferWindowDays(hold.year).summerOpen };
    dailyMarket(hold);
    const marked = activePlayers(hold).filter((player) => player.stance === 'untouchable');
    expect(marked).toHaveLength(3);
    const best = [...ownStarters(hold)].sort((a, b) => overall(b) - overall(a)).slice(0, 3);
    expect(new Set(marked.map((player) => player.id))).toEqual(
      new Set(best.map((player) => player.id)),
    );
  });
});

describe('recruitment support policy', () => {
  it('defaults to balanced, validates choices and preserves financial limits without creating conflicts', () => {
    const w = world('support-row');
    const financial = financeStance(w);
    const responsibilities = structuredClone(w.settings);
    expect(directionOf(w, 'recruitmentSupport')).toBe('balanced');
    for (const option of ['director', 'manager', 'balanced']) {
      operate(w, { type: 'direction', key: 'recruitmentSupport', option });
      expect(directionOf(w, 'recruitmentSupport')).toBe(option);
      expect(financeStance(w)).toEqual(financial);
      expect(w.settings).toEqual(responsibilities);
      expect(validateWorld(JSON.parse(canonical(w))).direction).toEqual(w.direction);
      expect(w.events.at(-1)?.kind).toBe('policy');
    }
    expect(w.direction).toBeUndefined();
    expect(() =>
      operate(w, { type: 'direction', key: 'recruitmentSupport', option: 'always-spend' }),
    ).toThrow('단장·감독 지원');
  });
  it('retains support in a complete configuration and resets an omitted preset row to balanced', () => {
    const w = world('support-config');
    operate(w, { type: 'direction', key: 'recruitmentSupport', option: 'manager' });
    operate(w, { type: 'direction', key: 'finance', option: 'careful' });
    const saved = worldBoard(w);
    applyBoard(w, presetBoard(BUILD_PRESETS[0]));
    expect(directionOf(w, 'recruitmentSupport')).toBe('balanced');
    applyBoard(w, saved);
    expect(directionOf(w, 'recruitmentSupport')).toBe('manager');
    expect(directionOf(w, 'finance')).toBe('careful');
    expect(sameBoard(worldBoard(w), saved)).toBe(true);
  });
});
