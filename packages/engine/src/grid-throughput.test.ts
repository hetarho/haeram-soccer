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
import { DISABLED_RELEASE } from '../../../tests/fixtures/worlds';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const LEVEL: DecideRule = { awayGoals: false };
const HOST = `${process.platform}-${process.arch}`;

/**
 * The archive club's first own league fixture of a season founded in `year`, on a world that never
 * activated: each fixture plays the model `play` names, never one the switch recorded.
 */
function era(year: number): { w: World; f: Fixture } {
  const w = founded(year, DISABLED_RELEASE);
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
 * T348's set-piece defence, for T365's side share and possession runs, for T370's shot
 * selection and build-up interceptions, for T371's restarts, finishers and balanced block and for
 * T384's offside calls by 판단력, for T397's balls in behind, first touches and cut-backs, for
 * T398's late box runs, for T399's flank beside a back three, for T426's in-stride carry and for
 * T441's passes cut out where they are reached, the first tie of each kind; T345's were 20/4, 1/16
 * and 9/5, T348's 7/10, 16/3 and 9/0, T365's 2/8, 1/5 and 15/0, T370's 5/3, 34/0 and 18/3,
 * T371's 26/6, 1/17 and 0/19, T384's 1/11, 7/9 and 3/1, T397's 0/1, 1/2 and 34/0, T398's 20/8,
 * 7/3 and 3/0, T399's 5/16, 7/2 and 3/1, T426's 7/2, 10/3 and 5/12).
 */
const CASES = {
  1975: { extraTime: 13, shootout: 8 },
  1995: { extraTime: 2, shootout: 0 },
  2024: { extraTime: 18, shootout: 0 },
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
 * extra time and penalties. T373's delivered taker, no carrier for the kick's update when the
 * delivery handed the ball to nobody, moved five positions digests and no facts: nobody runs to
 * press him while the ball is in the air (1975 a23abe6daaceace9 and 0818c79f81f161a0, 1995
 * shoot-out 630da178551d5a75, 2024 81c845a7261a92d7 and 0323962fb6ef130c before); the knockout
 * ties still reach extra time and penalties. T376's recorded ball holders in each frame moved
 * every positions digest and no facts (1975 967b2eed08697522 and 958e5c78b5f4a9aa, 1995
 * 84033ff29b355614 and c2babed2dbf8f2f0, 2024 d9194bb1f9e70b22 and f758ad0b3ed9de74 before).
 * T370's shot selection in the box (with its volume and
 * long-shot scales) and the tactics' build-up interceptions moved every value and the knockout ties
 * (rescanned above); before it, facts 1975 6a0e093d7f4b8695, 3e3145221e46dcfb, a271a9f3a52a6427,
 * 1995 d62f34799bd86c94, 781d87e697e93dc9, fab640b81546a4ee, 2024 f7d7fd11221f1941,
 * 4dc91004081853d5, 586bb36d3e8eb92c and positions 1975 967b2eed08697522, 958e5c78b5f4a9aa, 1995
 * 84033ff29b355614, c2babed2dbf8f2f0, 2024 d9194bb1f9e70b22, f758ad0b3ed9de74. T371's keeper
 * gathering crosses that run out, box fouls, the lines' shot weights and balanced's block and
 * settled play moved every value and the knockout ties (rescanned above); before it, facts 1975
 * 209c3af0621dd846, 42b5439a0c21e378, 199aa1717566ec45, 1995 1f5e0b81550ff272, 6b03398d2eab00d8,
 * 03150b551efe3134, 2024 3b8fd3a17094f200, 674e21e9a7afd0d4, 4080512485eaee22 and positions 1975
 * bdb8c849d697f34b, 1ca812be62b58a6a, 1995 7d8c37466ec8ba7c, 65f33357a68dcb30, 2024
 * fc457228477476ab, 73cc37963c85f102. Merging T376 with them re-recorded every positions digest and no facts
 * (1975 39d6eabbb550538c and fad88ac87b4447cb, 1995 2d67c9c89168b857 and 6bb264703f6f7c23, 2024
 * 80ec3c2f825d634c and b9a075ff6ef68c69 before). T384's offside call on the receiver's own 판단력
 * (with factors for a linebreaker and a high line) moved every value and the knockout ties
 * (rescanned above); before it, facts 1975 d94909a5e2968fb3, da8ff901efefcc32, a1cff84512b4cd7b,
 * 1995 3a31b1fadb9e7a01, 2eba922a8dff6947, 28bc42a896a91f3c, 2024 db7907011305159d,
 * fe8c16da21657962, d93a980c191fc42f and positions 1975 8600f8623ec02642, 5bc0b036f3450842, 1995
 * 55b4032f3aca4a34, b780d682e3740b36, 2024 c656af098ce0f8b3, ddea4368a42f04bf. T397 counts a
 * through ball only for a receiver not yet past the line (MATCH-13) and keeps a stronger pull of a
 * ball in behind, a forward first touch and more cut-backs, which moved every value and the
 * knockout ties (rescanned above); the count alone moved only facts. Before T397, facts 1975
 * 64ad8ad25c48a52e, 77cae93d84b47c88, 2c0cd4086c51f65e, 1995 7935aef6035aab63, d0ee029421443620,
 * 5114bbcce2d2d120, 2024 26b91d689fd91742, caf9c91e4836f057, 1782d8fba2b2f9e1 and positions 1975
 * f89f18426227fad7, c5d30a3e151789e6, 1995 6a2a429bc3cc3a57, 6c27813b5d3a6c1b, 2024
 * c1db18f2b9e940e1, 3b6897b9d0105c29. T398's late box runs (odds 1.3) and shot scale (0.43) moved
 * every value but 2024's shoot-out facts and the knockout ties (rescanned above); before it, facts
 * 1975 77922360f27a59b4, 65d95de592b7f768, a62874c80b1f5ffb, 1995 4d4b14aec66e4bbe,
 * 154eab38d6802ddc, bb480703c224e4f4, 2024 c8c6d976c6ac856d, 2a73e0f73d8d166e and positions 1975
 * fc8d1b66ff7b5740, 397d33c5de64493c, 1995 c5e8589ea6648cc8, 8a83f7b4ae156ff4, 2024
 * cd4e3d64a4838ca2, 8a3e5ad1de8591d2. T399's flank beside a back three and blocked crosses moved
 * every value but 1995's and 2024's extra-time facts and the knockout ties (rescanned above);
 * before it, facts 1975 f18bf8e3760b007e, 5205f721945a3dd3, cb5d17e452857e45, 1995
 * 53a69e70e2832073, 471df82c3b8c4d4e, 2024 75d48ef3225697f0, 02ca3d882eee3a48 and positions 1975
 * 567f7d852fa17324, df35f3035429b034, 1995 81faf4ead6e2e1b4, 3d6d09b74f59c4c0, 2024
 * 11990ef8c06e3a19, e20dade414ad7a86. T426's in-stride carry (the match runs through it before
 * the action resolves from the kick spot, a pressed carrier shielding on the move, the defenders
 * reading the decided pass from the start of the carry) moved every value and the knockout ties
 * (rescanned above); before it, facts 1975 aabaadd388aded04,
 * 62f034df209d6e0a, ec9050f0a8550f03, 1995 2153aa97ed3ec113, 1e044e817ac3c2d9, 18e234b44e2d1c0a,
 * 2024 5d955b32af2fa421, 31069e56fe8ce463, 3ce82e3930c7f3c4 and positions 1975 a623c5308686acb9,
 * e2b00355f811a7a4, 1995 cd732ec31bcbbeda, f5a134a821329cc5, 2024 daf004d070ca6a19,
 * a75a3b2476c811bb. T441's lanes (a pass cut out only by an opponent who reaches its path, at his
 * reach point, the carrier weighing the same reach and a keeper's ball still played against the
 * defender nearest the lane; calibration round 69, core, 120 matches: completion 77.32 → 77.34%,
 * interceptions 13.6 → 7.6 a team, goals 3.46 → 3.49 a match) and the failed passes it counts in
 * the diagnostics moved every value and the knockout ties (rescanned
 * above); before it, facts 1975 f0a0ba2dc499fd22, a8cc64939de38037, 95f7e78f01131e08, 1995
 * 57fc93f647a63148, d723ad996af0ff79, fdc8517c30c5d3fb, 2024 2e9ffd372f9aa7ec, 33aa01cd4e3be1b8,
 * 2cab6d1d194e4b9a and positions 1975 1ee9029e583b99f8, 5eae25ce083d761e, 1995 c2ba4b1c4ad87a64,
 * 504b231aba7ac5c4, 2024 1a1941ede88902e8, 8cea09e476540af1. The pre-feature facts did not move.
 */
const CANDIDATE: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: 'c4d93285007310ee',
      extraTime: 'a828fdd639a506fa',
      shootout: '36992b0b450c72e9',
    },
    positions: { observed: '952927960c337847', shootout: '2840657c0b94a08d' },
  },
  1995: {
    facts: {
      league: 'd4d42ae5647bb365',
      extraTime: '1b2e3ccb84c5b74f',
      shootout: '13e9a69f1e668f3b',
    },
    positions: { observed: '325853b9ab476dea', shootout: '697e2e9f3ede1113' },
  },
  2024: {
    facts: {
      league: 'a747af8b9cbb1d6d',
      extraTime: 'bce42676d9fbdf5d',
      shootout: 'b60aadef25ea149a',
    },
    positions: { observed: '95221336d811a398', shootout: 'c71a5c328c7e55ed' },
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
