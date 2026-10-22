/**
 * T325's speed work on the detailed engine keeps every football fact (→ARCH-5, ARCH-31, MATCH-27):
 * the own match plays exactly the records, traces and frames the source before it played, draw for
 * draw. Two digests per fixture:
 * - facts: record, elapsed time and diagnostics, without an observed match's trace and frames. They
 *   guard every draw and result on every host and are always asserted; the observed league
 *   fixture's facts equal the unobserved one's, since watched and unwatched runs agree
 *   (→MATCH-2, MATCH-7).
 * - positions: an observed match's trace and frames, exact per host
 *   (`${process.platform}-${process.arch}`), because the host's float math differs in the last bit
 *   (linux-x64 v darwin-arm64, under the same Node major too). A host without a recorded value only
 *   logs the digest it got, for a session on that host to paste in.
 * A behaviour change re-records the facts and the running host's positions (T345's score state on
 * darwin-arm64, over T325's e3aa9b9 and 6f46b55 values; then T348's set-piece defence, whose
 * defenders keep their jobs after the kick: every candidate facts digest but the 1975 and 2024
 * league fixtures' and every positions digest changed, the pre-feature facts did not), together
 * with the calibration evidence, never alone. No wall-clock assertion here; the timings live in
 * scripts/match-model-baseline.ts and docs/benchmarks/full-model-throughput.json.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../contracts/src/match-model';
import type { Fixture, World } from '../../contracts/src/types';
import { playGrid } from './grid/engine';
import { buildFrames } from './grid/playback';
import { buildGridSetup, type DecideRule } from './grid/setup';
import { founded } from './season.testkit';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const LEVEL: DecideRule = { awayGoals: false };
const HOST = `${process.platform}-${process.arch}`;

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
type Played = ReturnType<typeof play>;

/** What a match decides, the same on every host: record, elapsed time and diagnostics. */
const factsOf = ({ result: { record, elapsed, diagnostics } }: Played) =>
  digest({ record, elapsed, diagnostics });
/** Where an observed match's players and ball were: its trace and frames, exact per host. */
const positionsOf = ({ result: { trace }, frames }: Played) => digest({ trace, frames });

/**
 * Per era: a league fixture unobserved and observed, a knockout tie decided in extra time and one
 * decided on penalties (observed), and the pre-feature path for one league fixture. The knockout
 * IDs come from scanning `knockout-<year>-<i>` (e3aa9b9; rescanned for T345's score state and for
 * T348's set-piece defence, the first tie of each kind; T345's were 20/4, 1/16 and 9/5).
 */
const CASES = {
  1975: { extraTime: 7, shootout: 10 },
  1995: { extraTime: 16, shootout: 3 },
  2024: { extraTime: 9, shootout: 0 },
} as const;
type Year = keyof typeof CASES;

const FACTS: Record<Year, Record<'league' | 'extraTime' | 'shootout' | 'preFeature', string>> = {
  1975: {
    league: '0a392030070b2389',
    extraTime: 'bb531ef4fe2b9601',
    shootout: 'c16f0a0a7ed7b58a',
    preFeature: 'a2e559aea64a91e7',
  },
  1995: {
    league: '915080a3feadc4f8',
    extraTime: '5bd3095cb95f88cc',
    shootout: 'fd24b6f51440b87c',
    preFeature: '0c7e06efbc8fd981',
  },
  2024: {
    league: 'f46d1dbd025b49b0',
    extraTime: '931d04258f444c80',
    shootout: '12dbc52079c43f4f',
    preFeature: 'a0e4479b22d2cfa6',
  },
};

/** Positions digests of the observed fixtures, by host. */
const POSITIONS: Record<Year, Record<'observed' | 'shootout', Partial<Record<string, string>>>> = {
  1975: {
    observed: { 'darwin-arm64': '4d7573d60f7b864e' },
    shootout: { 'darwin-arm64': 'e4f41e13f37075d2' },
  },
  1995: {
    observed: { 'darwin-arm64': 'dfb09059046d87b4' },
    shootout: { 'darwin-arm64': 'a4e627789a44199c' },
  },
  2024: {
    observed: { 'darwin-arm64': 'c4a8a6a41c12516a' },
    shootout: { 'darwin-arm64': 'f9ca7911fa173494' },
  },
};

describe('detailed engine throughput (T325)', () => {
  for (const year of [1975, 1995, 2024] as const) {
    it(`plays the ${year} records draw for draw`, () => {
      const kit = era(year);
      const { extraTime, shootout } = CASES[year];
      const league = play(kit, `league-${year}`);
      const watched = play(kit, `league-${year}`, { observe: true });
      // Observing adds the trace and frames only (→MATCH-7).
      expect(watched.result.record).toEqual(league.result.record);
      expect(factsOf(watched)).toBe(factsOf(league));
      expect(watched.frames.length).toBeGreaterThan(0);
      const et = play(kit, `knockout-${year}-${extraTime}`, { decide: LEVEL });
      expect(et.result.record.regulation).toBeDefined();
      expect(et.result.record.shootout).toBeUndefined();
      const pens = play(kit, `knockout-${year}-${shootout}`, { decide: LEVEL, observe: true });
      expect(pens.result.record.shootout).toBeDefined();
      const old = play(kit, `league-${year}`, { preFeature: true });
      const facts = {
        league: factsOf(league),
        extraTime: factsOf(et),
        shootout: factsOf(pens),
        preFeature: factsOf(old),
      };
      expect(facts, `${year} facts on ${HOST}: ${JSON.stringify(facts)}`).toEqual(FACTS[year]);
      for (const [kind, p] of [
        ['observed', watched],
        ['shootout', pens],
      ] as const) {
        const got = positionsOf(p);
        const want = POSITIONS[year][kind][HOST];
        if (want === undefined)
          console.log(`no ${HOST} positions digest for ${year} ${kind}; this host gives ${got}`);
        else expect(got, `${year} ${kind} positions on ${HOST}`).toBe(want);
      }
    });
  }

  it('tells a one-bit change apart in the facts and in the positions', () => {
    const flip = (x: number) => {
      const bit = new Float64Array([x]);
      const bits = new BigUint64Array(bit.buffer);
      bits[0] = bits[0]! ^ 1n;
      return bit[0]!;
    };
    const p = play(era(2024), 'league-2024', { observe: true });
    const { record } = p.result;
    expect(flip(record.xg![0]!)).not.toBe(record.xg![0]);
    const xg: [number, number] = [flip(record.xg![0]!), record.xg![1]!];
    const factsChanged = { ...p, result: { ...p.result, record: { ...record, xg } } };
    expect(factsOf(factsChanged)).not.toBe(factsOf(p));
    expect(positionsOf(factsChanged)).toBe(positionsOf(p));
    const trace = p.result.trace!;
    const ball: [number, number] = [flip(trace[0]!.ball[0]), trace[0]!.ball[1]];
    const moved = {
      ...p,
      result: { ...p.result, trace: [{ ...trace[0]!, ball }, ...trace.slice(1)] },
    };
    expect(positionsOf(moved)).not.toBe(positionsOf(p));
    expect(factsOf(moved)).toBe(factsOf(p));
  });
});
