import type {
  CoachCriteria,
  CoachDelegationKey,
  ContractTerm,
  ManagerCriteria,
  StaffRole,
  StaffTrait,
  TalkPayCap,
  TalkRule,
  WageCapOvr,
  World,
} from '../../contracts/src/types';
import { addEvent } from './world';
import { delegated } from './intervention';
import {
  CONTRACT_TERMS,
  MANAGER_TRAIT_INFO,
  MANAGER_TRAITS,
  STAFF_INFO,
  STAFF_ROLES,
  STAFF_TRAIT_INFO,
} from './staff';
import { MANAGER_STYLES, STYLE_INFO } from './styles';

/**
 * The owner's levers over the delegated staff (→STAFF-13): the manager criteria (→STAFF-18), each
 * coaching department's criteria (→STAFF-15) and the contract-talk rule (→CLUB-26). Only values
 * that differ from the defaults are stored, so a club that never set them keeps a small save.
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

export function managerCriteriaOf(w: Pick<World, 'hiring'>): ManagerCriteria {
  return w.hiring?.manager ?? MANAGER_CRITERIA_DEFAULT;
}
export function coachCriteriaOf(w: Pick<World, 'hiring'>, role: StaffRole): CoachCriteria {
  return w.hiring?.coaches?.[role] ?? COACH_CRITERIA_DEFAULT;
}
export function talkRuleOf(w: Pick<World, 'talkRule'>): TalkRule {
  return w.talkRule ?? TALK_RULE_DEFAULT;
}

const whole = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const oneOf = <T>(values: readonly T[], value: unknown): value is T => values.includes(value as T);
/** Members of `values`, each once, in the order `values` lists them; undefined if any is not. */
function subset<T>(values: readonly T[], chosen: unknown): T[] | undefined {
  if (!Array.isArray(chosen) || !chosen.every((value) => oneOf(values, value))) return undefined;
  if (new Set(chosen).size !== chosen.length) return undefined;
  return values.filter((value) => chosen.includes(value));
}
const isTerm = (term: unknown): term is ContractTerm => oneOf(CONTRACT_TERMS, term);
const isCap = (cap: unknown) => cap === undefined || oneOf(WAGE_CAP_OVRS, cap);

/** The criteria as stored: known fields only, lists in their canonical order. */
function checkManagerCriteria(c: ManagerCriteria): ManagerCriteria {
  const refuse = () => new Error('감독 선임 기준을 확인하세요.');
  if (!c || typeof c !== 'object') throw refuse();
  const schools = subset(MANAGER_STYLES, c.schools),
    traits = subset(['none', ...MANAGER_TRAITS] as const, c.traits);
  if (
    !schools ||
    !traits ||
    !whole(c.minOvr, 0, 99) ||
    !whole(c.minFlexibility, 0, 100) ||
    !whole(c.maxPride, 0, 100) ||
    !whole(c.minYouth, 0, 100) ||
    !isCap(c.maxWageOvr) ||
    !oneOf(['ovr', 'potential', 'wage'] as const, c.priority) ||
    !isTerm(c.term) ||
    typeof c.poach !== 'boolean' ||
    !oneOf(['wait', 'best'] as const, c.whenNone)
  )
    throw refuse();
  return {
    minOvr: c.minOvr,
    schools,
    minFlexibility: c.minFlexibility,
    maxPride: c.maxPride,
    minYouth: c.minYouth,
    traits,
    ...(c.maxWageOvr !== undefined ? { maxWageOvr: c.maxWageOvr } : {}),
    priority: c.priority,
    term: c.term,
    poach: c.poach,
    whenNone: c.whenNone,
  };
}
function checkCoachCriteria(role: StaffRole, c: CoachCriteria): CoachCriteria {
  if (!STAFF_ROLES.includes(role)) throw new Error('코치진 부서를 확인하세요.');
  const refuse = () => new Error(`${STAFF_INFO[role].label} 선임 기준을 확인하세요.`);
  if (!c || typeof c !== 'object') throw refuse();
  if (c.trait !== undefined && !STAFF_INFO[role].traits.includes(c.trait))
    throw new Error(`${STAFF_INFO[role].label}에게는 없는 특성이에요.`);
  if (
    typeof c.volunteer !== 'boolean' ||
    !whole(c.minAbility, 0, 99) ||
    !isCap(c.maxWageOvr) ||
    !oneOf(['ability', 'wage'] as const, c.priority) ||
    !isTerm(c.term)
  )
    throw refuse();
  return {
    volunteer: c.volunteer,
    minAbility: c.minAbility,
    ...(c.trait !== undefined ? { trait: c.trait } : {}),
    ...(c.maxWageOvr !== undefined ? { maxWageOvr: c.maxWageOvr } : {}),
    priority: c.priority,
    term: c.term,
  };
}
function checkTalkRule(rule: TalkRule): TalkRule {
  if (
    !rule ||
    typeof rule !== 'object' ||
    !oneOf(TALK_PAY_CAPS, rule.maxPay) ||
    !whole(rule.minOvr, 0, 99) ||
    (rule.maxAge !== undefined && !whole(rule.maxAge, TALK_AGE_LIMITS.min, TALK_AGE_LIMITS.max))
  )
    throw new Error('계약 협상 기준을 확인하세요.');
  return {
    maxPay: rule.maxPay,
    minOvr: rule.minOvr,
    ...(rule.maxAge !== undefined ? { maxAge: rule.maxAge } : {}),
  };
}
/** Object keys in one order, so criteria read back from a save compare like fresh ones. */
const sortedKeys = (_key: string, value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : value;
const same = (a: object, b: object) =>
  JSON.stringify(a, sortedKeys) === JSON.stringify(b, sortedKeys);
/** The lines of `after` that differ from `before`'s line in the same place. */
const changedLines = (before: string[], after: string[]) =>
  after.filter((line, i) => line !== before[i]).join(' · ');

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

/** Keeps `hiring` only while it holds something. */
function storeHiring(w: World, hiring: NonNullable<World['hiring']>) {
  if (hiring.coaches && !Object.keys(hiring.coaches).length) delete hiring.coaches;
  if (Object.keys(hiring).length) w.hiring = hiring;
  else delete w.hiring;
}
/** Sets the manager criteria (→STAFF-18); an unchanged value records nothing. */
export function setManagerCriteria(w: World, criteria: ManagerCriteria) {
  const next = checkManagerCriteria(criteria),
    before = managerCriteriaOf(w);
  if (same(next, before)) return;
  const hiring = { ...w.hiring };
  if (same(next, MANAGER_CRITERIA_DEFAULT)) delete hiring.manager;
  else hiring.manager = next;
  storeHiring(w, hiring);
  addEvent(
    w,
    'hiring',
    '감독 선임 기준',
    changedLines(managerCriteriaLines(before), managerCriteriaLines(next)),
  );
}
/** Sets one coaching department's criteria (→STAFF-15); an unchanged value records nothing. */
export function setCoachCriteria(w: World, role: StaffRole, criteria: CoachCriteria) {
  const next = checkCoachCriteria(role, criteria),
    before = coachCriteriaOf(w, role);
  if (same(next, before)) return;
  const coaches = { ...w.hiring?.coaches };
  if (same(next, COACH_CRITERIA_DEFAULT)) delete coaches[role];
  else coaches[role] = next;
  storeHiring(w, { ...w.hiring, coaches });
  addEvent(
    w,
    'hiring',
    `${STAFF_INFO[role].label} 선임 기준`,
    changedLines(coachCriteriaLines(role, before), coachCriteriaLines(role, next)),
  );
}
/** Sets the contract-talk rule (→CLUB-26); an unchanged value records nothing. */
export function setTalkRule(w: World, rule: TalkRule) {
  const next = checkTalkRule(rule),
    before = talkRuleOf(w);
  if (same(next, before)) return;
  if (same(next, TALK_RULE_DEFAULT)) delete w.talkRule;
  else w.talkRule = next;
  addEvent(
    w,
    'talk-rule',
    '계약 협상 기준',
    changedLines(talkRuleLines(before), talkRuleLines(next)),
  );
}
