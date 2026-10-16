import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  coachDelegated,
  createWorld,
  DELEGATION_KEYS,
  delegated,
  INTERVENTION_DELEGATES,
  INTERVENTION_LEVELS,
  interventionOf,
  operate,
  STAFF_ROLES,
} from './index';

const world = (seed = 'intervention') =>
  createWorld({
    country: 'ENG',
    name: 'Level Town',
    color: '#224466',
    seed,
    level: 'normal' as const,
  });

describe('the intervention level decides who takes each decision (→WEB-45, STAFF-13)', () => {
  it('hands the staff more decisions level by level', () => {
    expect(INTERVENTION_DELEGATES[1]).toEqual([]);
    expect(INTERVENTION_DELEGATES[2]).toEqual(['academy', 'contracts']);
    // Level 3 adds sponsors, the manager post and every coaching department; 4 adds transfers.
    expect(INTERVENTION_DELEGATES[3]).toEqual(DELEGATION_KEYS.filter((key) => key !== 'transfers'));
    expect(INTERVENTION_DELEGATES[4]).toEqual(DELEGATION_KEYS);
    // Each level keeps every decision the level above it keeps for the owner.
    for (const level of INTERVENTION_LEVELS.slice(1))
      for (const key of INTERVENTION_DELEGATES[(level - 1) as 1 | 2 | 3])
        expect(INTERVENTION_DELEGATES[level]).toContain(key);
  });

  it('uses seven saved defaults while careers without settings retain legacy authority', () => {
    const w = world();
    expect(w.intervention).toBe(2);
    expect(DELEGATION_KEYS.filter((key) => delegated(w, key))).toEqual(
      DELEGATION_KEYS.filter(
        (key) => key === 'academy' || key === 'business' || key.startsWith('coach:'),
      ),
    );
    delete w.settings;
    delete w.intervention;
    expect(interventionOf(w)).toBe(1);
    expect(DELEGATION_KEYS.some((key) => delegated(w, key))).toBe(false);
  });

  it('sets the level by command, filling delegated posts at once, and refuses another', () => {
    const w = world('intervention-command');
    w.cash = '999999999999';
    const volunteers = () =>
      STAFF_ROLES.filter(
        (role) => BigInt(w.staff!.find((member) => member.role === role)?.wage ?? '0') === 0n,
      );
    expect(volunteers()).toEqual(STAFF_ROLES);
    operate(w, { type: 'intervention', level: 4 });
    expect(w.intervention).toBe(4);
    expect(STAFF_ROLES.every((role) => coachDelegated(w, role))).toBe(true);
    // With money to spare the staff fill the volunteers' posts by each department's criteria.
    expect(volunteers().length).toBeLessThan(STAFF_ROLES.length);
    operate(w, { type: 'intervention', level: 1 });
    const before = canonical({ ...w, revision: 0 });
    for (const level of [0, 5, 2.5, '2'] as never[])
      expect(() => operate(w, { type: 'intervention', level })).toThrow('개입 수준');
    expect(canonical({ ...w, revision: 0 })).toBe(before);
    expect(interventionOf(w)).toBe(1);
  });

  it('lets the owner answer and hire at any level without changing who decides', () => {
    const w = world('intervention-owner');
    operate(w, { type: 'intervention', level: 4 });
    operate(w, { type: 'release-staff', role: 'scout' });
    expect(w.intervention).toBe(4);
    // The training focus is no level's: the coaches set it at every level (→CLUB-13).
    for (const level of INTERVENTION_LEVELS)
      expect(INTERVENTION_DELEGATES[level]).not.toContain('training' as never);
  });
});
