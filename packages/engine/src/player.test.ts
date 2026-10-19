import { describe, expect, it } from 'vitest';
import { ATTRIBUTES, POSITIONS, type Attributes, type Position } from '../../contracts/src/player';
import { random } from './primitives';
import {
  adaptationAfter,
  adaptationMultiplier,
  adaptationStart,
  AGEING,
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABEL,
  bestRoleAt,
  FORMATIONS,
  generateProfile,
  lineOf,
  mainOvr,
  managerChangeLoss,
  ovrAt,
  overshootFactor,
  personalityRange,
  ROLES,
  rolesAt,
  schoolFactor,
  weightsFor,
} from './player';

const flat = (value: number): Attributes =>
  Object.fromEntries(ATTRIBUTES.map((a) => [a, value])) as Attributes;

describe('player model', () => {
  it('ovr one scale', () => {
    const keeper = generateProfile(random('scale:gk'), 'GK', 70);
    const striker = generateProfile(random('scale:st'), 'ST', 70);
    expect(Math.abs(mainOvr({ attrs: keeper.attrs, position: 'GK' }) - 70)).toBeLessThanOrEqual(1);
    expect(Math.abs(mainOvr({ attrs: striker.attrs, position: 'ST' }) - 70)).toBeLessThanOrEqual(1);
    expect(ovrAt(flat(60), 'CB')).toBeCloseTo(60);
  });

  it('role promotion', () => {
    const base = weightsFor('CB');
    const ballPlaying = weightsFor('CB', 'ballPlayingDefender');
    expect(base.passing).toBe(1);
    expect(ballPlaying.passing).toBe(2);
    expect(base.vision).toBe(0);
    expect(ballPlaying.vision).toBe(1);
    for (const a of ATTRIBUTES)
      if (a !== 'passing' && a !== 'vision') expect(ballPlaying[a]).toBe(base[a]);
    expect(weightsFor('GK', 'shotStopper')).toEqual(weightsFor('GK'));
    expect(weightsFor('ST', 'poacher').positioning).toBe(3);
    const passer = { ...flat(50), passing: 90, vision: 90 };
    expect(bestRoleAt(passer, 'CB')).toBe('ballPlayingDefender');
  });

  it('adaptation multiplier', () => {
    expect(adaptationMultiplier(1)).toBeCloseTo(1.05);
    expect(adaptationMultiplier(0.9)).toBeCloseTo(1.025);
    expect(adaptationMultiplier(0.8)).toBeCloseTo(1);
    expect(adaptationMultiplier(0.6)).toBeCloseTo(0.88);
    expect(adaptationMultiplier(0.4)).toBeCloseTo(0.76);
    expect(adaptationMultiplier(0.3)).toBeCloseTo(0.7);
    expect(adaptationMultiplier(0.7)).toBeCloseTo(0.94);
    expect(adaptationMultiplier(0.1)).toBeCloseTo(0.7);
  });

  it('adaptation start', () => {
    expect(adaptationStart(1, 'founding')).toBe(0.8);
    expect(adaptationStart(5, 'academy')).toBe(0.8);
    expect([1, 2, 3, 4, 5].map((g) => adaptationStart(g as 1, 'domestic'))).toEqual([
      0.45, 0.5, 0.55, 0.6, 0.65,
    ]);
    expect(adaptationStart(3, 'abroad')).toBe(0.45);
  });

  it('adaptation gain', () => {
    expect(adaptationAfter(0.5, 0.02)).toBeCloseTo(0.52);
    expect(adaptationAfter(0.8, 0.02)).toBeCloseTo(0.81);
    expect(adaptationAfter(0.79, 0.02)).toBeCloseTo(0.805);
    expect(adaptationAfter(0.79, 0.02, { trainingOnly: true })).toBeCloseTo(0.8);
    expect(adaptationAfter(0.85, 0.02, { trainingOnly: true })).toBeCloseTo(0.85);
    expect(adaptationAfter(0.995, 0.02)).toBe(1);
  });

  it('manager change', () => {
    expect(managerChangeLoss(1, false)).toBeCloseTo(0.85);
    expect(managerChangeLoss(1, true)).toBeCloseTo(0.95);
    expect(managerChangeLoss(0.8, false)).toBeCloseTo(0.71);
    expect(managerChangeLoss(0.45, false)).toBe(0.45);
  });

  it('overshoot', () => {
    expect(overshootFactor(0)).toBe(1);
    expect(overshootFactor(-3)).toBe(1);
    expect(overshootFactor(1)).toBeCloseTo(0.25);
    expect(overshootFactor(3)).toBeCloseTo(0.1);
    expect(overshootFactor(5)).toBeCloseTo(0.05);
    expect(overshootFactor(10)).toBeCloseTo(0.02);
    expect(overshootFactor(2)).toBeLessThan(0.25);
    expect(overshootFactor(2)).toBeGreaterThan(0.1);
    expect(overshootFactor(20)).toBeCloseTo(0.01);
  });

  it('formations', () => {
    const order = ['GK', 'DF', 'MF', 'FW'];
    for (const formation of Object.values(FORMATIONS)) {
      expect(formation.slots).toHaveLength(11);
      expect(formation.slots[0]!.position).toBe('GK');
      const lines = formation.slots.map((s) => order.indexOf(lineOf(s.position)));
      expect([...lines].sort((a, b) => a - b)).toEqual(lines);
      for (const s of formation.slots) expect(ROLES[s.role].positions).toContain(s.position);
    }
    expect(FORMATIONS.balanced.slots.filter((s) => lineOf(s.position) === 'DF')).toHaveLength(5);
  });

  it('generation', () => {
    for (const position of POSITIONS)
      for (const rating of [35, 60, 80]) {
        const counts = [0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 500; i++) {
          const profile = generateProfile(
            random(`gen:${position}:${rating}:${i}`),
            position,
            rating,
          );
          expect(
            Math.abs(mainOvr({ attrs: profile.attrs, position }) - rating),
          ).toBeLessThanOrEqual(1);
          expect(profile.positions[position]).toBe(3);
          expect(profile.traits.length).toBeLessThanOrEqual(3);
          counts[Object.keys(profile.positions).length]!++;
        }
        if (position === 'GK') expect(counts[1]).toBe(500);
        if (position === 'CM') {
          expect(Math.abs(counts[1]! / 5 - 25)).toBeLessThanOrEqual(5);
          expect(Math.abs(counts[2]! / 5 - 35)).toBeLessThanOrEqual(5);
        }
      }
    const grades = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 2000; i++)
      grades[generateProfile(random(`grade:${i}`), 'CB', 60).personality.professionalism]!++;
    expect(Math.abs(grades[3]! / 20 - 40)).toBeLessThanOrEqual(3);
    expect(Math.abs(grades[1]! / 20 - 8)).toBeLessThanOrEqual(3);
    const a = generateProfile(random('same'), 'LW', 64);
    const b = generateProfile(random('same'), 'LW', 64);
    expect(a).toEqual(b);
    const asked = generateProfile(random('role'), 'CB', 70, 'ballPlayingDefender');
    expect(Math.abs(ovrAt(asked.attrs, 'CB', 'ballPlayingDefender') - 70)).toBeLessThanOrEqual(1);
  });

  it('school factor', () => {
    const player = {
      attrs: { ...flat(50), passing: 70, vision: 66 },
      traits: ['playmaker' as const],
      age: 25,
    };
    expect(schoolFactor({ neutral: true }, player)).toBe(1);
    expect(schoolFactor({ style: 'positional', neutral: false }, player)).toBe(1.1);
    expect(schoolFactor({ style: 'gegenpress', neutral: false }, player)).toBe(0.8);
    const young = { ...player, age: 20, traits: ['playmaker' as const, 'technician' as const] };
    expect(schoolFactor({ style: 'developer', neutral: false }, young)).toBe(1.2);
  });

  it('scout range', () => {
    expect(personalityRange(3, 85)).toEqual([3, 3]);
    expect(personalityRange(3, 65)).toEqual([2, 4]);
    expect(personalityRange(3, 40)).toEqual([1, 5]);
    expect(personalityRange(5)).toEqual([3, 5]);
  });

  it('generates all sixteen attributes', () => {
    expect(ATTRIBUTES).toHaveLength(16);
    expect(ATTRIBUTES.slice(-3)).toEqual(['distribution', 'decisions', 'composure']);
    expect([ATTRIBUTE_LABEL.decisions, ATTRIBUTE_LABEL.composure]).toEqual(['판단력', '침착성']);
    expect(ATTRIBUTE_GROUPS.map((group) => group.label)).toEqual([
      '공격',
      '패스',
      '수비',
      '신체',
      '정신',
      'GK',
    ]);
    expect(ATTRIBUTE_GROUPS[4]!.attributes).toEqual(['decisions', 'composure']);
    for (const position of POSITIONS) {
      const { attrs } = generateProfile(random(`sixteen:${position}`), position, 70);
      expect(Object.keys(attrs).sort()).toEqual([...ATTRIBUTES].sort());
      for (const a of ATTRIBUTES) {
        expect(Number.isInteger(attrs[a])).toBe(true);
        expect(attrs[a]).toBeGreaterThanOrEqual(1);
        expect(attrs[a]).toBeLessThanOrEqual(99);
      }
      if (position !== 'GK')
        for (const a of ['reflexes', 'handling', 'distribution'] as const) {
          expect(attrs[a]).toBeGreaterThanOrEqual(8);
          expect(attrs[a]).toBeLessThanOrEqual(20);
        }
    }
  });

  it('weights decisions and composure by position (PLAYER-6 r9)', () => {
    const expected: Record<Position, [decisions: number, composure: number]> = {
      GK: [1, 0],
      CB: [2, 0],
      LB: [1, 0],
      RB: [1, 0],
      LWB: [1, 0],
      RWB: [1, 0],
      DM: [2, 0],
      CM: [2, 1],
      LM: [1, 0],
      RM: [1, 0],
      AM: [2, 1],
      LW: [0, 1],
      RW: [0, 1],
      ST: [0, 2],
    };
    for (const position of POSITIONS) {
      const weights = weightsFor(position);
      expect([weights.decisions, weights.composure], position).toEqual(expected[position]);
    }
    expect(ROLES.anchor.promotes).toEqual(['decisions']);
    expect(weightsFor('DM', 'anchor').decisions).toBe(3);
    expect(ROLES.deepLyingPlaymaker.promotes).toEqual(['vision', 'decisions']);
    expect(weightsFor('CM', 'deepLyingPlaymaker').decisions).toBe(3);
    expect(ROLES.poacher.promotes).toEqual(['positioning', 'composure']);
    expect(weightsFor('ST', 'poacher').composure).toBe(3);
  });

  it('young players start lower on decisions and composure', () => {
    for (const position of POSITIONS) {
      let gap = 0;
      const n = 40;
      for (let i = 0; i < n; i++) {
        const seed = `mental:${position}:${i}`;
        const older = generateProfile(random(seed), position, 60, undefined, 25);
        const young = generateProfile(random(seed), position, 60, undefined, 20);
        const unset = generateProfile(random(seed), position, 60);
        expect(unset).toEqual(older);
        expect(Math.abs(mainOvr({ attrs: young.attrs, position }) - 60)).toBeLessThanOrEqual(1);
        gap += older.attrs.decisions - young.attrs.decisions;
        gap += older.attrs.composure - young.attrs.composure;
      }
      const mean = gap / (2 * n);
      expect(mean, position).toBeGreaterThan(3.5);
      expect(mean, position).toBeLessThanOrEqual(5.5);
    }
    const at21 = generateProfile(random('mental:21'), 'CM', 60, undefined, 21);
    const at22 = generateProfile(random('mental:21'), 'CM', 60, undefined, 22);
    expect(at21.attrs.decisions).toBeLessThan(at22.attrs.decisions);
  });

  it('ages decisions and composure like vision', () => {
    expect(AGEING.decisions).toEqual({ growUntil: 32, declineFrom: 33, perSeason: 0.5 });
    expect(AGEING.composure).toEqual(AGEING.vision);
    expect(AGEING.decisions).toEqual(AGEING.vision);
  });

  it('every position has roles', () => {
    for (const position of POSITIONS as readonly Position[])
      expect(rolesAt(position).length).toBeGreaterThan(0);
  });
});
