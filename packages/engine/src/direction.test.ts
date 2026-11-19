import { BUILD_PRESETS } from './build';
import { directionOf } from './direction';
import { handTo, holdRows, staffAuthority } from './testing';
import { compareIds } from './primitives';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  activePlayers,
  affordable,
  COACH_CRITERIA_DEFAULT,
  coachCriteriaOf,
  dailyStaff,
  dailyMarket,
  DIRECTION_INFO,
  DIRECTION_KEYS,
  managerCriteriaOf,
  MANAGER_CRITERIA_DEFAULT,
  operate,
  operatingCosts,
  overall,
  ownStarters,
  releaseStaff,
  renewalDay,
  saleBar,
  saleContext,
  seasonStaff,
  staffStances,
  TALK_RULE_DEFAULT,
  talkRuleOf,
  transferWindowDays,
  untouchableVerdict,
} from './index';
import { careerWorld } from './career.testkit';
import { spendingStance } from './delegation';
import { holdTemperament, projectCashTo } from './delegation.testkit';

const world = (seed = 'direction') => careerWorld({ seed });
/** Cash covering `rounds` rounds of the club's fixed costs. */
const cashFor = (w: ReturnType<typeof world>, rounds: number) =>
  ((BigInt(operatingCosts(w).annual) * BigInt(rounds)) / 46n).toString();

describe('direction rows (→ECON-25, ECON-33, CLUB-26, STAFF-15, STAFF-18)', () => {
  it("keeps every row's default as today's criteria and reads each option as its table states", () => {
    const w = world();
    expect(w.direction).toBeUndefined();
    expect(managerCriteriaOf(w)).toEqual(MANAGER_CRITERIA_DEFAULT);
    expect(coachCriteriaOf(w)).toEqual(COACH_CRITERIA_DEFAULT);
    expect(talkRuleOf(w)).toEqual(TALK_RULE_DEFAULT);
    expect(DIRECTION_KEYS.map((key) => DIRECTION_INFO[key].label)).toEqual([
      '단장·감독 지원',
      '재계약 기조',
      '선호 학파',
      '감독 기조',
      '코치 기조',
      '육성 목표',
      '데뷔 시점',
    ]);

    // The rows a club holds as founded or saved (→ECON-25); no owner action changes them.
    holdRows(w, { direction: { school: 'developer' } });
    holdRows(w, { direction: { manager: 'developer' } });
    holdRows(w, { direction: { coaches: 'elite' } });
    holdRows(w, { direction: { renewal: 'coreOnly' } });
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
    holdRows(w, { direction: { manager: 'proven' } });
    expect(managerCriteriaOf(w)).toMatchObject({ priority: 'ovr', poach: true, whenNone: 'best' });
    holdRows(w, { direction: { renewal: 'youngFirst' } });
    expect(talkRuleOf(w)).toEqual({ maxPay: 1.1, minOvr: 0, maxAge: 30 });
    holdRows(w, { direction: { renewal: 'frugal' } });
    expect(talkRuleOf(w).maxPay).toBe(1);
    holdRows(w, { direction: { coaches: 'volunteer' } });
    expect(coachCriteriaOf(w).volunteer).toBe(true);
  });

  it('keeps fixed-cost cash safety and actual distress sale rows distinct', () => {
    const w = world('direction-finance');
    for (const temperament of ['balanced', 'cautious', 'bold'] as const) {
      holdTemperament(w, 'director', temperament);
      w.cash = cashFor(w, 5);
      expect(affordable(w, 0n, 0n)).toBe(true);
      w.cash = cashFor(w, 3);
      expect(affordable(w, 0n, 0n)).toBe(false);
    }
    const p = activePlayers(w)[0];
    const context = () => saleContext(w, { playerId: p.id, sellerId: w.playerClub, fee: '1' })!;
    w.cash = cashFor(w, 50);
    expect(context()).toMatchObject({ cashCrisis: false, distress: undefined });
    expect(untouchableVerdict(w, 180, false).accept).toBe(false);
    w.distress = { stage: 1, overHalfRounds: 0 };
    expect(context().distress).toBe(1);
    expect(untouchableVerdict(w, 180, false).accept).toBe(false);
    w.distress.stage = 2;
    expect(context().distress).toBe(2);
    expect(untouchableVerdict(w, 180, false).accept).toBe(true);
    w.cash = cashFor(w, 3);
    expect(context().cashCrisis).toBe(true);
    expect(untouchableVerdict(w, 100, false).accept).toBe(true);
  });

  it('lowers only an open delegated asking bar below the live floor outside distress', () => {
    const w = world('direction-sale-floor');
    handTo(w, 4);
    holdTemperament(w, 'director', 'balanced');
    w.delegationRequests = { sales: 4 };
    const p = activePlayers(w)[0];
    p.born = w.year - 27;
    const context = () => saleContext(w, { playerId: p.id, sellerId: w.playerClub, fee: '1' })!;
    projectCashTo(w, 0n);
    expect(saleBar(w, p).percent).toBe(130);
    projectCashTo(w, -1n);
    expect(saleBar(w, p)).toMatchObject({ percent: 125, reduction: 5 });
    expect(context().asking).toBe(((BigInt(context().value!) * 125n) / 100n).toString());
    expect(context().saleBar).toMatchObject({ percent: 125, reduction: 5 });
    p.stance = 'listed';
    expect(saleBar(w, p).percent).toBe(130);
    p.stance = 'untouchable';
    expect(saleBar(w, p).percent).toBe(130);
    delete p.stance;
    for (const stage of [1, 2, 3] as const) {
      w.distress = { stage, overHalfRounds: 0 };
      expect(saleBar(w, p).percent).toBe(130);
    }
    delete w.distress;
    w.settings!.responsibilities.sales = 'direct';
    expect(saleBar(w, p).percent).toBe(130);
  });

  it('매각 기조 sets the sale bar, the asking fee of value and for a prospect', () => {
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
      holdRows(w, { build: market ? { market: market as never } : {} });
      expect(saleBar(w, p)).toMatchObject({ percent: base, prospect: false });
    }
    p.born = w.year - 19;
    p.potential = 99;
    expect(saleBar(w, p)).toMatchObject({ percent: 250, prospect: true });
    holdRows(w, { build: { market: 'selling' } });
    expect(saleBar(w, p).percent).toBe(160);
  });

  it('staff given the coaching posts refill vacancies and renew expiring coaches', () => {
    const w = world('direction-ladder');
    // Staff given the posts refill every vacancy at once; releasing a coach changes no setting.
    handTo(w, 3);
    operate(w, { type: 'release-staff', role: 'attack' });
    expect(w.settings).toEqual(staffAuthority(3));
    releaseStaff(w, 'scout');
    dailyStaff(w);
    expect(w.staff!.some((member) => member.role === 'scout')).toBe(true);
    expect(w.staff!.some((member) => member.role === 'attack')).toBe(true);

    // The owner deciding the staff is reminded of expiring coaches; delegated staff renew them.
    const spring = (step: 2 | 3) => {
      const s = world('direction-spring');
      s.cash = '999999999999';
      for (const role of ['attack', 'fitness'] as const)
        operate(s, { type: 'hire-staff', role, candidate: 1, term: 1 });
      handTo(s, step);
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
    holdRows(w, { build: { market: 'selling' } });
    holdRows(w, { direction: { youthGoal: 'sell' } });
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
    holdRows(fresh, { build: { market: 'selling' } });
    holdRows(fresh, { direction: { youthGoal: 'sell' } });
    fresh.settings = staffAuthority(4);
    staffStances(fresh);
    expect(freshBench[0].stance).toBe('listed');
    expect(freshBench[1].stance).toBe('listed');
    expect(freshBench[2].stance).toBe('untouchable');
    expect(ownStarters(fresh).every((player) => player.stance === undefined)).toBe(true);
    expect(fresh.inbox!.at(-1)!.title).toMatch(/^단장이 이적 상태 \d+건을 정했어요$/);
    // 핵심 지키기 marks the three best starters 이적 불가.
    const hold = world('direction-hold');
    holdRows(hold, { build: { market: 'hold' } });
    hold.settings = staffAuthority(4);
    // No signing joins the XI after the marks are set.
    hold.settings.responsibilities.recruitment = 'direct';
    hold.calendar = { day: transferWindowDays(hold.year).summerOpen };
    dailyMarket(hold);
    const marked = activePlayers(hold).filter((player) => player.stance === 'untouchable');
    expect(marked).toHaveLength(3);
    // Equal OVRs fall back to ID order, as the staff rank them.
    const best = [...ownStarters(hold)]
      .sort((a, b) => overall(b) - overall(a) || compareIds(a.id, b.id))
      .slice(0, 3);
    expect(new Set(marked.map((player) => player.id))).toEqual(
      new Set(best.map((player) => player.id)),
    );
  });
});

describe('recruitment support policy', () => {
  it('defaults to balanced and preserves financial limits and responsibilities under every option', () => {
    const w = world('support-row');
    const financial = spendingStance(w, 'recruitment');
    const responsibilities = structuredClone(w.settings);
    expect(directionOf(w, 'recruitmentSupport')).toBe('balanced');
    for (const option of ['director', 'manager', 'balanced']) {
      holdRows(w, { direction: { recruitmentSupport: option } });
      expect(directionOf(w, 'recruitmentSupport')).toBe(option);
      expect(spendingStance(w, 'recruitment')).toEqual(financial);
      expect(w.settings).toEqual(responsibilities);
      expect(validateWorld(JSON.parse(canonical(w))).direction).toEqual(w.direction);
    }
    expect(w.direction).toBeUndefined();
  });
  it('founds a preset that names no support row at balanced', () => {
    const preset = BUILD_PRESETS[0];
    expect(preset.rows.direction).not.toHaveProperty('recruitmentSupport');
    const w = careerWorld({ seed: 'support-config', preset: preset.id });
    expect(directionOf(w, 'recruitmentSupport')).toBe('balanced');
    expect(w.delegationRequests?.recruitment).toBe(preset.rows.request);
  });
});
