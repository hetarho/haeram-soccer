import type {
  CoachCriteria,
  CoachDelegationKey,
  ManagerCriteria,
  StaffRole,
  StaffTrait,
  TalkPayCap,
  TalkRule,
  WageCapOvr,
  World,
} from '../../contracts/src/types';
import { directionOf, preferredSchool } from './direction';
import { delegated } from './intervention';
import { MANAGER_TRAIT_INFO, STAFF_INFO, STAFF_TRAIT_INFO } from './staff';
import { STYLE_INFO } from './styles';

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

/** Wage caps name the going wage of a manager or coach of OVR 50–90 in steps of 5. */
export const WAGE_CAP_OVRS: readonly WageCapOvr[] = [50, 55, 60, 65, 70, 75, 80, 85, 90];
export const TALK_PAY_CAPS: readonly TalkPayCap[] = [0.9, 1, 1.1, 1.25, 1.4];
/** The talk rule's 최대 나이: none, or 28–40. */
export const TALK_AGE_LIMITS = { min: 28, max: 40 } as const;
export const MANAGER_PRIORITY_INFO: Record<ManagerCriteria['priority'], string> = {
  ovr: 'OVR 높은 순',
  potential: '잠재력 높은 순',
  wage: '연봉 낮은 순',
  youth: '육성 높은 순',
};
export const COACH_PRIORITY_INFO: Record<CoachCriteria['priority'], string> = {
  ability: '능력 높은 순',
  wage: '연봉 낮은 순',
};

export function coachKey(role: StaffRole): CoachDelegationKey {
  return `coach:${role}`;
}
/** Whether the staff hire and renew this department's coaches (→STAFF-15). */
export function coachDelegated(w: Pick<World, 'intervention'>, role: StaffRole) {
  return delegated(w, coachKey(role));
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

const none = (value: number, open: number, text = String(value)) =>
  value === open ? '없음' : text;
/** The manager criteria in the owner's words, one line per criterion (→STAFF-18). */
export function managerCriteriaLines(c: ManagerCriteria): string[] {
  return [
    `최소 OVR ${none(c.minOvr, 0)}`,
    `학파 ${c.schools.length ? c.schools.map((style) => STYLE_INFO[style].label).join('·') : '모두'}`,
    `최소 유연성 ${none(c.minFlexibility, 0)}`,
    `최대 자존심 ${none(c.maxPride, 100)}`,
    `최소 육성 ${none(c.minYouth, 0)}`,
    `선발 성향 ${
      c.traits.length
        ? c.traits
            .map((trait) => (trait === 'none' ? '성향 없음' : MANAGER_TRAIT_INFO[trait].label))
            .join('·')
        : '모두'
    }`,
    `연봉 상한 ${c.maxWageOvr ? `OVR ${c.maxWageOvr} 감독 시세` : '없음'}`,
    `우선 ${MANAGER_PRIORITY_INFO[c.priority]}`,
    `계약 기간 ${c.term}시즌`,
    `다른 구단 감독 ${c.poach ? '웃돈 주고 영입' : '자유계약만'}`,
    `맞는 후보가 없으면 ${c.whenNone === 'wait' ? '기다림' : '가장 나은 후보'}`,
  ];
}
/** One department's criteria in the owner's words (→STAFF-15); a trait it lacks reads as any. */
export function coachCriteriaLines(role: StaffRole, c: CoachCriteria): string[] {
  const trait: StaffTrait | undefined =
    c.trait && STAFF_INFO[role].traits.includes(c.trait) ? c.trait : undefined;
  return [
    `자원봉사로 운영 ${c.volunteer ? '켬' : '끔'}`,
    `최소 능력 ${none(c.minAbility, 0)}`,
    `특성 ${trait ? STAFF_TRAIT_INFO[trait].label : '모두'}`,
    `연봉 상한 ${c.maxWageOvr ? `능력 ${c.maxWageOvr} 코치 시세` : '없음'}`,
    `우선 ${COACH_PRIORITY_INFO[c.priority]}`,
    `계약 기간 ${c.term}시즌`,
  ];
}
/** The talk rule in the owner's words (→CLUB-26). */
export function talkRuleLines(rule: TalkRule): string[] {
  return [
    `연봉 상한 시장가의 ${Math.round(rule.maxPay * 100)}%`,
    `최소 OVR ${none(rule.minOvr, 0)}`,
    `최대 나이 ${rule.maxAge === undefined ? '없음' : `${rule.maxAge}세`}`,
  ];
}
