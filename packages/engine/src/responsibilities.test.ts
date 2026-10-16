import { describe, expect, it } from 'vitest';
import { gameSettingsSchema } from '../../contracts/src/schema';
import { createWorld, operate, defaultSettings, isDelegated, RESPONSIBILITY_KEYS } from './index';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Authority Town',
    color: '#224466',
    seed: 'responsibilities',
    level: 'normal',
  });
describe('game-owned responsibility and time settings', () => {
  it('starts with seven independent approved defaults', () => {
    const w = world();
    expect(w.settings).toEqual({
      responsibilities: {
        manager: 'direct',
        staff: 'delegated',
        contracts: 'direct',
        recruitment: 'direct',
        sales: 'direct',
        academy: 'delegated',
        sponsors: 'delegated',
      },
      mode: 'automatic',
      observations: { matchEve: true, windowOpen: false },
    });
    expect(RESPONSIBILITY_KEYS).toHaveLength(7);
    expect(RESPONSIBILITY_KEYS.filter((k) => isDelegated(w, k))).toEqual([
      'staff',
      'academy',
      'sponsors',
    ]);
  });
  it('applies a complete independent mixed map without sharing mutable inputs', () => {
    const w = world(),
      s = defaultSettings();
    s.responsibilities.recruitment = 'delegated';
    operate(w, { type: 'settings', settings: s });
    s.responsibilities.recruitment = 'direct';
    expect(isDelegated(w, 'recruitment')).toBe(true);
    expect(isDelegated(w, 'sales')).toBe(false);
  });
  for (const authority of ['direct', 'delegated'] as const) {
    it(`requires match eve for manual with every responsibility ${authority}`, () => {
      const w = world(),
        s = defaultSettings();
      for (const k of RESPONSIBILITY_KEYS) s.responsibilities[k] = authority;
      s.mode = 'manual';
      s.observations = { matchEve: false, windowOpen: true };
      const before = JSON.stringify(w);
      expect(() => operate(w, { type: 'settings', settings: s })).toThrow(
        '수동 모드에는 경기 이벤트가 필요해요',
      );
      expect(JSON.stringify(w)).toBe(before);
    });
  }
  it('rejects disabling match eve after manual activation without partial application', () => {
    const w = world(),
      s = defaultSettings();
    s.mode = 'manual';
    operate(w, { type: 'settings', settings: s });
    const before = JSON.stringify(w);
    s.observations.matchEve = false;
    s.responsibilities.contracts = 'delegated';
    expect(() => operate(w, { type: 'settings', settings: s })).toThrow();
    expect(JSON.stringify(w)).toBe(before);
  });
  it('allows automatic with no observation stops and rejects malformed/extra keys', () => {
    const w = world(),
      s = defaultSettings();
    s.observations = { matchEve: false, windowOpen: false };
    operate(w, { type: 'settings', settings: s });
    expect(w.settings).toEqual(s);
    expect(gameSettingsSchema.safeParse({ ...s, mode: 'fast' }).success).toBe(false);
    expect(
      gameSettingsSchema.safeParse({
        ...s,
        responsibilities: { ...s.responsibilities, training: 'direct' },
      }).success,
    ).toBe(false);
    expect(
      gameSettingsSchema.safeParse({ ...s, observations: { matchEve: 1, windowOpen: false } })
        .success,
    ).toBe(false);
  });
});
