import { describe, expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import {
  COACH_CRITERIA_DEFAULT,
  MANAGER_CRITERIA_DEFAULT,
} from '../../../../packages/engine/src/hiring';
import { managerCapWage } from '../../../../packages/engine/src/managerMarket';
import { coachWage, STAFF_INFO, STAFF_ROLES } from '../../../../packages/engine/src/staff';
import { clubOf } from '../../../../packages/engine/src/world';
import {
  canApply,
  departmentTraits,
  sameCriteria,
  stepsWith,
  wageCapFrom,
  wageCapLabel,
  wageCapOptions,
  wageCapValue,
  withDefaults,
} from './criteria';
import { compactMoney } from './format';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Criteria',
    color: '#2a5d8f',
    seed: 'criteria-editors',
    difficulty: 2,
  });

describe('criteria editors', () => {
  it("wage cap steps name today's going wage and keep the stored OVR step", () => {
    const w = world(),
      code = clubOf(w).country;
    const manager = wageCapOptions(w, 'manager');
    expect(manager[0]).toEqual({ value: 'none', label: '제한 없음' });
    expect(manager.map((option) => option.value).slice(1)).toEqual([
      '50',
      '55',
      '60',
      '65',
      '70',
      '75',
      '80',
      '85',
      '90',
    ]);
    expect(manager.find((option) => option.value === '70')!.label).toBe(
      `OVR 70 시세 · ${compactMoney(managerCapWage(w, 70), code, w.year)}`,
    );
    expect(wageCapLabel(w, 'coach', 60)).toBe(
      `능력 60 시세 · ${compactMoney(coachWage(w, 60), code, w.year)}`,
    );
    // Years later the step names that year's money; the stored step itself stays 70.
    const later = { ...w, year: w.year + 30 };
    expect(wageCapValue(70)).toBe('70');
    expect(wageCapFrom(wageCapValue(70))).toBe(70);
    expect(wageCapOptions(later, 'manager').find((option) => option.value === '70')!.label).toBe(
      `OVR 70 시세 · ${compactMoney(managerCapWage(later, 70), code, later.year)}`,
    );
    expect(wageCapFrom('none')).toBeUndefined();
    expect(wageCapFrom('72')).toBeUndefined();
    // A stored threshold between the steps shows as itself.
    expect(stepsWith([0, 50, 55, 60], 57)).toEqual([0, 50, 55, 57, 60]);
    expect(stepsWith([100, 90, 80], 85)).toEqual([100, 90, 85, 80]);
    expect(stepsWith([0, 50], 50)).toEqual([0, 50]);
  });

  it('a draft equal to the stored criteria disables 적용', () => {
    const stored = { ...MANAGER_CRITERIA_DEFAULT, schools: ['gegenpress', 'counter'] as const };
    const draft = withDefaults(MANAGER_CRITERIA_DEFAULT, {
      ...stored,
      schools: ['counter', 'gegenpress'],
    });
    // Lists are copied, so editing the draft never touches the stored value.
    expect(draft.schools).not.toBe(stored.schools);
    expect(sameCriteria(draft, stored)).toBe(true);
    expect(canApply(draft, stored, false)).toBe(false);
    const changed = { ...draft, minOvr: 60 };
    expect(canApply(changed, stored, false)).toBe(true);
    // Pending actions hold 적용 too.
    expect(canApply(changed, stored, true)).toBe(false);
    // An absent cap and an undefined one say the same; a set cap differs.
    expect(sameCriteria({ ...draft, maxWageOvr: undefined }, stored)).toBe(true);
    expect(sameCriteria({ ...draft, maxWageOvr: 70 }, stored)).toBe(false);
    // 기본값으로 puts back the defaults.
    expect(sameCriteria(withDefaults(COACH_CRITERIA_DEFAULT), COACH_CRITERIA_DEFAULT)).toBe(true);
    expect(withDefaults(COACH_CRITERIA_DEFAULT)).not.toBe(COACH_CRITERIA_DEFAULT);
  });

  it("the trait list of a department is that department's", () => {
    for (const role of STAFF_ROLES)
      expect(departmentTraits(role).map(([trait]) => trait)).toEqual(STAFF_INFO[role].traits);
    expect(departmentTraits('goalkeeping')).toEqual([['specialist', '전문가']]);
    expect(departmentTraits('scout').map(([, label]) => label)).toEqual(['발굴가', '협상가']);
  });
});
