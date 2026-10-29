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
 * and artifacts/benchmarks/full-model-throughput.json.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MATCH_MODEL_REVISION,
  MATCH_MODEL_REVISIONS,
  type MatchModelRevision,
} from '../../contracts/src/match-model';
import type { Fixture, World } from '../../contracts/src/types';
import { playGrid } from './grid/engine';
import { buildFrames } from './grid/playback';
import { buildGridSetup, type DecideRule } from './grid/setup';
import { founded } from './season.testkit';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

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
  opts: {
    observe?: boolean;
    decide?: DecideRule;
    preFeature?: boolean;
    model?: MatchModelRevision;
  } = {},
) {
  const fixture = { ...f, id };
  const setup = buildGridSetup(w, fixture, {
    observe: opts.observe ?? false,
    recordPlayers: true,
    ...(opts.decide ? { decide: opts.decide } : {}),
    ...(opts.preFeature ? {} : { model: opts.model ?? MATCH_MODEL_REVISION }),
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
 * T398's late box runs, for T399's flank beside a back three, for T426's in-stride carry, for
 * T441's passes cut out where they are reached, for T442's shut lanes, for T443's box scene, for
 * T444's deliveries into the zones, for T445's shots through the bodies in front of goal and
 * their second balls, for T437's recalibration, for T446's lofted deliveries over the crowd and
 * for T447's box zone depths, for T432's freedom on revision 2, for T433's tendencies in
 * revision 2's movement, for T466's revision 3, for T479's revision 4, for T480's corner numbers
 * for T481's shot choice, for T482's recalibration, for T538's revision 5, for T542's revision
 * 6, for T548's revision 7, for T561's revision 8 and for T579's revision 9, the first tie of
 * each kind; T561's were 3/34, 15/8 and 28/4 (revision 8's, `REVISION_8_CASES`), T548's were
 * 11/30, 18/7 and 14/13 (revision 7's, `REVISION_7_CASES`), T542's were 7/20, 5/3 and 12/7
 * (revision 6's, `REVISION_6_CASES`), T538's were 3/2, 6/1 and 23/0 (revision 5's, `REVISION_5_CASES`),
 * T482's were 6/31, 5/29 and 7/11 (revision 4's, `REVISION_4_CASES`), T481's were
 * 10/19, 3/11 and 0/6, T480's were 14/6, 8/4 and 9/0, T479's
 * were 7/4, 7/6 and 0/1, T466's were 9/2, 7/5 and 4/3
 * (revision 3's, `REVISION_3_CASES`), T433's were 3/0,
 * 3/1 and 0/4 (revision 2's, `REVISION_2_CASES`), T432's were 1/5, 36/3 and 3/0,
 * T345's were 20/4,
 * 1/16 and 9/5, T348's 7/10,
 * 16/3 and 9/0, T365's 2/8, 1/5 and 15/0, T370's 5/3, 34/0 and 18/3, T371's 26/6, 1/17 and 0/19,
 * T384's 1/11, 7/9 and 3/1, T397's 0/1, 1/2 and 34/0, T398's 20/8, 7/3 and 3/0, T399's 5/16, 7/2
 * and 3/1, T426's 7/2, 10/3 and 5/12, T441's 13/8, 3/0 and 18/0, T442's 2/16, 2/0 and 5/1,
 * T443's 1/2, 0/1 and 6/3, T444's 5/2, 0/3 and 13/1, T445's 1/0, 7/4 and 2/0, T437's 1/0, 3/8
 * and 5/15, T446's 0/1, 0/3 and 2/0, T447's 4/2, 2/5 and 16/0 — revision 1's, `REVISION_1_CASES`).
 */
const CASES = {
  1975: { extraTime: 3, shootout: 34 },
  1995: { extraTime: 15, shootout: 8 },
  2024: { extraTime: 28, shootout: 4 },
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
 * reach point, and the carrier weighing the same reach; calibration round 69, core, 120 matches:
 * completion 77.32 → 77.43%, interceptions 13.6 → 7.5 a team, goals 3.46 → 3.49 a match) and the
 * failed passes it counts in the diagnostics moved every value and the knockout ties (rescanned
 * above); before it, facts 1975 f0a0ba2dc499fd22, a8cc64939de38037, 95f7e78f01131e08, 1995
 * 57fc93f647a63148, d723ad996af0ff79, fdc8517c30c5d3fb, 2024 2e9ffd372f9aa7ec, 33aa01cd4e3be1b8,
 * 2cab6d1d194e4b9a and positions 1975 1ee9029e583b99f8, 5eae25ce083d761e, 1995 c2ba4b1c4ad87a64,
 * 504b231aba7ac5c4, 2024 1a1941ede88902e8, 8cea09e476540af1. The pre-feature facts did not move.
 * T442's shut lanes (a tactical presser bends onto the line to the carrier's most dangerous
 * nearby option, a free midfielder or defender screens the lane to a receiver between the lines
 * or in a half-space; calibration round 70, core, 120 observed matches: completion 77.50 →
 * 77.74%, interceptions 7.75 → 7.68 a team, completed passes received between the lines 117.9 →
 * 121.4, goals 3.76 → 3.62 a match) moved every value and the knockout ties (rescanned above);
 * before it, facts 1975 c4d93285007310ee, a828fdd639a506fa, 36992b0b450c72e9, 1995
 * d4d42ae5647bb365, c5a91f8d1170e536, 13e9a69f1e668f3b, 2024 e1aef5ff1c701e4f, bce42676d9fbdf5d,
 * b60aadef25ea149a and positions 1975 952927960c337847, 2840657c0b94a08d, 1995 325853b9ab476dea,
 * 697e2e9f3ede1113, 2024 cf2e018cdfce0754, c71a5c328c7e55ed. The pre-feature facts did not move.
 * T443's box scene (with the ball wide in the final third or in a cut-back zone the attack runs to
 * the near post, far post, spot and edge and attacks them once a delivery is decided, the defence
 * drops its line and guards the same zones goal-side; calibration round 71, core, 600 observed
 * matches: crosses with an attacker at the near post as the ball arrives 7.2 → 31.4%, at the far
 * post 1.4 → 10.4%, crosses 19.4 → 22.3 a team, goal-area shots 9.2 → 12.4%, goals 3.52 → 3.72 a
 * match) moved every value and the knockout ties (rescanned above); before it, facts 1975
 * 7d311e2c465bc602, b6febc668d0d0cc9, e7b736db43a7a6a7, 1995 19d4f63a15d78e30, 2936ccf0614b4670,
 * f74becf51e0b99f0, 2024 bcafe9152a69d3bd, f287fc350d1045ad, a3b4e932e381fdac and positions 1975
 * 350a67f60513a2fc, a3b25d3bce2120b5, 1995 5b66267c6e2a4fcc, 44a1e8a1de4f43c1, 2024
 * 8dd31f09ec973fcc, 4aa3c8bbf628efb6. The pre-feature facts did not move.
 * T444's deliveries into the zones (a cross or cut-back only into a zone a teammate attacks, its
 * runner drawn by how free he arrives, how the ball suits him and the zone's xT, the ball cut out
 * by the first opponent who cleanly reaches its path, a lofted ball's zone left to the aerial duel,
 * the runner meeting it at the zone and finishing it there as his next action, and the deliveries
 * counted by kind in the diagnostics; calibration round 72, core, 600 matches: crosses 22.6 → 14.2
 * a team with completion 23.4 → 14.5%, cut-backs 0.29 → 0.29, shots 14.3 → 15.1, goals 3.73 → 4.18
 * a match) moved every value and the knockout ties (rescanned above); before it, facts 1975
 * 3f9cfdff85bd45ef, 9a6f5a42fdd5fe59, bc3460cfeb8a48ad, 1995 422b64c39c11e06e, 9fae62be96978f74,
 * 3c108dbb0e02b660, 2024 30f08f0bf85411b6, 8964a2388fd5bb2a, 32b65f20c115078e and positions 1975
 * 31842e9f5af0aee9, f154cf1da07db9ff, 1995 38a0baf0b245e582, 75cdf7850cb39d75, 2024
 * 5df9e432ad3cc5ac, 28c832067a6702c5. The pre-feature facts did not move.
 * T445's shots through the bodies in front of goal (each outfielder in the shot's path blocks it
 * first, nearest the shooter first, its xG reading them; a loose block or parry falls where it
 * would and goes to whoever reaches it first while the blocker or keeper stands where he met it,
 * an attacker winning it in the box shooting first time; an observed shot after an in-stride
 * carry records every slot at its kick; calibration round 73, core, 600 observed matches: blocked
 * share of shots 27.5 → 36.3%, on target 36.7 → 24.0%, xG per shot 0.140 → 0.098, rebound shots
 * 0.43 → 0.63 a team, goals 4.09 → 2.96 a match) moved every value but 1995's shoot-out facts and
 * the knockout ties (rescanned above); before it, facts
 * 1975 76b5fd1a4ce755ae, 4b92745d989704a9, cb6ecdc833e6990a, 1995 634a262d6f1aabe3,
 * 39e4ae3e5a4ed4f7, d43e40ae9649b414, 2024 abe6d99012360921, fb268d12a73d355b, ad622101dd51cab1
 * and positions 1975 5e50d68e08f33eba, 1605f44ccffaeb88, 1995 1178c80d9315ab6d,
 * 644dbefc58b01ffb, 2024 75e68eaf731f13ca, f22fde17b921bf26. The pre-feature facts did not move.
 * T437's recalibration (fewer bodies blocking a shot and fewer still a header, a lower shot
 * volume, fewer carries and take-ons into the goal area, more failed passes cut out by the man
 * who reaches them, more fouls outside the box; calibration round 74, core, 600 matches: shots
 * 15.2 → 13.6 a team, goal-area shots 12.9 → 6.8%, interceptions 7.7 → 11.4 a team, goals 3.09 →
 * 2.75 a match; validation round 68, 2,400: goals 2.96 → 2.67) and the pass with no length that
 * now leaves over the nearest line moved every value and the 1995 and 2024 knockout ties
 * (rescanned above); before it, facts 1975 7d4e5fc81f9733c7, a69d1c0455f65535,
 * 62021d557722660d, 1995 0c26fac316a61074, 04074bf48cb46a4e, 94ae1e80115f126d, 2024
 * 448f341a21ca816b, 47fdd227e2cf33e0, dce7e342f49cf48f and positions 1975 98a350dd7da5e9d0,
 * fd13d38e6e592f07, 1995 c61c58ff8b084dfb, 61bd61d96516d630, 2024 afd5c596bab19e43,
 * 0241143543502b07. The pre-feature facts did not move.
 * T446's lofted deliveries over the crowd (a far-post ball reachable only at the crosser's foot
 * and where it drops, the carrier's choice of delivery reading its path's reach, no delivery when
 * every one is cut out; calibration round 75, core, 600 matches: far-post deliveries reaching
 * their runner 0.2 → 22.9%, cross completion 13.8 → 21.8%, goals 2.63 → 2.93 a match; validation
 * round 69, 2,400: goals 2.77 → 3.06) moved every value and the knockout ties (rescanned above);
 * before it, facts 1975 79c5762bea1d74b9, 49f9889152c6369e, 2a9e98fe6aeb4bba, 1995
 * cf9c95988eb45d79, 532e0f82b7915272, c8457214835a8d19, 2024 bee8b6d310d768ff, e05ca4b621bb4b90,
 * 85545a9d5babc464 and positions 1975 28f2abb7b98fcda2, 21f7f1e0cd812d9f, 1995
 * 37a089dcee500268, c3030ced54399671, 2024 43ec6c13eaa7e33d, dc9b6c3acbe0737e. The pre-feature
 * facts did not move.
 * T447's box zone depths (the far-post zone 3 → 8 m out, the keeper's claim on a lofted delivery
 * +0.15; calibration round 76, core, 600 matches: goal-area shots 9.6 → 6.7%, far-post deliveries
 * reaching their runner 21.9 → 17.2%, goals 3.00 → 2.73 a match; validation round 70, 2,400:
 * goals 2.97 → 2.84) moved every value and the knockout ties (rescanned above); before it, facts
 * 1975 bc50f6a7f405b359, e8a26e408c15f210, 56e3c0d6fe1112e8, 1995 cffd8027492b1613,
 * fbb69ebb02f96b08, 8a7b5a6d07c12315, 2024 754fdc2ada509b3a, 66392957bbef0472, 99cc133dd7439a18
 * and positions 1975 da77dcd869b05a14, 1cbbf86a7af506ac, 1995 734b72709cff6baf, 2c1aa9caf17259f1,
 * 2024 1dae5f1755497eef, 2362ea450611199a. The pre-feature facts did not move.
 * T435's match-model revision 2 names every candidate record's model continuous-aggregate-2 and
 * played the same football until T432 used it: it moved the facts digests by that label only and
 * no positions digest; before it, facts 1975 a29eb278c768540c, a74abb8cfd489a58, cb404e2c025fb3f4,
 * 1995 7f87afd0e25ba811, dad4ff2e8fdfcf1a, d84decf0069941c7, 2024 350be78318430d71,
 * 7a6282dbe15f7b44, e9132add2a2297e4 (now revision 1's, `REVISION_1`).
 * T432's freedom, disorder and swaps on revision 2 (160 observed fixtures against revision 1:
 * goals 2.46 → 2.72, xG 2.48 → 2.66 a match) moved every value and the knockout ties (rescanned
 * above); before it, facts 1975 6a4775a7a336398a, 2b46be63fad36d0e, dbed6956f2b6b738, 1995
 * 93425a463d8e9aed, 33a0d290368a0747, 46e07bd58865be6b, 2024 d60b15c309a5595c, 43bd04020b1271aa,
 * 33124e7a42b4d58b (revision 1's football under revision 2's label) and positions as
 * `REVISION_1`'s. The pre-feature facts did not move.
 * T433's 규율, 압박 성향 and 예측력 in revision 2's movement (20 observed fixtures, indicative:
 * goals 2.95 → 2.70, xG 2.74 → 2.50 a match) moved every value and the knockout ties (rescanned
 * above); before it, facts 1975 e8919dcd7339e348, 5948ddfb9d3134df, 273bee624dbec12d, 1995
 * 9710bbf8648bf7ed, 5521ef3c3d047c7f, 9354135b628c4a99, 2024 78e410693bd80db4, ab883a82561b0fd7,
 * 679b7a94b32ab318 and positions 1975 03a625c0b9561fac, b2f4246a1339c5ad, 1995 62151697c1d9bb1d,
 * 23b65c5afb831dac, 2024 8a93907fff1ddb60, d8d442978a90c486. Revision 1's and the pre-feature
 * facts did not move.
 * T466's match-model revision 3 (the own club's opponent, a club nobody owns, adds its named
 * manager's context, (ability − 50)/4 with morale at the neutral 60, in place of a flat 4) moved
 * every value and the knockout ties (rescanned above); before it, the values now revision 2's
 * (`REVISION_2`). Revision 1's and the pre-feature facts did not move.
 * T477's dead-time samples (an observed restart's walk-in traced until everyone stands, drawn
 * as breakpoints, and each frame's stoppages) moved every positions digest, revisions 1 and 2's
 * included, and no facts; before it, positions 1975 10ad6b49f08d73dc, 35f00b617b2f4839, 1995
 * de62286ac131c1d6, 3f1734fb59d796bd, 2024 9c5ff17e9b20f6c8, 2e32d3618014ec18; revision 1's 1975
 * 07c822b4e9c902d3, 10e90c63b1226de8, 1995 fa795c0e24ba2c5e, d026d8cfaaeca681, 2024
 * b9e0c5c071922d28, d79ba1087cbcb882; revision 2's 1975 35ea868b9affb3e0, f1d6631c1d314de5, 1995
 * 0e8dbc974f1dcff7, 3c3ee0b9d2f5d65e, 2024 b8bf30012f3c2629, 9be27ba543464172.
 * T479's match-model revision 4 (a free kick played as a pass goes to the nearest suitable player,
 * in the own third a centre-back or the keeper, instead of the named taker) moved every value and
 * the knockout ties (rescanned above); before it, the values now revision 3's (`REVISION_3`).
 * Revisions 1 and 2's and the pre-feature facts did not move.
 * T480's corner numbers on revision 4 (2–3 attackers kept back near halfway and 1–2 defenders left
 * up, drawn per corner and set by the late score, every attacker who went up marked before the
 * zones, the keeper up in added time one goal behind; 16 observed fixtures: attackers within 25 m
 * of goal at the kick, taker included, 9+ in 36 → 2% of corners, the rest 41 → 55 m from that goal
 * line) moved every value and the knockout ties
 * (rescanned above); before it, facts 1975 a93fcdd189f1175e, dbec53b6a91fa171, ab92e4705856f241,
 * 1995 6bc7ffbc47956777, 53b8998bb26840e0, 63c73ad5aadab90d, 2024 ac7984e59c1cede7,
 * 46fd46c2c7f3b25f, abe627a2f695a167 and positions 1975 32d3b1b9ecd8b4ba, b48043fac882d662, 1995
 * 0f174a70f94a52ca, 2e34d67e0cf48ddf, 2024 a3d5c6d968b99691, 62ae7d2c1a33703f. Revisions 1–3's
 * and the pre-feature facts did not move.
 * T481's shot choice on revision 4 (the lines' shot weights FW 1, MF 0.8, DF 0.5 at scale 0.25
 * in place of FW 0.3, MF 22.5, DF 4.5 at 0.37, playmaker roles ×0.85; 600 matches: shots 13.61 a
 * team, goals 3.13 a match, goals by FW 81.5%) moved every value and the knockout ties (rescanned
 * above); before it, facts 1975 9b3a3006cb467519, 92395b9ae0e41692, e63fa618c748d9e6, 1995
 * 81f04a94d8ac724c, 875423ce84d7bd5e, 1728583de8753114, 2024 0d0e15edcd7ac7a4, 7937eb6693d0cf0b,
 * c6d191e579678129 and positions 1975 0a16aa50c06a78c3, 10862565d43d799a, 1995 7fe1b323ff875d52,
 * 34e1d2abf2b0fc14, 2024 f313e4ccd5caf956, d18c0625cef7e1b7. Revisions 1–3's and the
 * pre-feature facts did not move.
 * T482's recalibration of revision 4 (its own shot quality, a clear chance raising the shot weight
 * up to twice, a pass's threat gain weighed 0.3, `shotScale` 0.28, a crossed delivery's base
 * chance 0.7 and fouls ×1.5; 600 matches: shots 13.6 → 11.3 a team, goals 3.13 → 2.86 a match,
 * passes 413 → 426 with their directions inside MATCH-23, 20 → 25 of 37 rows inside) moved every
 * value and the knockout ties (rescanned
 * above); before it, facts 1975 159035b84cb548cd, 21cfba3e5c5f1f55, 2f43f802be361e54, 1995
 * 9d0a6acb0d907276, d75d74e1cdce2a32, 49fa0b2cfaf84949, 2024 d138fbf81acf98d3, 140894b11d21f6d3,
 * a45d7c8cb4c77f08 and positions 1975 c0d0476ad7a8ae16, 6cca4859d84475d4, 1995 e65c183acd9804d3,
 * 7c6fa52fd295e59b, 2024 482f9597e9f50715, a0fed57e39fcef7a. Revisions 1–3's and the
 * pre-feature facts did not move.
 * T541's one object shape for every intention (all fields in one order) moved the positions
 * only, by the key order of the intentions the trace holds; the same trace and frames with their
 * keys sorted keep their digests, and no fact moved. Before it, positions 1975 3027c05259d2646b,
 * 5ff631fdd68c210e, 1995 54d2da5ba8a53970, 876491fde6062150, 2024 90d5b37b1bc714fd,
 * 6a8baa3681c8f7ec; revisions 1–3's positions moved the same way, before it revision 1
 * 9b1d1e4afec99290, c90e40263ab74f4a, f538dd78ce911d58, b50fddc754adbfa7, 419426637e81823d,
 * 922abdcf670b682e, revision 2 9422a01ee585338c, 6c62a0170468fb44, 4157fe10bef7e72a,
 * 46f860a8d7e120df, c289738186db96f1, 02199a0d1cbbd758, revision 3 44f653394e8e0ebb,
 * 661e258a3624763f, d8a8072fb4089b4f, f3e35ac622f94edf, 76b4318919a285f9, eb3a424e772bd1fa.
 * T538's match-model revision 5 (the carrier takes open ground, recycles only safely, never plays
 * it far back with room near the box and plays down the wing; 600 matches in result) moved every
 * value and the knockout ties (rescanned above); before it, the values now revision 4's
 * (`REVISION_4`). Revisions 1–4's and the pre-feature facts did not move.
 * T542's match-model revision 6 (a clear chance taken, a beaten man left behind, a free man ahead
 * found, a misplaced pass kept in play, support spread and the shooting line screened; 600 matches
 * in result) moved every value and the knockout ties (rescanned above); before it, the values now
 * revision 5's (`REVISION_5`). Revisions 1–5's and the pre-feature facts did not move.
 * T548's match-model revision 7 (a chased forward takes his clear chance, the men within a few
 * metres close the shot down and the keeper comes off his line to a carrier in his box; 600
 * matches in result) moved every value and the knockout ties (rescanned above); before it, the
 * values now revision 6's (`REVISION_6`). Revisions 1–6's and the pre-feature facts did not move.
 * T561's match-model revision 8 (a showing teammate offers at a passing distance, and with the
 * ball his teammates spread and keep room around the carrier; 600 matches in result) moved every
 * value and the knockout ties (rescanned above); before it, the values now revision 7's
 * (`REVISION_7`). Revisions 1–7's and the pre-feature facts did not move.
 * T579's match-model revision 9 (the carrier shields only from outfielders, a shot is struck soon
 * after he chooses it, nobody within 5 m is a clear chance and the keeper comes about half way,
 * narrowing the angle; 600 matches in result) moved every value and the knockout ties (rescanned
 * above); before it, the values now revision 8's (`REVISION_8`). Revisions 1–8's and the
 * pre-feature facts did not move.
 */
const CANDIDATE: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: 'TODO',
      extraTime: 'TODO',
      shootout: 'TODO',
    },
    positions: { observed: 'TODO', shootout: 'TODO' },
  },
  1995: {
    facts: {
      league: 'TODO',
      extraTime: 'TODO',
      shootout: 'TODO',
    },
    positions: { observed: 'TODO', shootout: 'TODO' },
  },
  2024: {
    facts: {
      league: 'TODO',
      extraTime: 'TODO',
      shootout: 'TODO',
    },
    positions: { observed: 'TODO', shootout: 'TODO' },
  },
};

/**
 * Revision 8's knockout ties and digests (T579): T561's values, the football revision 8 plays
 * before revision 9. Their facts never move again (→SAVE-23); a presentation-only change
 * re-records their positions.
 */
const REVISION_8_CASES = {
  1975: { extraTime: 3, shootout: 34 },
  1995: { extraTime: 15, shootout: 8 },
  2024: { extraTime: 28, shootout: 4 },
} as const satisfies Record<Year, { extraTime: number; shootout: number }>;
const REVISION_8: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: '5237e7f0a7c4bca2',
      extraTime: '456cbf0207faaa85',
      shootout: '565b3feaeedfd913',
    },
    positions: { observed: '2a405a51c141f857', shootout: '17490d94bad986f3' },
  },
  1995: {
    facts: {
      league: '9dc78d13d99d7cf0',
      extraTime: '1a237482a96e4fa4',
      shootout: '017033d11d02f0d0',
    },
    positions: { observed: 'aaaf17ebebfdc88c', shootout: '815f104f6ac63582' },
  },
  2024: {
    facts: {
      league: '9d14197ce3c5605a',
      extraTime: '9910152d1932e258',
      shootout: '6c821deda83c7564',
    },
    positions: { observed: '509101b98b565062', shootout: '76d2d8c60a522eab' },
  },
};

/**
 * Revision 7's knockout ties and digests (T561): T548's values, the football revision 7 plays
 * before revision 8. Their facts never move again (→SAVE-23); a presentation-only change
 * re-records their positions.
 */
const REVISION_7_CASES = {
  1975: { extraTime: 11, shootout: 30 },
  1995: { extraTime: 18, shootout: 7 },
  2024: { extraTime: 14, shootout: 13 },
} as const satisfies Record<Year, { extraTime: number; shootout: number }>;
const REVISION_7: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: '7fe0bca65d1163cb',
      extraTime: 'cd501ed4ac55d78c',
      shootout: 'd527c229a4aff52f',
    },
    positions: { observed: '5ff3cee154b47952', shootout: '528448c4e0942336' },
  },
  1995: {
    facts: {
      league: '09c2603a39ee6ae2',
      extraTime: '6469abcfdda624f4',
      shootout: '11ecc6b6c2440ec3',
    },
    positions: { observed: 'bb4839841b6a47db', shootout: '8fe45aacf635eec4' },
  },
  2024: {
    facts: {
      league: 'ee178cb439a14a38',
      extraTime: '464848b045d17fc8',
      shootout: '105ca033c60bf519',
    },
    positions: { observed: '829a27004417c86b', shootout: '07a1f68cecd6be77' },
  },
};

/**
 * Revision 6's knockout ties and digests (T548): T542's values, the football revision 6 plays
 * before revision 7. Their facts never move again (→SAVE-23); a presentation-only change
 * re-records their positions.
 */
const REVISION_6_CASES = {
  1975: { extraTime: 7, shootout: 20 },
  1995: { extraTime: 5, shootout: 3 },
  2024: { extraTime: 12, shootout: 7 },
} as const satisfies Record<Year, { extraTime: number; shootout: number }>;
const REVISION_6: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: '526a52ec99908b8d',
      extraTime: '83eeedc8ac37884b',
      shootout: '196e08d9231ea4a8',
    },
    positions: { observed: 'eda0b0fe52316ed0', shootout: '1ac727ef2315eb47' },
  },
  1995: {
    facts: {
      league: '82b9aa6e0e54987c',
      extraTime: 'a07a3626576891fe',
      shootout: '9c9ae1780fc3cb23',
    },
    positions: { observed: 'cf2aa0248f68f1ee', shootout: '36cf4e547e8938a1' },
  },
  2024: {
    facts: {
      league: '88b2271c8defc4ed',
      extraTime: 'c1a476dd31b735f2',
      shootout: 'ea16324d5a414cd8',
    },
    positions: { observed: '68d2cf6e309b37f1', shootout: 'dcc5f9f366e9fba0' },
  },
};

/**
 * Revision 5's knockout ties and digests (T542): T538's facts with T541's positions, the football
 * revision 5 plays before revision 6. Their facts never move again (→SAVE-23); a
 * presentation-only change re-records their positions.
 */
const REVISION_5_CASES = {
  1975: { extraTime: 3, shootout: 2 },
  1995: { extraTime: 6, shootout: 1 },
  2024: { extraTime: 23, shootout: 0 },
} as const satisfies Record<Year, { extraTime: number; shootout: number }>;
const REVISION_5: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: 'cf67feb0f94fdc25',
      extraTime: '157a608e4c0d386b',
      shootout: '4b2b91cdda330183',
    },
    positions: { observed: 'e39d98b368141362', shootout: '7967c5d6035ec169' },
  },
  1995: {
    facts: {
      league: '239c2ac6596002ac',
      extraTime: 'b88a80ac24efe660',
      shootout: '06a2c079863c26ee',
    },
    positions: { observed: '782759b9346aa90a', shootout: '3484dd02c9de2c1c' },
  },
  2024: {
    facts: {
      league: '418cc04276ff1627',
      extraTime: '9589dc069dfe996e',
      shootout: '252166ebede7efee',
    },
    positions: { observed: '927f4d152c8ea939', shootout: '11ca6e224af987ce' },
  },
};

/**
 * Revision 4's knockout ties and digests (T538): T482's facts with T541's positions, the football
 * revision 4 plays before revision 5. Their facts never move again (→SAVE-23); a presentation-only change
 * re-records their positions.
 */
const REVISION_4_CASES = {
  1975: { extraTime: 6, shootout: 31 },
  1995: { extraTime: 5, shootout: 29 },
  2024: { extraTime: 7, shootout: 11 },
} as const satisfies Record<Year, { extraTime: number; shootout: number }>;
const REVISION_4: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: 'ff3ee324036397fb',
      extraTime: '9123874a456d7917',
      shootout: 'c036d50bc978b2c4',
    },
    positions: { observed: 'b28fe938e12833f0', shootout: 'aa89273dd9ca390b' },
  },
  1995: {
    facts: {
      league: '6beeda0cca168bbf',
      extraTime: 'b3260a6423ff14ed',
      shootout: 'de436ce27ba0ad83',
    },
    positions: { observed: '8664d10d9934599f', shootout: 'aae043fdf68570b6' },
  },
  2024: {
    facts: {
      league: 'eb70938375c3edca',
      extraTime: '2792f74cd4b0c753',
      shootout: '42be4633359152e7',
    },
    positions: { observed: '0c9b482e7c77a6fe', shootout: 'a8991d6383faf80b' },
  },
};

/**
 * Revision 3's knockout ties and digests (T479): T466's values with T477's positions, the football
 * revision 3 plays before revision 4. Their facts never move again (→SAVE-23); a presentation-only
 * change re-records their positions.
 */
const REVISION_3_CASES = {
  1975: { extraTime: 9, shootout: 2 },
  1995: { extraTime: 7, shootout: 5 },
  2024: { extraTime: 4, shootout: 3 },
} as const satisfies Record<Year, { extraTime: number; shootout: number }>;
const REVISION_3: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: '72876a33da257df1',
      extraTime: '086a1810c411e442',
      shootout: 'b1ed4b997d8479e7',
    },
    positions: { observed: '120524806f37c7e8', shootout: 'f5aac51a8915b7a6' },
  },
  1995: {
    facts: {
      league: 'fb3d3e85d084c617',
      extraTime: '696fbe7ef4736ce9',
      shootout: '0f3bc5b875ddb3c7',
    },
    positions: { observed: '4a9619d12297577c', shootout: '68c6b9a21c766cb0' },
  },
  2024: {
    facts: {
      league: 'd2be53d1757cb9df',
      extraTime: '22a1209ed63b73c5',
      shootout: '324328c61352294c',
    },
    positions: { observed: 'e5a9ea9ab8a76c2f', shootout: '08ac5fe20a57c569' },
  },
};

/**
 * Revision 2's knockout ties and digests (T466): T433's values, the football revision 2 plays
 * before revision 3's context. Their facts never move again (→SAVE-23); a presentation-only
 * change re-records their positions (T477).
 */
const REVISION_2_CASES = {
  1975: { extraTime: 3, shootout: 0 },
  1995: { extraTime: 3, shootout: 1 },
  2024: { extraTime: 0, shootout: 4 },
} as const satisfies Record<Year, { extraTime: number; shootout: number }>;
const REVISION_2: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: 'a137966f0f7f3010',
      extraTime: '96ff5a32e01d4bf8',
      shootout: '7521661b980cdeff',
    },
    positions: { observed: '1efa78ca0207e30c', shootout: 'e1a3ee7e0e66c998' },
  },
  1995: {
    facts: {
      league: 'fdcd4f79e274b98d',
      extraTime: '9127b370c79b51e2',
      shootout: '2245959519f7889b',
    },
    positions: { observed: '7334880372388967', shootout: 'f81841f663ff75ac' },
  },
  2024: {
    facts: {
      league: 'cc6c044d76f22789',
      extraTime: '30e249776a77fcb4',
      shootout: '64b50a8346f097fd',
    },
    positions: { observed: '581c0cc9978143bf', shootout: '5d463b96222a6328' },
  },
};

/**
 * Revision 1's knockout ties and digests (T432): the football revision 2 played until T432 moved
 * it, its facts labelled continuous-aggregate-1 (T435's values before its label) and its positions
 * as T447 recorded them. Their facts never move again (→SAVE-23); a presentation-only change
 * re-records their positions (T477).
 */
const REVISION_1_CASES = {
  1975: { extraTime: 4, shootout: 2 },
  1995: { extraTime: 2, shootout: 5 },
  2024: { extraTime: 16, shootout: 0 },
} as const satisfies Record<Year, { extraTime: number; shootout: number }>;
const REVISION_1: Record<Year, CandidateDigests> = {
  1975: {
    facts: {
      league: 'a29eb278c768540c',
      extraTime: 'a74abb8cfd489a58',
      shootout: 'cb404e2c025fb3f4',
    },
    positions: { observed: '1df5ff92bacc5a24', shootout: 'd1731fb51fdef0c0' },
  },
  1995: {
    facts: {
      league: '7f87afd0e25ba811',
      extraTime: 'dad4ff2e8fdfcf1a',
      shootout: 'd84decf0069941c7',
    },
    positions: { observed: 'cac36dfc7e17b7b9', shootout: '58e79b9ad461176c' },
  },
  2024: {
    facts: {
      league: '350be78318430d71',
      extraTime: '7a6282dbe15f7b44',
      shootout: 'e9132add2a2297e4',
    },
    positions: { observed: '114edcda180b1939', shootout: 'be13fb3a982cd7ba' },
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
      // Revisions 1–8 play as they did before later revisions moved (→SAVE-23): their matches
      // replay under them.
      const earlier = (
        revision: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
        cases: { extraTime: number; shootout: number },
      ) => {
        const on = (id: string, opts: Parameters<typeof play>[2] = {}) =>
          play(kit, id, { ...opts, model: MATCH_MODEL_REVISIONS[revision] });
        const pens = on(`knockout-${year}-${cases.shootout}`, { decide: LEVEL, observe: true });
        const league = on(`league-${year}`, { observe: true });
        return {
          facts: {
            league: factsOf(league),
            extraTime: factsOf(on(`knockout-${year}-${cases.extraTime}`, { decide: LEVEL })),
            shootout: factsOf(pens),
          },
          positions: { observed: positionsOf(league), shootout: positionsOf(pens) },
        };
      };
      expect(earlier(0, REVISION_1_CASES[year]), `${year} revision-1 digests`).toEqual(
        REVISION_1[year],
      );
      expect(earlier(1, REVISION_2_CASES[year]), `${year} revision-2 digests`).toEqual(
        REVISION_2[year],
      );
      expect(earlier(2, REVISION_3_CASES[year]), `${year} revision-3 digests`).toEqual(
        REVISION_3[year],
      );
      expect(earlier(3, REVISION_4_CASES[year]), `${year} revision-4 digests`).toEqual(
        REVISION_4[year],
      );
      expect(earlier(4, REVISION_5_CASES[year]), `${year} revision-5 digests`).toEqual(
        REVISION_5[year],
      );
      expect(earlier(5, REVISION_6_CASES[year]), `${year} revision-6 digests`).toEqual(
        REVISION_6[year],
      );
      expect(earlier(6, REVISION_7_CASES[year]), `${year} revision-7 digests`).toEqual(
        REVISION_7[year],
      );
      expect(earlier(7, REVISION_8_CASES[year]), `${year} revision-8 digests`).toEqual(
        REVISION_8[year],
      );
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
