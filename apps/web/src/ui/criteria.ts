import type {
  ManagerStyle,
  ManagerTrait,
  StaffRole,
  StaffTrait,
  WageCapOvr,
  World,
} from '../../../../packages/contracts/src/types';
import {
  TALK_AGE_LIMITS,
  TALK_PAY_CAPS,
  WAGE_CAP_OVRS,
} from '../../../../packages/engine/src/hiring';
import { managerCapWage } from '../../../../packages/engine/src/managerMarket';
import {
  coachWage,
  MANAGER_TRAIT_INFO,
  MANAGER_TRAITS,
  STAFF_INFO,
  STAFF_ROLES,
  STAFF_TRAIT_INFO,
} from '../../../../packages/engine/src/staff';
import { MANAGER_STYLES, STYLE_INFO } from '../../../../packages/engine/src/styles';
import { clubOf } from '../../../../packages/engine/src/world';
import { compactMoney } from './format';

/**
 * The option lists and draft helpers of the staff criteria editors in 사람 (→WEB-43): the manager
 * criteria (→STAFF-18), each coaching department's (→STAFF-15) and the contract-talk rule
 * (→CLUB-26). Pure, so the lists and the 적용 rule are tested without rendering.
 */
export type CapKind = 'manager' | 'coach';

/** Wage caps name the going wage of a manager or coach of OVR 50–90 in steps of 5. */
export const WAGE_CAP_STEPS: readonly WageCapOvr[] = WAGE_CAP_OVRS;

/** The going wage a cap step names, this season: a manager's or a coach's of that OVR. */
export function wageCapWage(w: World, kind: CapKind, ovr: WageCapOvr) {
  return kind === 'manager' ? managerCapWage(w, ovr) : coachWage(w, ovr);
}
/** "OVR 70 시세 · £1.2K" (a coach: "능력 70 …"), or 제한 없음, in the money notation (→WEB-67). */
export function wageCapLabel(w: World, kind: CapKind, ovr?: WageCapOvr) {
  if (ovr === undefined) return '제한 없음';
  const money = compactMoney(wageCapWage(w, kind, ovr), clubOf(w).country, w.year);
  return `${kind === 'manager' ? 'OVR' : '능력'} ${ovr} 시세 · ${money}`;
}
/** The cap select's choices: 제한 없음 first, then every step labelled with today's going wage. */
export function wageCapOptions(w: World, kind: CapKind) {
  return [
    { value: 'none', label: wageCapLabel(w, kind) },
    ...WAGE_CAP_STEPS.map((ovr) => ({ value: String(ovr), label: wageCapLabel(w, kind, ovr) })),
  ];
}
/** The stored cap as the select's value; an unknown value reads as no cap. */
export function wageCapValue(ovr?: WageCapOvr) {
  return ovr === undefined ? 'none' : String(ovr);
}
export function wageCapFrom(value: string): WageCapOvr | undefined {
  const ovr = Number(value) as WageCapOvr;
  return WAGE_CAP_STEPS.includes(ovr) ? ovr : undefined;
}

/** The eight schools (→STAFF-14) with their labels, in the engine's order. */
export const SCHOOLS: readonly [ManagerStyle, string][] = MANAGER_STYLES.map((style) => [
  style,
  STYLE_INFO[style].label,
]);
/** Selection traits (→STAFF-12) a manager may be asked to have; `none` is a manager without one. */
export const SELECTION_TRAITS: readonly ['none' | ManagerTrait, string][] = [
  ['none', '성향 없음'],
  ...MANAGER_TRAITS.map((trait): [ManagerTrait, string] => [
    trait,
    MANAGER_TRAIT_INFO[trait].label,
  ]),
];
/** The coaching departments with their labels, in display order (→STAFF-11). */
export const DEPARTMENTS: readonly [StaffRole, string][] = STAFF_ROLES.map((role) => [
  role,
  STAFF_INFO[role].label,
]);
/** The traits a department's coaches can have (→STAFF-11), with their labels. */
export function departmentTraits(role: StaffRole): [StaffTrait, string][] {
  return STAFF_INFO[role].traits.map((trait) => [trait, STAFF_TRAIT_INFO[trait].label]);
}

/** The talk rule's wage caps, as a share of the market wage. */
export const TALK_PAY_STEPS = TALK_PAY_CAPS;
/** The talk rule's 최소 OVR steps: 제한 없음 (0), then 50–80 by 5. */
export const TALK_MIN_OVR_STEPS = [0, 50, 55, 60, 65, 70, 75, 80];
/** The talk rule's 최대 나이 steps: 28–40. */
export const TALK_AGE_STEPS = Array.from(
  { length: TALK_AGE_LIMITS.max - TALK_AGE_LIMITS.min + 1 },
  (_, i) => TALK_AGE_LIMITS.min + i,
);
/** Threshold steps for the manager and coach criteria. */
export const OVR_STEPS = [0, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85];
export const ATTRIBUTE_STEPS = [0, 20, 30, 40, 50, 60, 70, 80];
export const PRIDE_STEPS = [100, 90, 80, 70, 60, 50, 40, 30];

/**
 * A threshold select's values: its steps, plus the stored value when it lies between them, so a
 * stored number always shows as itself.
 */
export function stepsWith(steps: readonly number[], stored: number | undefined) {
  if (stored === undefined || steps.includes(stored)) return [...steps];
  const descending = steps.length > 1 && steps[1] < steps[0];
  return [...steps, stored].sort((a, b) => (descending ? b - a : a - b));
}

/** Plain data, keys in one order and lists sorted, so two drafts compare by what they say. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return [...value].map(canonical).sort();
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, field]) => [key, canonical(field)]),
    );
  return value;
}
/** Whether two criteria say the same: field order, list order and absent fields do not count. */
export function sameCriteria(a: object, b: object) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
/**
 * A fresh draft: the stored criteria over the defaults (lists copied), or the defaults alone,
 * which is what 기본값으로 puts back.
 */
export function withDefaults<T extends object>(defaults: Readonly<T>, stored?: Partial<T>): T {
  const draft = { ...defaults, ...stored } as Record<string, unknown>;
  for (const [key, value] of Object.entries(draft))
    if (value === undefined) delete draft[key];
    else if (Array.isArray(value)) draft[key] = [...value];
  return draft as T;
}
/** 기준 적용 sends only a draft that differs from the stored criteria, never while acting. */
export function canApply(draft: object, stored: object, pending: boolean) {
  return !pending && !sameCriteria(draft, stored);
}
/** Toggles one chip of a multi-select; an empty list is 상관없음. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((one) => one !== value) : [...list, value];
}
