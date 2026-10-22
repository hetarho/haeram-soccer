/**
 * T325's speed work on the detailed engine keeps every football fact (→ARCH-5, ARCH-31, MATCH-27):
 * the own match plays exactly the records, traces and frames the source before it played, draw for
 * draw. The digests were recorded on e3aa9b9, before any optimisation; a change that alters football
 * outcomes refreshes them together with the calibration evidence, never alone. No wall-clock
 * assertion here; the timings live in scripts/match-model-baseline.ts and
 * docs/benchmarks/full-model-throughput.json.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../contracts/src/match-model';
import type { Fixture, World } from '../../contracts/src/types';
import { playGrid, type GridResult } from './grid/engine';
import { buildFrames } from './grid/playback';
import { buildGridSetup, type DecideRule } from './grid/setup';
import { founded } from './season.testkit';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const LEVEL: DecideRule = { awayGoals: false };

/** The archive club's first own league fixture of a season founded in `year`. */
function era(year: number): { w: World; f: Fixture } {
  const w = founded(year);
  const f = w.fixtures
    .filter((x) => (x.home === w.playerClub || x.away === w.playerClub) && x.kind !== 'cup')
    .sort((a, b) => a.round - b.round)[0]!;
  return { w, f };
}

/** Plays `f` under `id`; the candidate model unless `preFeature`. */
function play(
  { w, f }: { w: World; f: Fixture },
  id: string,
  opts: { observe?: boolean; decide?: DecideRule; preFeature?: boolean } = {},
) {
  const fixture = { ...f, id };
  const setup = buildGridSetup(w, fixture, {
    observe: opts.observe ?? false,
    recordPlayers: true,
    ...(opts.decide ? { decide: opts.decide } : {}),
    ...(opts.preFeature ? {} : { model: MATCH_MODEL_REVISION }),
  });
  const result = playGrid(setup);
  return { result, setup, frames: opts.observe ? buildFrames(result, setup, w.seed) : [] };
}

/** Everything a match leaves: record, elapsed time, diagnostics, and when observed its trace and frames. */
const facts = (p: ReturnType<typeof play>) => {
  const { record, elapsed, diagnostics, trace }: GridResult = p.result;
  return digest({ record, elapsed, diagnostics, trace: trace ?? null, frames: p.frames });
};

/**
 * Per era: a league fixture unobserved and observed, a knockout tie decided in extra time and one
 * decided on penalties (fixture IDs found by scanning `knockout-<year>-<i>` on e3aa9b9), and the
 * pre-feature path for one league fixture.
 */
const CASES = {
  1975: { extraTime: 20, shootout: 7 },
  1995: { extraTime: 7, shootout: 2 },
  2024: { extraTime: 6, shootout: 0 },
} as const;

const BEFORE: Record<keyof typeof CASES, Record<string, string>> = {
  1975: {
    league: '551e4f45e8542cbe',
    observed: '8b553ee66fe786fe',
    extraTime: '8224f58b3799e273',
    shootout: '9429113be72e1633',
    preFeature: '4bdd7062aee72859',
  },
  1995: {
    league: 'eedeab011a97cebd',
    observed: 'cf3a9a8e56aeef95',
    extraTime: 'e2821dfdd835e112',
    shootout: 'bdb3afe1f3832652',
    preFeature: '4b65b95690811a83',
  },
  2024: {
    league: 'a52e12ad7fd7dded',
    observed: '5358a04f778da3ec',
    extraTime: '0d45034944eeaf27',
    shootout: '459616582da16f2a',
    preFeature: 'dead4d8f2df6fcec',
  },
};

describe('detailed engine throughput (T325)', () => {
  for (const year of [1975, 1995, 2024] as const) {
    it(`plays the ${year} candidate records of e3aa9b9 draw for draw`, () => {
      const kit = era(year);
      const { extraTime, shootout } = CASES[year];
      const league = play(kit, `league-${year}`);
      const watched = play(kit, `league-${year}`, { observe: true });
      // Observing adds the trace and frames only (→MATCH-7).
      expect(watched.result.record).toEqual(league.result.record);
      expect(watched.frames.length).toBeGreaterThan(0);
      const et = play(kit, `knockout-${year}-${extraTime}`, { decide: LEVEL });
      expect(et.result.record.regulation).toBeDefined();
      expect(et.result.record.shootout).toBeUndefined();
      const pens = play(kit, `knockout-${year}-${shootout}`, { decide: LEVEL, observe: true });
      expect(pens.result.record.shootout).toBeDefined();
      const old = play(kit, `league-${year}`, { preFeature: true });
      expect({
        league: facts(league),
        observed: facts(watched),
        extraTime: facts(et),
        shootout: facts(pens),
        preFeature: facts(old),
      }).toEqual(BEFORE[year]);
    });
  }

  it('tells a one-bit change apart', () => {
    const x = 0.1 + 0.2;
    const bit = new Float64Array([x]);
    const bits = new BigUint64Array(bit.buffer);
    bits[0] = bits[0]! ^ 1n;
    expect(bit[0]).not.toBe(x);
    expect(digest({ xg: bit[0] })).not.toBe(digest({ xg: x }));
  });
});
