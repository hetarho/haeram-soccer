import type {
  CoachCriteria,
  ManagerCriteria,
  StaffRole,
  TalkRule,
  World,
} from '../../contracts/src/types';
import { directionOf, preferredSchool } from './direction';
import { isDelegated } from './responsibilities';
import { STAFF_INFO } from './staff';

/**
 * The searches the delegated staff run (→STAFF-13), derived from the direction rows the owner
 * sets (→ECON-25): the manager criteria (→STAFF-18), the coaches' criteria (→STAFF-15) and the
 * contract-talk rule (→CLUB-26). The defaults are what every row's default makes.
 */
export const MANAGER_CRITERIA_DEFAULT: Readonly<ManagerCriteria> = Object.freeze({
  minOvr: 0,
  schools: [],
  minFlexibility: 0,
  maxPride: 100,
  minYouth: 0,
  traits: [],
  priority: 'ovr',
  term: 2,
  poach: false,
  whenNone: 'wait',
});
/** Ability 55, cheapest first: the mid-market coach the old 균형 level hired (→STAFF-15). */
export const COACH_CRITERIA_DEFAULT: Readonly<CoachCriteria> = Object.freeze({
  volunteer: false,
  minAbility: 55,
  priority: 'wage',
  term: 2,
});
/** 110% of the market wage, the default squad investment's old pay ceiling (→CLUB-26). */
export const TALK_RULE_DEFAULT: Readonly<TalkRule> = Object.freeze({ maxPay: 1.1, minOvr: 0 });

export const MANAGER_PRIORITY_INFO: Record<ManagerCriteria['priority'], string> = {
  ovr: 'OVR 높은 순',
  potential: '잠재력 높은 순',
  wage: '연봉 낮은 순',
  youth: '육성 높은 순',
};

/** Whether the staff hire and renew this department's coaches (→STAFF-15). */
export function coachDelegated(w: Pick<World, 'settings'>, role: StaffRole) {
  return role in STAFF_INFO && isDelegated(w, 'staff');
}

/** 감독 기조's search over the default criteria (→STAFF-18); 표준 is the defaults. */
const MANAGER_STANCES: Readonly<Record<string, Partial<ManagerCriteria>>> = {
  standard: {},
  developer: { minYouth: 60, priority: 'youth', term: 3, whenNone: 'best' },
  proven: { priority: 'ovr', term: 3, poach: true, whenNone: 'best' },
  young: { priority: 'potential', term: 3, whenNone: 'best' },
  cheap: { priority: 'wage', term: 2, whenNone: 'best' },
};
/** 코치 기조 as each department's criteria (→STAFF-15); 표준 is the defaults. */
const COACH_STANCES: Readonly<Record<string, CoachCriteria>> = {
  volunteer: { volunteer: true, minAbility: 55, priority: 'wage', term: 2 },
  cheap: { volunteer: false, minAbility: 45, priority: 'wage', term: 2 },
  standard: COACH_CRITERIA_DEFAULT,
  elite: { volunteer: false, minAbility: 65, priority: 'ability', term: 3 },
};
/** 재계약 기조 as the rule the staff answer contract talks by (→CLUB-26); 표준 is the default. */
const TALK_STANCES: Readonly<Record<string, TalkRule>> = {
  standard: TALK_RULE_DEFAULT,
  keepAll: { maxPay: 1.4, minOvr: 0 },
  coreOnly: { maxPay: 1.4, minOvr: 0, startersOnly: true },
  frugal: { maxPay: 1, minOvr: 0 },
  youngFirst: { maxPay: 1.1, minOvr: 0, maxAge: 30 },
};

/** The manager search 선호 학파 and 감독 기조 make (→STAFF-18). */
export function managerCriteriaOf(w: Pick<World, 'direction'>): ManagerCriteria {
  const school = preferredSchool(w);
  return {
    ...MANAGER_CRITERIA_DEFAULT,
    ...MANAGER_STANCES[directionOf(w, 'manager')],
    schools: school ? [school] : [],
  };
}
/** The hire 코치 기조 makes in every department (→STAFF-15). */
export function coachCriteriaOf(w: Pick<World, 'direction'>): CoachCriteria {
  return COACH_STANCES[directionOf(w, 'coaches')];
}
/** The talk rule 재계약 기조 makes (→CLUB-26). */
export function talkRuleOf(w: Pick<World, 'direction'>): TalkRule {
  return TALK_STANCES[directionOf(w, 'renewal')];
}
