import { describe, expect, it } from 'vitest';
import type { Fixture, World } from '../../contracts/src/types';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { INJURY } from './careers';
import { createWorld, ownLeagueClubs } from './index';
import { simulateMatch, SUMMARY_DISCIPLINE } from './match';

/**
 * Fixtures between clubs nobody owns: every one takes the probabilistic path (→MATCH-22) — the
 * pre-feature summary path, which careers that never activate the model keep (→SAVE-23).
 */
function others(n: number) {
  const w: World = createWorld(
    {
      country: 'ENG',
      name: 'Watching Town',
      color: '#334466',
      seed: 'summary-path',
      level: 'normal',
    },
    DISABLED_RELEASE,
  );
  const league = new Set(ownLeagueClubs(w).map((c) => c.id));
  const fixtures = w.fixtures.filter(
    (f) => f.home !== w.playerClub && f.away !== w.playerClub && !league.has(f.home),
  );
  return { w, fixtures: Array.from({ length: n }, (_, i) => fixtures[i % fixtures.length]!) };
}
/** The same fixture under another ID, so each draw gets its own streams. */
const replay = (f: Fixture, i: number): Fixture => ({ ...f, id: `${f.id}:${i}` });

describe('probabilistic path discipline and lines (→MATCH-22, LEAGUE-15)', () => {
  it("draws about the grid engine's cards per team", () => {
    const { w, fixtures } = others(1500);
    let yellows = 0,
      reds = 0;
    fixtures.forEach((f, i) => {
      for (const x of simulateMatch(w, replay(f, i)).record.incidents ?? []) {
        if (x.kind === 'yellow' || x.kind === 'secondYellow') yellows++;
        if (x.kind === 'red' || x.kind === 'secondYellow') reds++;
      }
    });
    const teams = fixtures.length * 2;
    // Yellows shown, second yellows included, and sendings-off at the grid's measured rates.
    expect(yellows / teams).toBeGreaterThan(SUMMARY_DISCIPLINE.yellows - 0.1);
    expect(yellows / teams).toBeLessThan(SUMMARY_DISCIPLINE.yellows + 0.15);
    expect(reds / teams).toBeGreaterThan(0.05);
    expect(reds / teams).toBeLessThan(0.12);
  });
  it('injures about 1.8% of starters', () => {
    const { w, fixtures } = others(1500);
    let injuries = 0;
    fixtures.forEach((f, i) => {
      const record = simulateMatch(w, replay(f, i)).record;
      injuries += (record.incidents ?? []).filter((x) => x.kind === 'injury').length;
    });
    const rate = injuries / (fixtures.length * 22);
    expect(rate).toBeGreaterThan(INJURY.perStarter * 0.8);
    expect(rate).toBeLessThan(INJURY.perStarter * 1.6);
  });
  it('names scorers and assisters whose goals add up to the score', () => {
    const { w, fixtures } = others(200);
    fixtures.forEach((f, i) => {
      const { record, squads } = simulateMatch(w, replay(f, i), false, true);
      expect(record.lineCounts).toEqual([11, 11]);
      const sides = [0, 1].map((side) => {
        const ids = new Set(squads[side].slice(0, 11).map((p) => p.id));
        return record.players.filter((line) => ids.has(line.id));
      });
      sides.forEach((lines, side) => {
        expect(lines.reduce((sum, l) => sum + l.metrics[0]!, 0)).toBe(
          side ? record.score.away : record.score.home,
        );
        expect(lines.reduce((sum, l) => sum + l.metrics[1]!, 0)).toBe(record.metrics[side][1]);
        expect(lines.every((l) => l.metrics[10] === 90)).toBe(true);
      });
    });
  });
  it('does not change the score stream', () => {
    const { w, fixtures } = others(300);
    const scores = () => fixtures.map((f, i) => simulateMatch(w, replay(f, i)).record.score);
    const withCards = scores();
    const { yellows, reds } = SUMMARY_DISCIPLINE;
    try {
      SUMMARY_DISCIPLINE.yellows = 0;
      SUMMARY_DISCIPLINE.reds = 0;
      expect(scores()).toEqual(withCards);
    } finally {
      SUMMARY_DISCIPLINE.yellows = yellows;
      SUMMARY_DISCIPLINE.reds = reds;
    }
  });
});
