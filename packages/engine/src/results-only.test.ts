import { afterEach, describe, expect, it } from 'vitest';
import type { MatchPlayback } from '../../contracts/src/types';
import { historyWorld } from './history';
import { RESULTS_LUCK, resultsOnlyMatch } from './results-only';
import { equalSides } from './results-only.testkit';
import { M } from './grid/record';
import { lineOf } from './player';
import { ENABLED_RELEASE } from '../../../tests/fixtures/releases';

/**
 * The aggregate path on the same 1,200 meetings of `equalSides` (seed `results-only`, the released
 * model), measured by T669; history.test.ts compares the two paths live.
 */
const AGGREGATE = { home: 1.558, away: 1.315, draws: 0.237 };

const mean = (list: readonly MatchPlayback[], f: (p: MatchPlayback) => number) =>
  list.reduce((sum, p) => sum + f(p), 0) / list.length;
const goals = (p: MatchPlayback) => p.record.score.home + p.record.score.away;
const draw = (p: MatchPlayback) => (p.record.score.home === p.record.score.away ? 1 : 0);
const assists = (p: MatchPlayback) =>
  p.record.metrics[0][M.assists]! + p.record.metrics[1][M.assists]!;

describe('the results-only path before the takeover (→MATCH-22)', () => {
  it("holds the aggregate path's goal, home and draw shape for equal sides", () => {
    const w = historyWorld('results-only', ENABLED_RELEASE);
    const results = equalSides(w, 1200).fixtures.map((f) => resultsOnlyMatch(w, f));
    // T669's band: each side's goals within 0.2 and the draw rate within 5 points of the
    // aggregate path's means on the same meetings.
    const home = (p: MatchPlayback) => p.record.score.home;
    const away = (p: MatchPlayback) => p.record.score.away;
    expect(Math.abs(mean(results, home) - AGGREGATE.home)).toBeLessThan(0.2);
    expect(Math.abs(mean(results, away) - AGGREGATE.away)).toBeLessThan(0.2);
    expect(Math.abs(mean(results, draw) - AGGREGATE.draws)).toBeLessThan(0.05);
    expect(mean(results, home)).toBeGreaterThan(mean(results, away));
    // MATCH-23's 2.6–2.9 goals a match for equal top-flight sides.
    expect(mean(results, goals)).toBeGreaterThan(2.6);
    expect(mean(results, goals)).toBeLessThan(2.9);
    // About three goals in four are assisted, as on the aggregate path (0.72–0.74).
    const share = mean(results, assists) / mean(results, goals);
    expect(share).toBeGreaterThan(0.68);
    expect(share).toBeLessThan(0.8);
  });

  it('names every goal and assist to one of the eleven who play the whole match', () => {
    const w = historyWorld('results-only', ENABLED_RELEASE);
    const { fixtures } = equalSides(w, 400);
    const byLine = { GK: 0, DF: 0, MF: 0, FW: 0 };
    for (const f of fixtures) {
      const p = resultsOnlyMatch(w, f);
      const r = p.record;
      expect(r.model).toBeUndefined();
      expect(r.incidents).toEqual([]);
      expect(r.lineCounts).toEqual([11, 11]);
      expect(p.squads.map((xi) => xi.length)).toEqual([11, 11]);
      for (const side of [0, 1] as const) {
        const lines = r.players.slice(side * 11, side * 11 + 11);
        expect(lines.map((l) => l.id)).toEqual(p.squads[side].map((pl) => pl.id));
        const sum = (i: number) => lines.reduce((s, l) => s + l.metrics[i]!, 0);
        expect(sum(M.goals)).toBe(side === 0 ? r.score.home : r.score.away);
        expect(sum(M.goals)).toBe(r.metrics[side][M.goals]);
        expect(sum(M.assists)).toBe(r.metrics[side][M.assists]);
        expect(sum(M.assists)).toBeLessThanOrEqual(sum(M.goals));
        // Nothing else is drawn: no shots, passes or saves, and everyone plays 90 minutes.
        expect(sum(M.shots) + sum(M.passes) + sum(M.saves)).toBe(0);
        expect(lines.every((l) => l.metrics[M.minutes] === 90)).toBe(true);
        lines.forEach((l, slot) => {
          byLine[lineOf(p.squads[side][slot]!.position)] += l.metrics[M.goals]!;
        });
      }
    }
    // Forwards score most, keepers never (→MATCH-23: FW 50–60, MF 27–37, DF 8–15%).
    const total = byLine.FW + byLine.MF + byLine.DF + byLine.GK;
    expect(byLine.GK).toBe(0);
    expect(byLine.FW / total).toBeGreaterThan(0.45);
    expect(byLine.FW / total).toBeLessThan(0.7);
    expect(byLine.DF / total).toBeGreaterThan(0.04);
    expect(byLine.DF / total).toBeLessThan(0.2);
  });

  it('settles a level tie by extra time, then a shoot-out', () => {
    const w = historyWorld('results-only', ENABLED_RELEASE);
    const { fixtures } = equalSides(w, 300);
    let extra = 0,
      shootouts = 0;
    for (const f of fixtures) {
      const r = resultsOnlyMatch(w, f, { awayGoals: false }).record;
      if (!r.regulation) {
        expect(r.score.home).not.toBe(r.score.away);
        expect(r.metrics[0][M.minutes]).toBe(90);
        continue;
      }
      extra++;
      expect(r.regulation.home).toBe(r.regulation.away);
      expect(r.metrics[0][M.minutes]).toBe(120);
      expect(r.score.home).toBeGreaterThanOrEqual(r.regulation.home);
      if (r.score.home !== r.score.away) expect(r.shootout).toBeUndefined();
      else {
        shootouts++;
        expect(r.shootout!.home).not.toBe(r.shootout!.away);
      }
    }
    expect(extra).toBeGreaterThan(30);
    expect(shootouts).toBeGreaterThan(10);
  });

  it('gives the same fixture the same result', () => {
    const w = historyWorld('results-only', ENABLED_RELEASE);
    const f = w.fixtures[0]!;
    expect(resultsOnlyMatch(w, f)).toEqual(resultsOnlyMatch(w, f));
  });
});

describe("T698's placebo draw (RESULTS_LUCK, a measurement override)", () => {
  /** Released main ff685c33's first scores and goal lines, before adding the override. */
  const RELEASED = {
    scores: ['5-0', '3-1', '1-1', '1-3', '3-2', '0-3', '3-0', '1-1'],
    goals: [
      '0000000022100000000000',
      '0100001010000000000001',
      '0000000010000000001000',
      '0100000000000000020010',
      '0000001100100000010100',
      '0000000000000100001100',
      '0000000102000000000000',
      '0000001000000000010000',
    ],
  };
  const read = (w: ReturnType<typeof historyWorld>) =>
    w.fixtures.slice(0, RELEASED.scores.length).map((f) => resultsOnlyMatch(w, f));
  const scores = (list: MatchPlayback[]) =>
    list.map((p) => `${p.record.score.home}-${p.record.score.away}`);
  const withLuck = <T>(salt: string, season: number, run: () => T): T => {
    RESULTS_LUCK.salt = salt;
    RESULTS_LUCK.season = season;
    try {
      return run();
    } finally {
      RESULTS_LUCK.salt = '';
      RESULTS_LUCK.season = 1930;
    }
  };
  afterEach(() => {
    expect(RESULTS_LUCK).toEqual({ salt: '', season: 1930 });
  });

  it('leaves the released draw exactly as it was by default', () => {
    expect(RESULTS_LUCK).toEqual({ salt: '', season: 1930 });
    const w = historyWorld('results-only', ENABLED_RELEASE);
    expect(w.year).toBe(1930);
    const list = read(w);
    expect(scores(list)).toEqual(RELEASED.scores);
    expect(list.map((p) => p.record.players.map((l) => l.metrics[M.goals]).join(''))).toEqual(
      RELEASED.goals,
    );
  });

  it("leaves a fixture of another season unchanged and redraws the salted season's", () => {
    const w = historyWorld('results-only', ENABLED_RELEASE);
    const released = read(w);
    expect(withLuck('placebo-1', 1931, () => read(w))).toEqual(released);
    const one = withLuck('placebo-1', 1930, () => read(w)),
      two = withLuck('placebo-2', 1930, () => read(w));
    expect(scores(one)).not.toEqual(scores(released));
    expect(scores(two)).not.toEqual(scores(one));
    // Same fixture, same salt: the same result.
    expect(withLuck('placebo-1', 1930, () => read(w))).toEqual(one);
    expect(read(w)).toEqual(released);
  });
});
