/**
 * T325's speed work on the detailed engine keeps every football fact (→ARCH-5, ARCH-31, MATCH-27):
 * the own match plays exactly the records, traces and frames the source before it played, draw for
 * draw. The digests were recorded on e3aa9b9, before any optimisation, and re-recorded on 6f46b55
 * (main with T336's counter behaviour, before T325's commits) when T325 was merged over it: main's
 * own code gave every digest below on darwin-arm64 and the merged tree plays them unchanged. All
 * these fixtures are press against press, so T336 changed none of them. T345's candidate score
 * state (a lead protected, a deficit chased) changes every candidate match, so its merge over
 * T325 re-recorded the candidate digests with its calibration artifact. A change that alters
 * football outcomes refreshes them together with the calibration evidence, never alone. No
 * wall-clock assertion here; the timings live in scripts/match-model-baseline.ts and
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
 * decided on penalties (fixture IDs found by scanning `knockout-<year>-<i>` on e3aa9b9, they still
 * ended that way on 6f46b55; rescanned for T345's score state, which settles the earlier ties
 * otherwise: 1975 shoot-out 7 → 4, 1995 extra time 7 → 1 and shoot-out 2 → 16, 2024 extra time
 * 6 → 9 and shoot-out 0 → 5, the first of each kind), and the pre-feature path for one league
 * fixture.
 */
const CASES = {
  1975: { extraTime: 20, shootout: 4 },
  1995: { extraTime: 1, shootout: 16 },
  2024: { extraTime: 9, shootout: 5 },
} as const;

type Facts = Record<'league' | 'observed' | 'extraTime' | 'shootout' | 'preFeature', string>;

/**
 * Three observed fixtures digested differently by host for the same source (observed traces and
 * frames keep every position to the last bit; the unobserved records agree): e3aa9b9 and 6f46b55
 * gave the first value on linux-x64 under Node 24.22.1 (`.node-version`, as CI) and the second on
 * darwin-arm64 under Node 25.2.1 and 26.8.1. The split follows the host (OS/CPU), not the Node
 * major: b83c432 gives the darwin value for all three on darwin-arm64 under Node 24.18.0 too.
 * T345's candidate score state changed every candidate digest (the pre-feature ones are
 * unchanged); its values were recorded on darwin-arm64 (Node 26.8.1) only, so the three
 * host-split slots hold `PENDING_LINUX_DIGEST` until CI's linux-x64 value (printed in the failure
 * message) replaces it, and a host split on another observed fixture would show the same way.
 * Either host's value is accepted; a change of football gives neither.
 */
const BEFORE: Record<keyof typeof CASES, Record<keyof Facts, string | readonly string[]>> = {
  1975: {
    league: 'dc173dd75251a820',
    observed: '0582021706815ebc',
    extraTime: 'ef2ef22ffa9c9240',
    shootout: 'e3b7532c3e6e6ed8',
    preFeature: '4bdd7062aee72859',
  },
  1995: {
    league: 'fdda2f2b1a9e4d58',
    observed: ['PENDING_LINUX_DIGEST', 'ce88af628923bd86'],
    extraTime: '32ba863cca86aebd',
    shootout: ['PENDING_LINUX_DIGEST', '3199a2424f744e11'],
    preFeature: '4b65b95690811a83',
  },
  2024: {
    league: 'fa2be45a00d596d8',
    observed: 'ef53f2e9b1609b5d',
    extraTime: '932e19a396c7bec7',
    shootout: ['PENDING_LINUX_DIGEST', 'b8ebf58ac219eacc'],
    preFeature: 'dead4d8f2df6fcec',
  },
};

/** The digests `got` must equal: each recorded one, or the host's own of two recorded ones. */
const expected = (want: Record<keyof Facts, string | readonly string[]>, got: Facts): Facts => {
  const out = {} as Facts;
  for (const k of Object.keys(got) as (keyof Facts)[]) {
    const w = want[k];
    out[k] = typeof w === 'string' ? w : w.includes(got[k]) ? got[k] : w[0]!;
  }
  return out;
};

describe('detailed engine throughput (T325)', () => {
  for (const year of [1975, 1995, 2024] as const) {
    it(`plays the ${year} candidate records of 6f46b55 draw for draw`, () => {
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
      const got: Facts = {
        league: facts(league),
        observed: facts(watched),
        extraTime: facts(et),
        shootout: facts(pens),
        preFeature: facts(old),
      };
      // The failure message names the host and every digest it got, so a CI log shows the values.
      expect(
        got,
        `${year} digests on ${process.platform}-${process.arch} Node ${process.version}: ${JSON.stringify(got)}`,
      ).toEqual(expected(BEFORE[year], got));
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
