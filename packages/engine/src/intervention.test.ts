import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  createWorld,
  operate,
  STAFF_ROLES,
  coachDelegated,
  delegated,
  INTERVENTION_DELEGATES,
  DELEGATION_KEYS,
} from './index';
import {
  RESPONSIBILITY_KEYS,
  defaultSettings,
  legacySettings,
  isDelegated,
} from './responsibilities';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Responsibility Town',
    color: '#224466',
    seed: 'responsibilities',
    level: 'normal',
  });
describe('seven independent business responsibilities', () => {
  it('starts with the seven approved defaults and keeps acquisition separate from sales', () => {
    const w = world();
    expect(w.settings).toEqual(defaultSettings());
    expect(RESPONSIBILITY_KEYS).toHaveLength(7);
    const settings = structuredClone(w.settings!);
    settings.responsibilities.recruitment = 'delegated';
    operate(w, { type: 'settings', settings });
    expect(isDelegated(w, 'recruitment')).toBe(true);
    expect(isDelegated(w, 'sales')).toBe(false);
  });
  it.each(RESPONSIBILITY_KEYS)('changes only %s when all other categories stay direct', (key) => {
    const w = world(),
      settings = defaultSettings();
    for (const category of RESPONSIBILITY_KEYS) settings.responsibilities[category] = 'direct';
    settings.responsibilities[key] = 'delegated';
    operate(w, { type: 'settings', settings });
    expect(RESPONSIBILITY_KEYS.filter((category) => isDelegated(w, category))).toEqual([key]);
  });
  it('fills delegated staff posts without changing unrelated authority and keeps owner actions independent', () => {
    const w = world();
    w.cash = '999999999999';
    const settings = structuredClone(w.settings!);
    settings.responsibilities.staff = 'delegated';
    operate(w, { type: 'settings', settings });
    expect(STAFF_ROLES.every((role) => coachDelegated(w, role))).toBe(true);
    operate(w, { type: 'release-staff', role: 'scout' });
    expect(w.settings).toEqual(settings);
  });
  it('rejects manual mode without match observations atomically', () => {
    const w = world(),
      settings = structuredClone(w.settings!);
    settings.mode = 'manual';
    settings.observations.matchEve = false;
    const before = canonical(w);
    expect(() => operate(w, { type: 'settings', settings })).toThrow();
    expect(canonical(w)).toBe(before);
  });
});
describe('recognized legacy authority compatibility only', () => {
  it('keeps the old category map for historical fixtures without making it a public control', () => {
    expect(INTERVENTION_DELEGATES[1]).toEqual([]);
    expect(INTERVENTION_DELEGATES[2]).toEqual(['academy', 'contracts']);
    expect(INTERVENTION_DELEGATES[4]).toEqual(DELEGATION_KEYS);
    const w = world();
    delete w.settings;
    w.intervention = 4;
    expect(DELEGATION_KEYS.every((key) => delegated(w, key))).toBe(true);
    expect(legacySettings(3).responsibilities).toMatchObject({
      manager: 'delegated',
      recruitment: 'direct',
      sales: 'direct',
    });
  });
});
