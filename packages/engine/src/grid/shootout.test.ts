import { describe, expect, it } from 'vitest';
import type { Fixture } from '../../../contracts/src/types';
import { tieRule } from '../knockout';
import { random } from '../primitives';
import { playGrid } from './engine';
import { buildGridSetup, isLevel } from './setup';
import { kickChance, playShootout, takerOrder } from './shootout';
import { onPitch, skill } from './state';
import { gridKit } from './testkit';

/** A scripted stream: each value in turn, then the last one forever. */
const script = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

describe('extra time and penalty shoot-outs (→MATCH-6)', () => {
  it('plays extra time only when level', () => {
    const { w, f } = gridKit();
    let level = 0,
      decided = 0;
    for (let i = 0; i < 40 && !(level && decided); i++) {
      const fixture: Fixture = { ...f, id: `et-${i}` };
      const setup = buildGridSetup(w, fixture, {
        observe: false,
        recordPlayers: true,
        decide: { awayGoals: false },
      });
      const { record } = playGrid(setup);
      if (record.regulation) {
        level++;
        expect(record.regulation.home).toBe(record.regulation.away);
        expect(record.added).toHaveLength(4);
        expect(record.metrics[0][10]).toBe(120);
        expect(record.score.home).toBeGreaterThanOrEqual(record.regulation.home);
        // Still level after 120 minutes: the shoot-out decides it.
        expect(!!record.shootout).toBe(record.score.home === record.score.away);
      } else {
        decided++;
        expect(record.score.home).not.toBe(record.score.away);
        expect(record.added).toHaveLength(2);
        expect(record.metrics[0][10]).toBe(90);
        expect(record.shootout).toBeUndefined();
      }
    }
    expect(level).toBeGreaterThan(0);
    expect(decided).toBeGreaterThan(0);
    // A league match is never extended.
    const league = playGrid(buildGridSetup(w, f, { observe: false, recordPlayers: true })).record;
    expect(league.added).toHaveLength(2);
    expect(league.regulation).toBeUndefined();
  });
  it('respects away goals before 2021', () => {
    // First leg 2–1 to A at home; B hosts the return.
    const legs: Fixture[] = [
      {
        id: 'tie',
        year: 2000,
        round: 1,
        kind: 'europe',
        home: 'A',
        away: 'B',
        country: 'EU',
        groupKey: 'UCL',
        score: { home: 2, away: 1 },
      },
      {
        id: 'tie:2',
        year: 2000,
        round: 3,
        kind: 'europe',
        home: 'B',
        away: 'A',
        country: 'EU',
        groupKey: 'UCL',
      },
    ];
    const rule = tieRule(legs[1]!, legs, true)!;
    expect(rule).toEqual({ first: { home: 1, away: 2 }, awayGoals: true });
    // 2–1 to B: 3–3 on aggregate and one away goal each, so extra time.
    expect(isLevel(rule, 2, 1)).toBe(true);
    // 1–0 to B: 2–2, but B scored away and A did not, so B is through.
    expect(isLevel(rule, 1, 0)).toBe(false);
    // From 2021 the same 1–0 is level and goes to extra time.
    expect(isLevel({ ...rule, awayGoals: false }, 1, 0)).toBe(true);
    // A first leg decides nothing; a single match must produce a winner.
    expect(tieRule(legs[0]!, legs, true)).toBeUndefined();
    expect(tieRule({ ...legs[0]!, id: 'final' }, [], false)).toEqual({ awayGoals: false });
  });
  it('alternates kicks and goes to sudden death', () => {
    const { state } = gridKit();
    // Ten kicks in, then the home side scores and the away side misses.
    const sudden = playShootout(state, script(...Array(10).fill(0), 0, 0.999));
    expect(sudden.score).toEqual({ home: 6, away: 5 });
    expect(sudden.kicks.map((k) => k.side)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
    // Three home goals against three misses: the away side cannot catch up after six kicks.
    let kick = 0;
    const early = playShootout(state, () => (kick++ % 2 === 0 ? 0 : 0.999));
    expect(early.score).toEqual({ home: 3, away: 0 });
    expect(early.kicks).toHaveLength(6);
  });
  it('orders takers by skill with the keeper last', () => {
    const { state } = gridKit();
    for (const side of [0, 1] as const) {
      const order = takerOrder(state, side);
      expect(order).toHaveLength(state.players[side].filter(onPitch).length);
      expect(state.players[side][order.at(-1)!]!.slot).toBe(0);
      const value = (idx: number) =>
        0.6 * skill(state, side, idx, 'finishing') + 0.4 * skill(state, side, idx, 'composure');
      const outfield = order.slice(0, -1).map(value);
      expect(outfield).toEqual([...outfield].sort((a, b) => b - a));
    }
  });
  it('scores about 76% of kicks between equal sides', () => {
    const { state } = gridKit();
    let kicks = 0,
      scored = 0;
    for (let i = 0; i < 400; i++)
      for (const k of playShootout(state, random(`kicks:${i}`)).kicks) {
        kicks++;
        if (k.scored) scored++;
      }
    expect(scored / kicks).toBeGreaterThan(0.7);
    expect(scored / kicks).toBeLessThan(0.86);
    expect(kickChance(state, 0, takerOrder(state, 0)[0]!)).toBeLessThanOrEqual(0.92);
  });
});
