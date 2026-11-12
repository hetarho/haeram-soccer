import { describe, expect, it } from 'vitest';
import type { Player } from '../../../contracts/src/types';
import { isInjured, ownStarters } from '../index';
import { careerWorld } from '../career.testkit';
import { takersFor } from './bench';
import { MATCH_MOTION_CONFIG } from './motion';
import { benchFor } from './roster';
import { eraRules } from './rules';
import { SPOTS } from './spots';

const w = careerWorld({ seed: 'grid-setup' });

/** The matchday rules and picks every result path reads (moved from grid/setup.test.ts, T842). */
describe('matchday roster', () => {
  it('follows the era substitute table', () => {
    const rows: [number, number, number, boolean, number | undefined][] = [
      [1964, 0, 0, false, undefined],
      [1965, 1, 1, true, undefined],
      [1966, 1, 1, true, undefined],
      [1967, 1, 1, false, undefined],
      [1986, 1, 1, false, undefined],
      [1987, 2, 2, false, undefined],
      [1995, 3, 3, false, undefined],
      [1996, 5, 3, false, undefined],
      [2007, 5, 3, false, undefined],
      [2008, 7, 3, false, undefined],
      [2021, 7, 3, false, undefined],
      [2022, 9, 5, false, 3],
    ];
    for (const [year, named, maxSubs, injuryOnly, windows] of rows)
      expect(eraRules(year), String(year)).toMatchObject({ named, maxSubs, injuryOnly, windows });
    expect(eraRules(1969).cards).toBe(false);
    expect(eraRules(1970).cards).toBe(true);
  });

  it('names a goalkeeper first once three substitutes may be named', () => {
    const xi = ownStarters(w);
    const bench = benchFor(
      w,
      w.clubs.find((c) => c.id === w.playerClub)!,
      xi,
      eraRules(1995),
    );
    expect(bench).toHaveLength(3);
    expect(bench[0]!.positions.GK).toBeGreaterThan(0);
    expect(
      benchFor(
        w,
        w.clubs.find((c) => c.id === w.playerClub)!,
        xi,
        eraRules(1964),
      ),
    ).toEqual([]);
    expect(
      benchFor(
        w,
        w.clubs.find((c) => c.id === w.playerClub)!,
        xi,
        eraRules(2022),
      ),
    ).toHaveLength(9);
  });

  it('never names an injured player on the bench', () => {
    const club = w.clubs.find((c) => c.id === w.playerClub)!;
    const xi = ownStarters(w);
    const before = benchFor(w, club, xi, eraRules(2022));
    const hurt = before[0]!;
    const injured: Player = { ...hurt, injury: { year: w.year, day: 10000, label: '검사' } };
    const copy = { ...w, players: w.players.map((p) => (p === hurt ? injured : p)) };
    expect(isInjured(copy, injured)).toBe(true);
    const after = benchFor(copy, club, ownStarters(copy), eraRules(2022));
    expect(after.some((p) => p.id === hurt.id)).toBe(false);
    expect(after.every((p) => !isInjured(copy, p))).toBe(true);
    const banned = benchFor(w, club, xi, eraRules(2022), (p) => p.id === before[1]!.id);
    expect(banned.some((p) => p.id === before[1]!.id)).toBe(false);
  });

  it('picks takers by their keys', () => {
    const xi = ownStarters(w);
    const takers = takersFor(xi);
    const key = (i: number, f: (p: Player) => number) => f(xi[i]!);
    const pen = (p: Player) => 0.6 * p.attrs.finishing + 0.4 * p.attrs.composure;
    for (let i = 1; i < xi.length; i++)
      expect(key(takers.penalty, pen)).toBeGreaterThanOrEqual(key(i, pen));
    for (let i = 1; i < xi.length; i++)
      expect(xi[takers.corner]!.attrs.crossing).toBeGreaterThanOrEqual(xi[i]!.attrs.crossing);
    expect(takers.penalty).toBeGreaterThan(0);
  });

  it('gives the UI the formation spots in pitch units', () => {
    for (const tactic of ['balanced', 'possession', 'counter', 'press'] as const) {
      const spots = MATCH_MOTION_CONFIG.formations[tactic];
      expect(spots).toHaveLength(11);
      expect(spots[0]![0]).toBeCloseTo(5, 9);
      expect(spots[0]![1]).toBeCloseTo(50, 9);
      spots.forEach((u, slot) => {
        expect(SPOTS[tactic][slot]![0]).toBeCloseTo(u[0] * 1.05, 9);
        expect(SPOTS[tactic][slot]![1]).toBeCloseTo(u[1] * 0.68, 9);
      });
    }
  });
});
