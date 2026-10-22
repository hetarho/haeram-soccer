/**
 * T325's speed work on the detailed engine keeps every football fact (→ARCH-5, ARCH-31, MATCH-27):
 * the own match plays exactly the records, traces and frames the source before it played, draw for
 * draw. Each fixture has a facts digest (record, elapsed time, diagnostics) and an observed one a
 * positions digest (trace and frames).
 *
 * The candidate's digests are the same on every host and asserted everywhere: since T358 its grid
 * reads only the portable math of `portable-math.ts`, and CI's linux-x64 run 39829693762 gave every
 * one of darwin-arm64's values. Before that the host's float library flipped facts (run 39800627501,
 * 2024's observed shoot-out). The pre-feature path keeps the host's `Math.*`, so its facts stay per
 * host (`${process.platform}-${process.arch}`): a host with a value asserts it, another logs what it
 * got for a session there to paste in. A candidate behaviour change re-records the candidate's
 * digests with its calibration evidence, never alone; a presentation-only change (T359's kick
 * snapshot) re-records positions alone. On every host each fixture replays bit for bit, the observed
 * league fixture's facts equal the unobserved one's (→MATCH-2, MATCH-7) and a one-bit change shows in
 * either digest. No wall-clock assertion here; the timings live in scripts/match-model-baseline.ts
 * and docs/benchmarks/full-model-throughput.json.
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
 * IDs come from scanning `knockout-<year>-<i>` (e3aa9b9; rescanned for T345's score state, for
 * T348's set-piece defence and for T365's side share and possession runs, the first tie of each
 * kind; T345's were 20/4, 1/16 and 9/5, T348's 7/10, 16/3 and 9/0).
 */
const CASES = {
  1975: { extraTime: 2, shootout: 8 },
  1995: { extraTime: 1, shootout: 5 },
  2024: { extraTime: 15, shootout: 0 },
} as const;
type Year = keyof typeof CASES;

interface CandidateDigests {
  /** Facts of the candidate fixtures (the observed league fixture's equal the unobserved one's). */
  facts: Record<'league' | 'extraTime' | 'shootout', string>;
  /** Positions of the observed fixtures. */
  positions: Record<'observed' | 'shootout', string>;
}

/**
 * The candidate's digests, the same on every host (T358). History of the values: T345's score
 * state, T348's set-piece defence and T358's portable math moved facts or positions; T359's kick
 * snapshot moved positions only (1975 4d7573d60f7b864e and e4f41e13f37075d2 before it, 2024
 * c4a8a6a41c12516a and f9ca7911fa173494; T358 then moved 1995's 1c57051abec6e044 and
 * e42847d0748465d3 and 2024's shoot-out ee0eb1581ac782b3). T365's side share (0.8) and
 * possession's runs past halfway moved every value and the knockout ties (rescanned above); before
 * it, facts 1975 0a392030070b2389, bb531ef4fe2b9601, c16f0a0a7ed7b58a, 1995 915080a3feadc4f8,
 * 5bd3095cb95f88cc, fd24b6f51440b87c, 2024 f46d1dbd025b49b0, 931d04258f444c80, 12dbc52079c43f4f
 * and positions 1975 70a75fe142ff2f7d, 22d751dd17b0fa0d, 1995 944e58ccbdef2d3f,
 * 14ebd459da2c8968, 2024 99c6c9e68e8ce31b, 2e1ee15e76eed100. The pre-feature facts did not move.
 * T367's urgent pairing, which no longer takes a set-piece marker off his runner, moved three
 * positions digests and no facts: jobs and paths changed in two to four entries from a delivery's
 * kick through its second ball, and no draw (1975 observed 19144d72ec0fa7d2, 1995 shoot-out
 * 6aae41a27ad31695 and 2024 shoot-out a74c83504e618a0c before); the knockout ties still reach
 * extra time and penalties.
 */
const CANDIDATE: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: '6a0e093d7f4b8695',
      extraTime: '3e3145221e46dcfb',
      shootout: 'a271a9f3a52a6427',
    },
    positions: { observed: 'a23abe6daaceace9', shootout: '0818c79f81f161a0' },
  },
  1995: {
    facts: {
      league: 'd62f34799bd86c94',
      extraTime: '781d87e697e93dc9',
      shootout: 'fab640b81546a4ee',
    },
    positions: { observed: '84033ff29b355614', shootout: '630da178551d5a75' },
  },
  2024: {
    facts: {
      league: 'f7d7fd11221f1941',
      extraTime: '4dc91004081853d5',
      shootout: '586bb36d3e8eb92c',
    },
    positions: { observed: '81c845a7261a92d7', shootout: '0323962fb6ef130c' },
  },
};

/** The pre-feature league fixture's facts by host; it plays the host's `Math.*`. */
const PRE_FEATURE: Partial<Record<string, Record<Year, string>>> = {
  'darwin-arm64': { 1975: 'a2e559aea64a91e7', 1995: '0c7e06efbc8fd981', 2024: 'a0e4479b22d2cfa6' },
  // CI run 39829693762 (Node 24.22.1).
  'linux-x64': { 1975: 'a2e559aea64a91e7', 1995: '0c7e06efbc8fd981', 2024: 'a0e4479b22d2cfa6' },
};

describe('detailed engine throughput (T325)', () => {
  for (const year of [1975, 1995, 2024] as const) {
    it(`plays the ${year} records draw for draw`, () => {
      const kit = era(year);
      const { extraTime, shootout } = CASES[year];
      // Every fixture twice: within a host the same source plays the same match, bit for bit.
      const twice = (id: string, opts: Parameters<typeof play>[2] = {}) => {
        const [a, b] = [play(kit, id, opts), play(kit, id, opts)];
        expect(factsOf(b), `${year} ${id} facts replayed`).toBe(factsOf(a));
        if (opts.observe)
          expect(positionsOf(b), `${year} ${id} positions replayed`).toBe(positionsOf(a));
        return a;
      };
      const league = twice(`league-${year}`);
      const watched = twice(`league-${year}`, { observe: true });
      // Observing adds the trace and frames only (→MATCH-2, MATCH-7).
      expect(watched.result.record).toEqual(league.result.record);
      expect(factsOf(watched)).toBe(factsOf(league));
      expect(watched.frames.length).toBeGreaterThan(0);
      const et = twice(`knockout-${year}-${extraTime}`, { decide: LEVEL });
      expect(et.result.record.regulation).toBeDefined();
      expect(et.result.record.shootout).toBeUndefined();
      const pens = twice(`knockout-${year}-${shootout}`, { decide: LEVEL, observe: true });
      expect(pens.result.record.shootout).toBeDefined();
      const old = twice(`league-${year}`, { preFeature: true });
      const got: CandidateDigests = {
        facts: { league: factsOf(league), extraTime: factsOf(et), shootout: factsOf(pens) },
        positions: { observed: positionsOf(watched), shootout: positionsOf(pens) },
      };
      expect(got, `${year} candidate digests on ${HOST}`).toEqual(CANDIDATE[year]);
      const recorded = PRE_FEATURE[HOST]?.[year];
      if (recorded === undefined)
        console.log(`no ${HOST} pre-feature digest for ${year}; this host gives ${factsOf(old)}`);
      else expect(factsOf(old), `${year} pre-feature facts on ${HOST}`).toBe(recorded);
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
