import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type {
  CoachCriteria,
  InterventionLevel,
  ManagerCriteria,
  StaffRole,
  StaffTrait,
} from '../../contracts/src/types';
import {
  COACH_CRITERIA_DEFAULT,
  COACH_KEYS,
  coachCriteriaOf,
  coachDelegated,
  coachKey,
  createWorld,
  dailyStaff,
  managerCriteriaOf,
  MANAGER_CRITERIA_DEFAULT,
  operate,
  renewalDay,
  seasonStaff,
  STAFF_ROLES,
  TALK_RULE_DEFAULT,
  talkRuleOf,
} from './index';

const world = (seed = 'hiring') =>
  createWorld({ country: 'ENG', name: 'Criteria Town', color: '#335577', seed, difficulty: 1 });

describe('hiring criteria and the talk rule (→STAFF-15, STAFF-18, CLUB-26)', () => {
  it('stores only criteria that differ from the defaults and records an event', () => {
    const w = world();
    expect(w.hiring).toBeUndefined();
    expect(w.talkRule).toBeUndefined();
    expect(managerCriteriaOf(w)).toEqual(MANAGER_CRITERIA_DEFAULT);
    expect(coachCriteriaOf(w, 'scout')).toEqual(COACH_CRITERIA_DEFAULT);
    expect(talkRuleOf(w)).toEqual(TALK_RULE_DEFAULT);

    const manager: ManagerCriteria = {
      ...MANAGER_CRITERIA_DEFAULT,
      minOvr: 60,
      // Kept in the schools' own order, so the same choice reads the same however it was made.
      schools: ['developer', 'positional'],
      traits: ['none', 'youth'],
      maxWageOvr: 70,
      priority: 'potential',
      term: 3,
    };
    operate(w, { type: 'hiring', role: 'manager', criteria: manager });
    expect(w.hiring?.manager).toEqual({ ...manager, schools: ['positional', 'developer'] });
    expect(w.events.at(-1)).toMatchObject({
      kind: 'hiring',
      title: '감독 선임 기준',
      detail:
        '최소 OVR 60 · 학파 포지셔널 플레이·육성형 · 선발 성향 성향 없음·유망주 중용 · 연봉 상한 OVR 70 감독 시세 · 우선 잠재력 높은 순 · 계약 기간 3시즌',
    });
    // Sending the same criteria again changes and records nothing.
    const events = w.events.length;
    operate(w, { type: 'hiring', role: 'manager', criteria: { ...manager } });
    expect(w.events).toHaveLength(events);

    const scout: CoachCriteria = { ...COACH_CRITERIA_DEFAULT, minAbility: 70, trait: 'spotter' };
    operate(w, { type: 'hiring', role: 'scout', criteria: scout });
    expect(w.hiring?.coaches).toEqual({ scout });
    expect(w.events.at(-1)).toMatchObject({
      kind: 'hiring',
      title: '수석 스카우트 선임 기준',
      detail: '최소 능력 70 · 특성 발굴가',
    });
    operate(w, { type: 'talk-rule', rule: { maxPay: 1.25, minOvr: 60, maxAge: 33 } });
    expect(w.talkRule).toEqual({ maxPay: 1.25, minOvr: 60, maxAge: 33 });
    expect(w.events.at(-1)).toMatchObject({
      kind: 'talk-rule',
      title: '계약 협상 기준',
      detail: '연봉 상한 시장가의 125% · 최소 OVR 60 · 최대 나이 33세',
    });
    // The stored criteria survive a save.
    expect(canonical(validateWorld(JSON.parse(canonical(w))))).toBe(canonical(w));

    // Back to the defaults: the entries, then `hiring` and `talkRule` themselves, go.
    operate(w, { type: 'hiring', role: 'manager', criteria: { ...MANAGER_CRITERIA_DEFAULT } });
    expect(w.hiring).toEqual({ coaches: { scout } });
    operate(w, { type: 'hiring', role: 'scout', criteria: { ...COACH_CRITERIA_DEFAULT } });
    expect(w.hiring).toBeUndefined();
    operate(w, { type: 'talk-rule', rule: { ...TALK_RULE_DEFAULT } });
    expect(w.talkRule).toBeUndefined();
    expect(w.events.at(-1)?.detail).toBe(
      '연봉 상한 시장가의 110% · 최소 OVR 없음 · 최대 나이 없음',
    );
  });

  it('refuses a trait outside the department, values out of range and unknown schools', () => {
    const w = world('hiring-refusals');
    const before = canonical(w);
    const coach = (role: StaffRole, criteria: Partial<CoachCriteria>) => () =>
      operate(w, { type: 'hiring', role, criteria: { ...COACH_CRITERIA_DEFAULT, ...criteria } });
    const manager = (criteria: Partial<ManagerCriteria>) => () =>
      operate(w, {
        type: 'hiring',
        role: 'manager',
        criteria: { ...MANAGER_CRITERIA_DEFAULT, ...criteria },
      });
    // A goalkeeping coach can only be a specialist (→STAFF-11).
    expect(coach('goalkeeping', { trait: 'negotiator' })).toThrow('골키퍼 코치에게는 없는 특성');
    expect(coach('scout', { trait: 'mystic' as StaffTrait })).toThrow('없는 특성');
    expect(coach('attack', { minAbility: 100 })).toThrow('공격 코치 선임 기준');
    expect(coach('attack', { minAbility: 54.5 })).toThrow('선임 기준');
    expect(coach('attack', { maxWageOvr: 52 as never })).toThrow('선임 기준');
    expect(coach('attack', { term: 6 as never })).toThrow('선임 기준');
    expect(coach('kit' as StaffRole, {})).toThrow('부서');
    expect(manager({ schools: ['tiki-taka' as never] })).toThrow('감독 선임 기준');
    expect(manager({ schools: ['counter', 'counter'] })).toThrow('감독 선임 기준');
    expect(manager({ traits: ['grumpy' as never] })).toThrow('감독 선임 기준');
    expect(manager({ maxPride: 101 })).toThrow('감독 선임 기준');
    expect(manager({ minOvr: -1 })).toThrow('감독 선임 기준');
    expect(manager({ whenNone: 'panic' as never })).toThrow('감독 선임 기준');
    expect(() =>
      operate(w, { type: 'talk-rule', rule: { maxPay: 1.2 as never, minOvr: 0 } }),
    ).toThrow('계약 협상 기준');
    expect(() =>
      operate(w, { type: 'talk-rule', rule: { maxPay: 1.1, minOvr: 0, maxAge: 27 } }),
    ).toThrow('계약 협상 기준');
    expect(() => operate(w, { type: 'intervention', level: 5 as never })).toThrow('개입 수준');
    // A refused command changes nothing but the world's revision.
    expect(canonical({ ...w, revision: 0 })).toBe(
      canonical({ ...JSON.parse(before), revision: 0 }),
    );
  });

  it('every coaching department follows the intervention level together', () => {
    expect(COACH_KEYS).toEqual(STAFF_ROLES.map(coachKey));
    const w = world('hiring-departments');
    // New clubs decide every coaching department themselves (→WEB-45 level 2); only level 4
    // hands them to the staff, all at once.
    for (const level of [2, 1, 3] as const) {
      operate(w, { type: 'intervention', level });
      expect(STAFF_ROLES.some((role) => coachDelegated(w, role))).toBe(false);
    }
    operate(w, { type: 'intervention', level: 4 });
    expect(STAFF_ROLES.every((role) => coachDelegated(w, role))).toBe(true);

    // Releasing a coach changes no delegation: the staff refill every vacancy at once.
    operate(w, { type: 'release-staff', role: 'attack' });
    expect(w.intervention).toBe(4);
    w.staff = w.staff!.filter((member) => member.role !== 'scout');
    dailyStaff(w);
    expect(w.staff!.some((member) => member.role === 'scout')).toBe(true);
    expect(w.staff!.some((member) => member.role === 'attack')).toBe(true);

    // The owner is reminded of expiring coaches and loses those he does not renew; the staff
    // renew or replace them without a reminder.
    const spring = (level: InterventionLevel) => {
      const s = world('hiring-spring');
      s.cash = '999999999999';
      for (const role of ['attack', 'fitness'] as const)
        operate(s, { type: 'hire-staff', role, candidate: 1, term: 1 });
      operate(s, { type: 'intervention', level });
      s.calendar = { day: renewalDay(s.year) };
      dailyStaff(s);
      return s;
    };
    const owner = spring(2),
      staffRun = spring(4);
    const reminder = owner.inbox!.findLast((item) => item.kind === 'staff-renewal')!;
    expect(reminder.title).toContain('2명');
    expect(reminder.detail).toContain('공격 코치');
    expect(reminder.detail).toContain('피지컬 코치');
    expect(staffRun.inbox!.some((item) => item.detail?.includes('공격 코치'))).toBe(false);
    for (const s of [owner, staffRun]) {
      s.year++;
      seasonStaff(s);
    }
    expect(owner.staff!.some((member) => member.role === 'attack')).toBe(false);
    expect(owner.staff!.some((member) => member.role === 'fitness')).toBe(false);
    expect(staffRun.staff!.some((member) => member.role === 'attack')).toBe(true);
    expect(staffRun.staff!.some((member) => member.role === 'fitness')).toBe(true);
  });
});
