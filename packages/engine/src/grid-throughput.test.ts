/**
 * T325's speed work on the detailed engine keeps every football fact (→ARCH-5, ARCH-31, MATCH-27):
 * the own match plays exactly the records, traces and frames the source before it played, draw for
 * draw. Each fixture has a facts digest (record, elapsed time, diagnostics) and an observed one a
 * positions digest (trace and frames). Both are exact per host (`${process.platform}-${process.arch}`):
 * the host's float math differs in the last bit, and that can flip a recorded fact, not only a
 * position (CI's linux-x64 run 39800627501 gave 2024's observed shoot-out other facts than
 * darwin-arm64). A host with recorded values asserts them; another logs what it got, for a session
 * on that host to paste in. A behaviour change records the running host's values and deletes the
 * other hosts' (T345: darwin-arm64; T348's set-piece defence, whose defenders keep their jobs after
 * the kick: darwin-arm64 again, every candidate value changed but the 1975 and 2024 league
 * fixtures' facts, the pre-feature facts did not), together with the calibration evidence, never
 * alone. A presentation-only change re-records positions alone: T359's restart kick snapshot
 * (darwin-arm64; every facts digest unchanged, the trace's other fields and the frames of a trace
 * without kicks byte-identical to before). T358 gave the candidate path portable `exp`, `sin`,
 * `cos`, `atan2`, `hypot` and integer powers (`portable-math.ts`, bound once per match on the
 * state; the pre-feature path keeps `Math.*`): on darwin-arm64 every facts digest held and the 1975
 * positions and 2024's observed ones too, while three positions digests moved in the last bits (the
 * portable functions differ from this host's in about 1.5% of `sin` and `cos` calls, 0.2% of
 * `atan2`, 0.05% of `exp` and none of `hypot`). The candidate's grid geometry no longer reads the host's float
 * library, so linux-x64 should give these candidate facts; until a CI run shows it the split by host
 * stays. On every host each fixture replays bit for bit, the observed league fixture's facts equal
 * the unobserved one's (→MATCH-2, MATCH-7) and a one-bit change shows in either digest. No
 * wall-clock assertion here; the timings live in scripts/match-model-baseline.ts and
 * docs/benchmarks/full-model-throughput.json.
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

interface HostDigests {
  /** Facts of every fixture (the observed league fixture's equal the unobserved one's). */
  facts: Record<'league' | 'extraTime' | 'shootout' | 'preFeature', string>;
  /** Positions of the observed fixtures. */
  positions: Record<'observed' | 'shootout', string>;
}

/** Exact digests by host; a behaviour change records the running host's and deletes the others. */
const DIGESTS: Partial<Record<string, Record<Year, HostDigests>>> = {
  'darwin-arm64': {
    1975: {
      facts: {
        league: '0a392030070b2389',
        extraTime: 'bb531ef4fe2b9601',
        shootout: 'c16f0a0a7ed7b58a',
        preFeature: 'a2e559aea64a91e7',
      },
      // T359 (kick snapshot): 4d7573d60f7b864e and e4f41e13f37075d2 before.
      positions: { observed: '70a75fe142ff2f7d', shootout: '22d751dd17b0fa0d' },
    },
    1995: {
      facts: {
        league: '915080a3feadc4f8',
        extraTime: '5bd3095cb95f88cc',
        shootout: 'fd24b6f51440b87c',
        preFeature: '0c7e06efbc8fd981',
      },
      // T358 (portable math): 1c57051abec6e044 and e42847d0748465d3 before (T359's).
      positions: { observed: '944e58ccbdef2d3f', shootout: '14ebd459da2c8968' },
    },
    2024: {
      facts: {
        league: 'f46d1dbd025b49b0',
        extraTime: '931d04258f444c80',
        shootout: '12dbc52079c43f4f',
        preFeature: 'a0e4479b22d2cfa6',
      },
      // T359 (kick snapshot): c4a8a6a41c12516a and f9ca7911fa173494 before; T358 (portable
      // math): the shoot-out's ee0eb1581ac782b3 before.
      positions: { observed: '99c6c9e68e8ce31b', shootout: '2e1ee15e76eed100' },
    },
  },
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
      const got: HostDigests = {
        facts: {
          league: factsOf(league),
          extraTime: factsOf(et),
          shootout: factsOf(pens),
          preFeature: factsOf(old),
        },
        positions: { observed: positionsOf(watched), shootout: positionsOf(pens) },
      };
      const want = DIGESTS[HOST]?.[year];
      for (const kind of ['facts', 'positions'] as const)
        for (const [fixture, value] of Object.entries(got[kind])) {
          const recorded = (want?.[kind] as Record<string, string> | undefined)?.[fixture];
          if (recorded === undefined)
            console.log(
              `no ${HOST} ${kind} digest for ${year} ${fixture}; this host gives ${value}`,
            );
          else expect(value, `${year} ${fixture} ${kind} on ${HOST}`).toBe(recorded);
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
