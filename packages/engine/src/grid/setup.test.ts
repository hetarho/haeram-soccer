import { describe, expect, it } from 'vitest';
import type { Fixture, Player } from '../../../contracts/src/types';
import { MATCH_MOTION_CONFIG } from '../motion';
import { createWorld, isInjured, ownStarters, squad } from '../index';
import { benchFor, buildGridSetup, eraRules, takersFor } from './setup';
import { ROLE_SHIFT, SPOTS } from './spots';

const w = createWorld({
  country: 'ENG',
  name: 'Grid Setup Lab',
  color: '#2a5d8f',
  seed: 'grid-setup',
  level: 'normal' as const,
});
const own = w.fixtures.find((f) => f.home === w.playerClub)!;
const npcClubs = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
const neutral: Fixture = { ...own, id: 'neutral', home: npcClubs[0]!.id, away: npcClubs[1]!.id };

describe('grid setup', () => {
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

  it('builds a setup for an own match and an NPC fixture', () => {
    const a = buildGridSetup(w, own, { observe: false, recordPlayers: true });
    expect(a.own).toBe(own.home === w.playerClub ? 0 : 1);
    expect(a.rosters[0]).toHaveLength(11 + a.bench[0]);
    expect(a.rosters[1]).toHaveLength(11 + a.bench[1]);
    expect(a.bench[0]).toBe(eraRules(own.year).named);
    const bends = a.bends[a.own!];
    expect(Object.keys(bends).sort()).toEqual([
      'defense',
      'lineHigh',
      'lineLow',
      'pass',
      'possession',
      'shot',
    ]);
    expect(a.bends[1 - a.own!]).toEqual({
      pass: 0,
      possession: 0,
      shot: 0,
      defense: 0,
      lineHigh: 0,
      lineLow: 0,
    });
    const b = buildGridSetup(w, neutral, { observe: true, recordPlayers: false });
    expect(b.own).toBeUndefined();
    expect(b.rosters[0].slice(11).map((p) => p.id)).toEqual(
      squad(
        w,
        w.clubs.find((c) => c.id === neutral.home)!,
      )
        .slice(11, 11 + b.bench[0])
        .map((p) => p.id),
    );
    expect(b.drain).toEqual([1, 1]);
    expect(typeof b.r()).toBe('number');
  });

  it('keeps the formation spots equal to the motion config in metres', () => {
    for (const tactic of ['balanced', 'possession', 'counter', 'press'] as const)
      MATCH_MOTION_CONFIG.formations[tactic].forEach((u, slot) => {
        expect(SPOTS[tactic][slot]![0]).toBeCloseTo(u[0]! * 1.05, 9);
        expect(SPOTS[tactic][slot]![1]).toBeCloseTo(u[1]! * 0.68, 9);
      });
    for (const [role, shift] of Object.entries(MATCH_MOTION_CONFIG.roleShift)) {
      const got = ROLE_SHIFT[role as keyof typeof ROLE_SHIFT]!;
      expect(got[0]).toBeCloseTo(shift![0]! * 1.05, 9);
      expect(got[1]).toBeCloseTo(shift![1]! * 0.68, 9);
    }
  });
});
