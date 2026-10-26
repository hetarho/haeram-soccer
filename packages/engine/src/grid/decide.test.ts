import { describe, expect, it } from 'vitest';
import {
  MATCH_MODEL_REVISION,
  MATCH_MODEL_REVISIONS,
  type MatchModelRevision,
} from '../../../contracts/src/match-model';
import { ATTRIBUTES, type PlayTrait } from '../../../contracts/src/player';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { actionWeight } from '../match';
import { random } from '../primitives';
import { CELL_BASELINES } from './baselines';
import { BOX_CONFIG, boxScene, deliveries, DELIVERY_ACTION, deliveryPoint } from './box';
import {
  actionMix,
  ACTIONS,
  chooseCarry,
  chooseDelivery,
  choosePass,
  decide,
  DECISION_CONFIG,
  keeperDistribution,
  passOptions,
  passProbabilities,
  temperature,
  throughPoint,
  type Action,
} from './decide';
import { BAND_EDGES, LANE_EDGES, type Point } from './pitch';
import { chanceXg } from './resolve';
import { enterSlot, slotOf } from './state';
import { computeTags, type Tags } from './tags';
import { gridKit } from './testkit';
import type { Tactic } from '../../../contracts/src/types';

const CM = 7;
const ST = 9;
/** Revision 3: the cases that read its numbers (revision 4 has its own, T481, T482). */
const REVISION_3 = MATCH_MODEL_REVISIONS[2];

/**
 * A side-0 carrier at `at` on the pre-feature path (candidate cases set the setup's model);
 * everyone else parked far away unless a test places them.
 */
function scene(slot: number, at: Point, tactics: [Tactic, Tactic] = ['balanced', 'balanced']) {
  const kit = gridKit(tactics, undefined, DISABLED_RELEASE);
  const s = kit.state;
  for (const side of s.players)
    for (const gp of side) gp.pos = [gp.side === 0 ? 3 : 102, gp.side === 0 ? 2 : 66];
  const me = s.players[0][slot]!;
  me.pos = [...at];
  s.owner = [0, slot];
  s.ball = [...at];
  s.possession = 0;
  s.elapsed = 600;
  s.possessionSince = 595;
  return { kit, s, me, tags: () => computeTags(s, 0, slot) };
}
const place = (s: ReturnType<typeof scene>['s'], idx: number, p: Point) =>
  (s.players[0][idx]!.pos = [...p]);
function setSkills(
  s: ReturnType<typeof scene>['s'],
  idx: number,
  values: Partial<Record<(typeof ATTRIBUTES)[number], number>>,
) {
  const gp = s.players[0][idx]!;
  for (const a of ATTRIBUTES) gp.player.attrs[a] = values[a] ?? gp.player.attrs[a];
  enterSlot(s, gp, gp.slot);
}
const centre = (band: number, lane: number): Point => [
  (BAND_EDGES[band]! + BAND_EDGES[band + 1]!) / 2,
  (LANE_EDGES[lane]! + LANE_EDGES[lane + 1]!) / 2,
];
const mixAt = (
  slot: number,
  at: Point,
  tweak?: (tags: Tags) => Tags,
  tactics?: [Tactic, Tactic],
) => {
  const sc = scene(slot, at, tactics);
  return actionMix(sc.s, 0, slot, tweak ? tweak(sc.tags()) : sc.tags());
};

describe('grid decisions', () => {
  it("reproduces a cell's real action mix for a neutral carrier", () => {
    const sc = scene(CM, centre(4, 2));
    sc.me.player.traits = [];
    setSkills(sc.s, CM, Object.fromEntries(ATTRIBUTES.map((a) => [a, 60])));
    // Teammates around so passes always find someone.
    (
      [
        [50, 20],
        [55, 48],
        [72, 34],
        [48, 34],
      ] as Point[]
    ).forEach((p, i) => place(sc.s, 1 + i, p));
    const tags = sc.tags();
    expect(tags.pressure).toBe(0);
    const baseline = CELL_BASELINES[tags.cell]!;
    const mix = actionMix(sc.s, 0, CM, tags);
    expect(Math.abs(mix.pass + mix.cross + mix.cutBack - baseline.pass)).toBeLessThan(0.04);
    expect(Math.abs(mix.carry - baseline.carry)).toBeLessThan(0.04);
    expect(Math.abs(mix.takeOn - baseline.takeOn)).toBeLessThan(0.04);
    const r = random('mix-draws');
    const seen: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) {
      const d = decide(sc.s, 0, CM, tags, r);
      seen[d.action] = (seen[d.action] ?? 0) + 1 / 5000;
    }
    expect(Math.abs((seen.pass ?? 0) - baseline.pass)).toBeLessThan(0.06);
    expect(Math.abs((seen.carry ?? 0) - baseline.carry)).toBeLessThan(0.06);
    expect(Math.abs((seen.takeOn ?? 0) - baseline.takeOn)).toBeLessThan(0.05);
  });

  it('shoots far more in the central box than in front of the box and never from the own half', () => {
    const inBox = mixAt(ST, centre(6, 2));
    const front = mixAt(ST, centre(5, 2));
    expect(inBox.shot).toBeGreaterThan(3 * front.shot);
    for (let band = 0; band <= 3; band++)
      for (let lane = 0; lane < 5; lane++)
        expect(mixAt(ST, centre(band, lane)).shot, `${band}.${lane}`).toBe(0);
    for (const mix of [inBox, front])
      expect(ACTIONS.reduce((sum, a) => sum + mix[a], 0)).toBeCloseTo(1, 9);
  });

  it('crosses only from bands 5–7 and cuts back only from the cut-back cells', () => {
    let crossed = 0,
      cut = 0;
    for (let band = 0; band < 8; band++)
      for (let lane = 0; lane < 5; lane++) {
        const mix = mixAt(8, centre(band, lane));
        if (band < 5) {
          expect(mix.cross, `${band}.${lane}`).toBe(0);
          expect(mix.cutBack, `${band}.${lane}`).toBe(0);
        }
        if (!(band === 7 && (lane === 1 || lane === 3)))
          expect(mix.cutBack, `${band}.${lane}`).toBe(0);
        if (mix.cross > 0) crossed++;
        if (mix.cutBack > 0) cut++;
        if (band >= 5) expect(mix.clearance).toBe(0);
      }
    expect(crossed).toBeGreaterThan(0);
    expect(cut).toBe(2);
  });

  it('counter stops recycling once its break has passed', () => {
    const D = DECISION_CONFIG.direct;
    // Counter's settled play on the candidate (T334): fewer passes, forward and long ones first.
    const R = D.settled.counter!;
    expect(R.pass).toBeLessThan(1);
    expect(R.back).toBeLessThan(R.lateral);
    expect(R.lateral).toBeLessThan(1);
    // The balanced side it is read against plays its own settled rule in its half (T371).
    const B = D.settled.balanced!;
    expect(centre(3, 2)[0]).toBeLessThanOrEqual(B.upTo);
    {
      const options = (tactic: Tactic, candidate: boolean, regainAgo?: number) => {
        const sc = scene(CM, centre(3, 2), [tactic, 'balanced']);
        const c = centre(3, 2);
        (
          [
            [c[0] + 12, c[1] - 3],
            [c[0] + 34, c[1] + 4],
            [c[0], c[1] + 14],
            [c[0] - 12, c[1]],
          ] as Point[]
        ).forEach((p, i) => place(sc.s, 1 + i, p));
        if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
        if (regainAgo !== undefined) sc.s.lastRegain = { side: 0, at: sc.s.elapsed - regainAgo };
        return passOptions(sc.s, 0, CM, sc.tags()).filter((o) => o.target <= 4);
      };
      // The carrier's passes against carries, counter's over a balanced side's.
      const passing = (candidate: boolean, regainAgo?: number) => {
        const ratio = (tactic: Tactic) => {
          const sc = scene(CM, centre(3, 2), [tactic, 'balanced']);
          if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
          if (regainAgo !== undefined) sc.s.lastRegain = { side: 0, at: sc.s.elapsed - regainAgo };
          const mix = actionMix(sc.s, 0, CM, sc.tags());
          return mix.pass / mix.carry;
        };
        return ratio('counter') / ratio('balanced');
      };
      expect(passing(true)).toBeCloseTo(R.pass / B.pass, 9);
      expect(passing(true, D.seconds + 1)).toBeCloseTo(R.pass / B.pass, 9);
      expect(passing(true, 1)).toBeCloseTo(1, 9);
      expect(passing(false)).toBeCloseTo(1, 9);
      const compare = (a: ReturnType<typeof options>, b: ReturnType<typeof options>) =>
        a.map((o, i) => ({ o, flat: b[i]! }));
      // Settled (no regain, or past the window): he passes less against carrying on, forward
      // scores more, a long ball more again, lateral and back passes are chosen less often than a
      // balanced side's.
      for (const regainAgo of [undefined, D.seconds + 1]) {
        const pairs = compare(
          options('counter', true, regainAgo),
          options('balanced', true, regainAgo),
        );
        expect(new Set(pairs.map((p) => p.o.direction))).toEqual(
          new Set(['forward', 'lateral', 'back']),
        );
        expect(pairs.some((p) => p.o.kind === 'long' && p.o.direction === 'forward')).toBe(true);
        for (const { o, flat } of pairs) {
          const long = o.kind === 'long' || o.kind === 'switch' ? R.long - B.long : 0;
          expect(o.score - flat.score).toBeCloseTo(
            (o.direction === 'forward' ? R.forward - B.forward : 0) + long,
            9,
          );
          const prior =
            o.direction === 'back'
              ? R.back / B.back
              : o.direction === 'lateral'
                ? R.lateral / B.lateral
                : 1;
          expect(o.prior / flat.prior).toBeCloseTo(prior, 9);
        }
      }
      // Inside the break the break rule alone holds; the pre-feature model ignores both.
      for (const { o, flat } of compare(
        options('counter', true, 1),
        options('balanced', true, 1),
      )) {
        expect(o.score - flat.score).toBeCloseTo(
          o.direction === 'forward' ? D.forward.counter! : 0,
          9,
        );
        expect(o.prior / flat.prior).toBeCloseTo(o.direction === 'back' ? D.back : 1, 9);
      }
      for (const { o, flat } of compare(options('counter', false), options('balanced', false)))
        expect([o.score, o.prior]).toEqual([flat.score, flat.prior]);
    }
  });

  it("plays balanced's settled long balls in its own half only (T371)", () => {
    const R = DECISION_CONFIG.direct.settled.counter!;
    const B = DECISION_CONFIG.direct.settled.balanced!;
    expect(B.long).toBeGreaterThan(0);
    expect(B.back).toBeLessThan(1);
    // Past halfway, still inside counter's zone, counter differs from balanced by its own rule only.
    const at = centre(4, 2);
    expect(at[0]).toBeGreaterThan(B.upTo);
    expect(at[0]).toBeLessThanOrEqual(R.upTo);
    const options = (tactic: Tactic) => {
      const sc = scene(CM, at, [tactic, 'balanced']);
      (
        [
          [at[0] + 12, at[1] - 3],
          [at[0] + 30, at[1] + 4],
          [at[0], at[1] + 14],
          [at[0] - 12, at[1]],
        ] as Point[]
      ).forEach((p, i) => place(sc.s, 1 + i, p));
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      return passOptions(sc.s, 0, CM, sc.tags()).filter((o) => o.target <= 4);
    };
    const counter = options('counter');
    const balanced = options('balanced');
    expect(counter.some((o) => o.kind === 'long' || o.kind === 'switch')).toBe(true);
    counter.forEach((o, i) => {
      const flat = balanced[i]!;
      const long = o.kind === 'long' || o.kind === 'switch' ? R.long : 0;
      expect(o.score - flat.score).toBeCloseTo(
        (o.direction === 'forward' ? R.forward : 0) + long,
        9,
      );
      const prior = o.direction === 'back' ? R.back : o.direction === 'lateral' ? R.lateral : 1;
      expect(o.prior / flat.prior).toBeCloseTo(prior, 9);
    });
  });

  it("stops counter's settled pass weights past its zone, not its pass factor (T336)", () => {
    const R = DECISION_CONFIG.direct.settled.counter!;
    const deep = centre(3, 2);
    const high = centre(5, 2);
    expect(deep[0]).toBeLessThanOrEqual(R.upTo);
    expect(high[0]).toBeGreaterThan(R.upTo);
    // A settled counter carrier in the final third against a balanced one at the same spot.
    const options = (tactic: Tactic) => {
      const sc = scene(CM, high, [tactic, 'balanced']);
      (
        [
          [high[0] + 10, high[1] - 3],
          [high[0], high[1] + 14],
          [high[0] - 12, high[1]],
          [high[0] - 30, high[1] + 4],
        ] as Point[]
      ).forEach((p, i) => place(sc.s, 1 + i, p));
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      return {
        passes: passOptions(sc.s, 0, CM, sc.tags()).filter((o) => o.target <= 4),
        mix: actionMix(sc.s, 0, CM, sc.tags()),
      };
    };
    const counter = options('counter');
    const balanced = options('balanced');
    expect(new Set(counter.passes.map((o) => o.direction))).toEqual(
      new Set(['forward', 'lateral', 'back']),
    );
    counter.passes.forEach((o, i) => {
      expect(o.score).toBeCloseTo(balanced.passes[i]!.score, 9);
      expect(o.prior).toBeCloseTo(balanced.passes[i]!.prior, 9);
    });
    // He still passes less against carrying on.
    expect(
      counter.mix.pass / counter.mix.carry / (balanced.mix.pass / balanced.mix.carry),
    ).toBeCloseTo(R.pass, 9);
  });

  it("reproduces the cell's pass direction mix, back passes weighted, when every target scores the same", () => {
    const sc = scene(CM, centre(4, 2));
    sc.me.player.traits = [];
    const c = centre(4, 2);
    (
      [
        [c[0] + 15, c[1] - 4],
        [c[0], c[1] + 16],
        [c[0], c[1] - 16],
        [c[0] - 15, c[1]],
      ] as Point[]
    ).forEach((p, i) => place(sc.s, 1 + i, p));
    const tags = sc.tags();
    const options = passOptions(sc.s, 0, CM, tags).map((o) => ({ ...o, score: 0 }));
    const probabilities = passProbabilities(options, 1);
    const share: Record<string, number> = { forward: 0, lateral: 0, back: 0 };
    options.forEach((o, i) => (share[o.direction] += probabilities[i]!));
    const baseline = CELL_BASELINES[tags.cell]!;
    const weight = {
      forward: baseline.forward,
      lateral: baseline.lateral,
      back: baseline.back * DECISION_CONFIG.pass.backPrior,
    };
    const total = weight.forward + weight.lateral + weight.back;
    for (const dir of ['forward', 'lateral', 'back'] as const)
      expect(Math.abs(share[dir]! - weight[dir] / total), dir).toBeLessThan(0.05);
  });

  const choiceScene = (decisions: number, composure = 60) => {
    const sc = scene(CM, [74, 34]);
    setSkills(sc.s, CM, { decisions, composure });
    // One receiver ahead, two out wide, one behind; the parked rest are out of reach.
    (
      [
        [82, 34],
        [76, 52],
        [76, 16],
        [66, 34],
      ] as Point[]
    ).forEach((p, i) => place(sc.s, 1 + i, p));
    return sc;
  };
  const bestShare = (sc: ReturnType<typeof choiceScene>, pressure = 0) => {
    const tags = { ...sc.tags(), pressure };
    const options = passOptions(sc.s, 0, CM, tags);
    const probabilities = passProbabilities(options, temperature(sc.s, 0, CM, tags));
    const best = options.reduce((a, b) => (b.score > a.score ? b : a));
    return probabilities[options.indexOf(best)]!;
  };

  it('lets a high-decisions player pick the best target more often', () => {
    expect(bestShare(choiceScene(90)) - bestShare(choiceScene(30))).toBeGreaterThanOrEqual(0.1);
    const sc = choiceScene(90);
    const r = random('best');
    const options = passOptions(sc.s, 0, CM, sc.tags());
    const top = options.reduce((a, b) => (b.score > a.score ? b : a)).target;
    let hits = 0;
    for (let i = 0; i < 2000; i++)
      if (choosePass(sc.s, 0, CM, sc.tags(), r)!.target === top) hits++;
    expect(hits / 2000).toBeCloseTo(bestShare(sc), 1);
  });

  it('a reached lane is chosen less often (T441)', () => {
    // Two receivers 17 m out at ±45°; a defender stands 6 m into the left one's lane, too far from
    // the carrier to press him and from both receivers to mark them.
    const lane = (decisions: number, defender: boolean) => {
      const sc = scene(CM, [60, 34]);
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      setSkills(sc.s, CM, { decisions, composure: 60 });
      place(sc.s, 1, [72, 22]);
      place(sc.s, 2, [72, 46]);
      if (defender) sc.s.players[1][3]!.pos = [64.24, 29.76];
      const tags = sc.tags();
      expect(tags.pressure).toBe(0);
      const options = passOptions(sc.s, 0, CM, tags);
      const p = passProbabilities(options, temperature(sc.s, 0, CM, tags), sc.s.math);
      const of = (target: number) => p[options.findIndex((o) => o.target === target)]!;
      const r = random(`t441-lane-${decisions}-${defender}`);
      let chosen = 0;
      for (let i = 0; i < 4000; i++) if (choosePass(sc.s, 0, CM, tags, r)!.target === 1) chosen++;
      return { odds: of(1) / of(2), chosen: chosen / 4000 };
    };
    const open = lane(60, false);
    const reached = lane(60, true);
    expect(reached.chosen).toBeLessThan(open.chosen - 0.05);
    expect(reached.odds).toBeLessThan(open.odds * 0.8);
    // A better head (a cooler temperature) avoids the reached lane more surely.
    const sharp = lane(90, true).odds / lane(90, false).odds;
    const dull = lane(30, true).odds / lane(30, false).odds;
    expect(sharp).toBeLessThan(dull);
  });

  it("lets pressure scatter a low-composure player's choices", () => {
    const calm = bestShare(choiceScene(60, 90), 2);
    const shaky = bestShare(choiceScene(60, 30), 2);
    expect(shaky).toBeLessThan(calm);
    expect(bestShare(choiceScene(60, 30), 0)).toBeCloseTo(bestShare(choiceScene(60, 90), 0), 9);
  });

  it('takes more shots in front of the box with a long-shot trait, more crosses with a crosser, more hold-up with a target man', () => {
    const withTrait = (
      slot: number,
      at: Point,
      trait: PlayTrait,
      key: Action,
      tags?: (t: Tags) => Tags,
    ) => {
      const plain = scene(slot, at);
      plain.me.player.traits = [];
      const traited = scene(slot, at);
      traited.me.player.traits = [trait];
      const t = (sc: typeof plain) => (tags ? tags(sc.tags()) : sc.tags());
      return [
        actionMix(plain.s, 0, slot, t(plain))[key],
        actionMix(traited.s, 0, slot, t(traited))[key],
      ] as const;
    };
    const [shotPlain, shotLong] = withTrait(CM, centre(5, 2), 'longshot', 'shot');
    expect(shotLong).toBeGreaterThan(shotPlain);
    const [crossPlain, crossCrosser] = withTrait(8, centre(6, 0), 'crosser', 'cross');
    expect(crossCrosser).toBeGreaterThan(crossPlain);
    const [holdPlain, holdTarget] = withTrait(ST, centre(5, 2), 'targetman', 'holdUp', (t) => ({
      ...t,
      orientation: 'backToGoal',
    }));
    expect(holdTarget).toBeGreaterThan(holdPlain);
  });

  it('plays more patiently under possession and more directly on a counter', () => {
    const at = centre(5, 2);
    const balanced = mixAt(CM, at);
    const possession = mixAt(CM, at, undefined, ['possession', 'balanced']);
    expect(possession.pass).toBeGreaterThan(balanced.pass);
    expect(possession.takeOn).toBeLessThan(balanced.takeOn);
    expect(possession.shot).toBeLessThan(balanced.shot);
    const counter = mixAt(CM, at, (t) => ({ ...t, phase: 'counter' }), ['counter', 'balanced']);
    const flat = mixAt(CM, at, (t) => ({ ...t, phase: 'counter' }), ['balanced', 'balanced']);
    expect(counter.shot).toBeGreaterThan(flat.shot);
  });

  it('weighs a shadow striker’s shots by his position on the candidate model only', () => {
    const AM = 7;
    const ratio = (candidate: boolean) => {
      const sc = scene(AM, centre(5, 2), ['press', 'balanced']);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      const mix = actionMix(sc.s, 0, AM, sc.tags());
      return mix.shot / mix.pass;
    };
    const K = DECISION_CONFIG;
    // In front of the box only the shot weight differs between the models: the forwards' weight
    // he takes and the candidate's volume scale (revision 4's, T481) against the midfield line's
    // and the shared scale (T321, T324).
    const R4 = K.candidate.revision4;
    expect(K.candidate.shotPosition.AM).toBe('FW');
    expect(ratio(true) / ratio(false)).toBeCloseTo(
      (R4.shotLine.FW * R4.shotScale) / (K.shotLine.MF * K.shotScale),
      9,
    );
  });

  it('uses its own long-shot fall-off and no regain bonus for press on the candidate model (T324)', () => {
    const K = DECISION_CONFIG;
    // A forward 33 m out in the central lane, then press's just after a regain.
    const at: Point = [72, 34];
    const ratio = (candidate: boolean, tactics?: [Tactic, Tactic], regain = false) => {
      const sc = scene(ST, at, tactics);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      if (regain) sc.s.lastRegain = { side: 0, at: sc.s.elapsed - 1 };
      const mix = actionMix(sc.s, 0, ST, sc.tags());
      return mix.shot / mix.pass;
    };
    const beyond = 105 - at[0] - K.longShot.from;
    // Revision 4's lines (T481).
    const R4 = K.candidate.revision4;
    expect(ratio(true) / ratio(false)).toBeCloseTo(
      (R4.shotLine.FW * R4.shotScale * Math.exp(-beyond / K.candidate.longShotScale)) /
        (K.shotLine.FW * K.shotScale * Math.exp(-beyond / K.longShot.scale)),
      9,
    );
    const press: [Tactic, Tactic] = ['press', 'balanced'];
    expect(ratio(false, press, true) / ratio(false, press)).toBeCloseTo(
      K.tactic.press.shotAfterRegain,
      9,
    );
    expect(ratio(true, press, true) / ratio(true, press)).toBeCloseTo(
      K.candidate.shotAfterRegain,
      9,
    );
  });

  it('has a runner through on goal shoot first on the candidate model', () => {
    const K = DECISION_CONFIG;
    const bend = (band: number, candidate: boolean) => {
      const sc = scene(ST, centre(band, 2));
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      const mix = (inBehind: boolean) => actionMix(sc.s, 0, ST, { ...sc.tags(), inBehind });
      const [on, off] = [mix(true), mix(false)];
      return {
        carry: on.carry / on.pass / (off.carry / off.pass),
        shot: on.shot / on.pass / (off.shot / off.pass),
      };
    };
    // In front of the box (band 5) shooting is his strongest pull, then carrying on, both ahead
    // of a pass (T324, →MATCH-16: in behind favours a shot).
    const front = K.candidate.inBehind;
    expect(bend(5, true).carry).toBeCloseTo(front.carry / front.pass, 9);
    expect(bend(5, true).shot).toBeCloseTo(front.shot / front.pass, 9);
    expect(bend(5, true).shot).toBeGreaterThan(bend(5, true).carry);
    expect(bend(5, true).carry).toBeGreaterThan(1);
    // In the box and on the pre-feature model the shared bend holds.
    expect(bend(6, true).carry).toBeCloseTo(K.inBehind.carry, 9);
    expect(bend(6, true).shot).toBeCloseTo(K.inBehind.shot, 9);
    expect(bend(5, false).carry).toBeCloseTo(K.inBehind.carry, 9);
    expect(bend(5, false).shot).toBeCloseTo(K.inBehind.shot, 9);
  });

  it('scales take-ons and the pull of a run in behind on the candidate model only (T324)', () => {
    const K = DECISION_CONFIG;
    const at = centre(4, 2);
    const ratio = (candidate: boolean, where: Point = at) => {
      const sc = scene(CM, where);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: REVISION_3 };
      const mix = actionMix(sc.s, 0, CM, sc.tags());
      return mix.takeOn / mix.pass;
    };
    expect(ratio(true) / ratio(false)).toBeCloseTo(K.candidate.takeOnScale, 9);
    // In the box the position profiles' rate holds on both models.
    const box = centre(6, 2);
    expect(ratio(true, box) / ratio(false, box)).toBeCloseTo(1, 9);
    // A teammate running in behind scores the candidate's through-ball pull instead of the shared one.
    const score = (candidate: boolean) => {
      const sc = scene(CM, at);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: REVISION_3 };
      place(sc.s, ST, [70, 34]);
      sc.s.players[0][ST]!.run = { kind: 'behind', until: 610, target: [80, 34] };
      const option = passOptions(sc.s, 0, CM, sc.tags()).find((o) => o.target === ST)!;
      expect(option.kind).toBe('through');
      return option.score;
    };
    const s0 = scene(CM, at).s;
    const runner = s0.players[0][ST]!;
    const key = actionWeight(slotOf(s0, runner).role, runner.player.traits, 'key');
    expect(score(true) - score(false)).toBeCloseTo(
      (K.candidate.through.score - K.pass.through) * key,
      9,
    );
  });

  it('plays a through ball into the runner’s path when the line leaves space behind it (T324)', () => {
    const T = DECISION_CONFIG.candidate.through;
    const sc = scene(CM, [50, 34]);
    const s = sc.s;
    // The opponents' line stands at x = 60, leaving space up to `depth` behind it.
    const line = (x: number) => s.players[1].forEach((gp) => (gp.pos = [x, 6 + 5 * gp.idx]));
    line(60);
    const st = s.players[0][ST]!;
    place(s, ST, [70, 30]);
    st.vel = [7, 0];
    expect(throughPoint(s, 0, CM, ST)).toEqual([70 + T.lead, 30]);
    // Along the way he runs; toward goal while he stands or turns.
    st.vel = [5, 5];
    const along = throughPoint(s, 0, CM, ST);
    expect(along[0]).toBeCloseTo(70 + T.lead / Math.SQRT2, 9);
    expect(along[1]).toBeCloseTo(30 + T.lead / Math.SQRT2, 9);
    for (const vel of [
      [0, 0],
      [-7, 0],
    ] as [number, number][]) {
      st.vel = vel;
      expect(throughPoint(s, 0, CM, ST)).toEqual([70 + T.lead, 30]);
    }
    // A deep line leaves no space behind it: to his feet.
    line(T.depth - T.space + 1);
    expect(throughPoint(s, 0, CM, ST)).toEqual([70, 30]);
    line(60);
    // Never deeper than `depth`, and to his feet once he is past it.
    place(s, ST, [T.depth - 1, 30]);
    expect(throughPoint(s, 0, CM, ST)).toEqual([T.depth, 30]);
    place(s, ST, [T.depth + 2, 30]);
    expect(throughPoint(s, 0, CM, ST)).toEqual([T.depth + 2, 30]);
    // A lead that would not take the ball further from the passer goes to his feet.
    place(s, CM, [T.depth + 6, 30]);
    place(s, ST, [T.depth - 2, 30]);
    expect(throughPoint(s, 0, CM, ST)).toEqual([T.depth - 2, 30]);
    // The other side's frame is mirrored.
    const away = scene(CM, [50, 34]).s;
    away.players[0].forEach((gp) => (gp.pos = [45, 6 + 5 * gp.idx]));
    const runner = away.players[1][ST]!;
    runner.pos = [35, 38];
    runner.vel = [-7, 0];
    away.players[1][CM]!.pos = [55, 34];
    expect(throughPoint(away, 1, CM, ST)).toEqual([35 - T.lead, 38]);
  });

  it('keeps a leading side safer late', () => {
    const at = centre(4, 2);
    const level = mixAt(CM, at, (t) => ({ ...t, lead: 0, minute: 85 }));
    const ahead = mixAt(CM, at, (t) => ({ ...t, lead: 1, minute: 85 }));
    const earlyAhead = mixAt(CM, at, (t) => ({ ...t, lead: 1, minute: 30 }));
    expect(ahead.takeOn).toBeLessThan(level.takeOn);
    // Early on only the lead's shot ease applies, so take-ons keep their ratio to passes.
    expect(earlyAhead.takeOn / earlyAhead.pass).toBeCloseTo(level.takeOn / level.pass, 9);
    const deep = centre(1, 2);
    expect(mixAt(CM, deep, (t) => ({ ...t, lead: 1, minute: 85 })).clearance).toBeGreaterThan(
      mixAt(CM, deep, (t) => ({ ...t, lead: 0, minute: 85 })).clearance,
    );
  });

  it('shoots less when ahead and more when behind, all match long', () => {
    const at = centre(6, 2);
    const shot = (lead: number) => mixAt(ST, at, (t) => ({ ...t, lead, minute: 20 })).shot;
    const most = DECISION_CONFIG.leading.maxLead;
    expect(shot(1)).toBeLessThan(shot(0));
    expect(shot(most)).toBeLessThan(shot(most - 1));
    expect(shot(most + 1)).toBeCloseTo(shot(most), 9);
    expect(shot(-1)).toBeGreaterThan(shot(0));
    expect(shot(-most - 1)).toBeCloseTo(shot(-most), 9);
  });

  it('protects a lead and chases a deficit harder on the candidate model only (T345)', () => {
    const K = DECISION_CONFIG;
    const at = centre(6, 2);
    // Shots against passes for a forward in the box, the score state alone changing (minute 20,
    // so the late game-management weights stay off).
    const ratio = (lead: number, candidate: boolean) => {
      const sc = scene(ST, at);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      const mix = actionMix(sc.s, 0, ST, { ...sc.tags(), lead, minute: 20 });
      return mix.shot / mix.pass;
    };
    const most = K.leading.maxLead;
    for (const [candidate, ahead, behind] of [
      [true, K.candidate.leadingShot, K.candidate.trailingPush],
      [false, K.leading.shot, K.trailing.push],
    ] as const) {
      expect(ratio(1, candidate) / ratio(0, candidate)).toBeCloseTo(ahead, 9);
      expect(ratio(-1, candidate) / ratio(0, candidate)).toBeCloseTo(behind, 9);
      expect(ratio(most + 1, candidate) / ratio(0, candidate)).toBeCloseTo(ahead ** most, 9);
      expect(ratio(-most - 1, candidate) / ratio(0, candidate)).toBeCloseTo(behind ** most, 9);
    }
    // The candidate leans harder both ways than the pre-feature model.
    expect(K.candidate.leadingShot).toBeLessThan(K.leading.shot);
    expect(K.candidate.trailingPush).toBeGreaterThan(K.trailing.push);
  });

  it("passes up weak box shots by their chance's xG on the candidate model only (T370)", () => {
    const Q = DECISION_CONFIG.candidate.shotQuality as { ref: number; power: number; most: number };
    const kept = Q.power;
    // Shots against passes for a forward, with the setting on or switched off (power 0).
    const ratio = (at: Point, on: boolean, candidate = true) => {
      Q.power = on ? kept : 0;
      try {
        const sc = scene(ST, at);
        if (candidate) sc.s.setup = { ...sc.s.setup, model: REVISION_3 };
        const mix = actionMix(sc.s, 0, ST, { ...sc.tags(), minute: 20 });
        return mix.shot / mix.pass;
      } finally {
        Q.power = kept;
      }
    };
    const factor = (at: Point) => ratio(at, true) / ratio(at, false);
    for (const at of [centre(6, 2), centre(6, 1), centre(7, 2)]) {
      const sc = scene(ST, at);
      sc.s.setup = { ...sc.s.setup, model: REVISION_3 };
      const xg = chanceXg(at, { pressure: sc.tags().pressure, candidate: true }, sc.s.math);
      expect(factor(at)).toBeCloseTo(Math.min(Q.most, (xg / Q.ref) ** Q.power), 9);
      expect(ratio(at, true, false)).toBeCloseTo(ratio(at, false, false), 12);
    }
    // A weak angle loses more of its shots than the spot, a big chance keeps its weight and
    // outside the box nothing changes.
    expect(factor(centre(6, 1))).toBeLessThan(factor(centre(6, 2)));
    expect(factor(centre(6, 2))).toBeLessThan(1);
    expect(factor(centre(7, 2))).toBeLessThanOrEqual(Q.most + 1e-12);
    expect(factor(centre(5, 2))).toBeCloseTo(1, 12);
  });

  /** Runs `body` with candidate settings set as given, then puts them back. */
  const withCandidate = <T>(set: Record<string, unknown>, body: () => T): T => {
    const C = DECISION_CONFIG.candidate as Record<string, unknown>;
    const kept = Object.fromEntries(Object.keys(set).map((k) => [k, C[k]]));
    Object.assign(C, set);
    try {
      return body();
    } finally {
      Object.assign(C, kept);
    }
  };

  it('pulls a through ball to a runner still level with the line more than to a man past it, on the candidate model only (T397)', () => {
    const at = centre(4, 2);
    // A runner in behind at `x`, the opponents' outfield line at 80 m, their keeper behind it.
    const pull = (x: number, candidate: boolean, past: { prior: number; through: number }) =>
      withCandidate({ past }, () => {
        const sc = scene(CM, at);
        if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
        for (const gp of sc.s.players[1].slice(1, 11)) gp.pos = [80, gp.pos[1]];
        place(sc.s, ST, [x, 34]);
        sc.s.players[0][ST]!.run = { kind: 'behind', until: 610, target: [90, 34] };
        return passOptions(sc.s, 0, CM, sc.tags()).find((o) => o.target === ST)!;
      });
    const off = { prior: 1, through: 1 };
    const on = { prior: 0.5, through: 0.25 };
    // Level with the line: the full pull either way. Past it: the pull and the prior scaled.
    expect(pull(79, true, on).score).toBeCloseTo(pull(79, true, off).score, 12);
    const beyond = pull(84, true, on),
      neutral = pull(84, true, off);
    expect(beyond.prior / neutral.prior).toBeCloseTo(0.5, 12);
    expect(beyond.score).toBeLessThan(neutral.score);
    // The pre-feature model ignores the setting.
    expect(pull(84, false, on).score).toBeCloseTo(pull(84, false, off).score, 12);
  });

  it("weighs a receiver's first touch, a cut-back and a carry into the box on the candidate model only (T397)", () => {
    // First touch: facing play, unpressured, below the box band.
    const firstTouch = (candidate: boolean, carry: number, received: boolean) =>
      withCandidate({ firstTouch: { carry, pressure: 1 } }, () => {
        const sc = scene(CM, centre(3, 2));
        if (candidate) sc.s.setup = { ...sc.s.setup, model: REVISION_3 };
        if (received) sc.s.received = [0, CM];
        const tags = { ...sc.tags(), orientation: 'facing' as const, pressure: 0 };
        const mix = actionMix(sc.s, 0, CM, tags);
        return mix.carry / mix.pass;
      });
    expect(firstTouch(true, 3, true) / firstTouch(true, 1, true)).toBeCloseTo(3, 9);
    expect(firstTouch(true, 3, false)).toBeCloseTo(firstTouch(true, 1, false), 12);
    expect(firstTouch(false, 3, true)).toBeCloseTo(firstTouch(false, 1, true), 12);
    // Cut-back share: of a cut-back zone's crosses, the candidate's share is played back (with a
    // runner for each, T444: the other forward on the near post, a box-to-box midfielder on the spot).
    const cutBack = (candidate: boolean, share: number) =>
      withCandidate({ cutBackShare: share }, () => {
        const sc = scene(ST, centre(7, 1));
        if (candidate) sc.s.setup = { ...sc.s.setup, model: REVISION_3 };
        place(sc.s, 10, [97, 33]);
        place(sc.s, 7, [92, 34]);
        const mix = actionMix(sc.s, 0, ST, sc.tags());
        return mix.cutBack / (mix.cutBack + mix.cross);
      });
    expect(cutBack(true, 0.5)).toBeCloseTo(0.5, 12);
    expect(cutBack(false, 0.5)).toBeCloseTo(DECISION_CONFIG.cutBackShare, 12);
    // A carry from in front of the box ends in it less often with the penalty.
    const intoBox = (penalty: number) =>
      withCandidate({ boxCarry: penalty }, () => {
        const sc = scene(CM, [86, 34]);
        sc.s.setup = { ...sc.s.setup, model: REVISION_3 };
        const r = random('t397-carry');
        let n = 0;
        for (let i = 0; i < 400; i++) {
          const end = chooseCarry(sc.s, 0, CM, sc.tags(), r);
          if (end[0] >= 105 - 16.5 && Math.abs(end[1] - 34) <= 20.16) n++;
        }
        return n;
      });
    expect(intoBox(20)).toBeLessThan(intoBox(0));
    // The weight of a pass's xT gain in the pass choice: the score is linear in it.
    const forward = (gain: number) =>
      withCandidate({ gain }, () => {
        const sc = scene(CM, centre(4, 2));
        sc.s.setup = { ...sc.s.setup, model: REVISION_3 };
        place(sc.s, ST, [85, 34]);
        return passOptions(sc.s, 0, CM, sc.tags()).find((o) => o.target === ST)!.score;
      });
    expect(forward(1) - forward(0.5)).toBeCloseTo((forward(1) - forward(0)) / 2, 9);
    expect(forward(1)).toBeGreaterThan(forward(0));
  });

  it('ends a long spell around the box sooner, on the candidate model only (T411)', () => {
    const patience = { seconds: 30, pass: 0.5, shot: 2, cross: 2 };
    const ratio = (candidate: boolean, held: number, set: typeof patience) =>
      withCandidate({ patience: set }, () => {
        const sc = scene(CM, centre(5, 2));
        if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
        sc.s.possessionSince = sc.s.elapsed - held;
        const mix = actionMix(sc.s, 0, CM, sc.tags());
        return mix.pass / mix.shot;
      });
    const neutral = { seconds: 30, pass: 1, shot: 1, cross: 1 };
    // Past the patience: passes halved against shots doubled.
    expect(ratio(true, 40, patience) / ratio(true, 40, neutral)).toBeCloseTo(0.25, 9);
    // Within it, and on the pre-feature model, no change.
    expect(ratio(true, 10, patience)).toBeCloseTo(ratio(true, 10, neutral), 12);
    expect(ratio(false, 40, patience)).toBeCloseTo(ratio(false, 40, neutral), 12);
  });

  it('a cross goes to a zone a teammate attacks (T444)', () => {
    // The left wing-back wide in the final third (3-5-2): the strikers short of the posts, the
    // box-to-box midfielder short of the spot and the mezzala short of the edge.
    const attack = (candidate: boolean) => {
      const sc = scene(1, [92, 6]);
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      place(sc.s, 9, [96, 32]);
      place(sc.s, 10, [97, 40]);
      place(sc.s, 7, [90, 34]);
      place(sc.s, 8, [82, 34]);
      return sc;
    };
    const sc = attack(true);
    const { runners } = boxScene(sc.s, 0)!;
    expect(runners).toEqual({ nearPost: 9, farPost: 10, spot: 7, edge: 8 });
    const tags = sc.tags();
    const r = random('t444-cross');
    const zones = new Set<string>();
    let crosses = 0;
    for (let i = 0; i < 4000; i++) {
      const d = decide(sc.s, 0, 1, tags, r);
      if (d.action !== 'cross' && d.action !== 'cutBack') continue;
      // No cut-back short of the cut-back zones: a cross, into a zone, to the runner attacking it.
      expect(d.action).toBe('cross');
      crosses++;
      const { zone, kind } = d.delivery!;
      expect(d.target).toBe(runners[zone]);
      expect(BOX_CONFIG.delivery.kinds[zone]).toContain(kind);
      expect(DELIVERY_ACTION[kind]).toBe('cross');
      zones.add(zone);
    }
    expect(crosses).toBeGreaterThan(100);
    // Driven to the near post or lofted to the far post; nothing squared short of the byline.
    expect([...zones].sort()).toEqual(['farPost', 'nearPost']);
    // The pre-feature model still plays it to a teammate in the box, aiming at no zone.
    const old = attack(false);
    const r2 = random('t444-cross');
    for (let i = 0; i < 1000; i++) {
      const d = decide(old.s, 0, 1, old.tags(), r2);
      if (d.action === 'cross') expect(d.delivery).toBeUndefined();
    }
  });

  it('no cross or cut-back with nobody attacking a zone (T444)', () => {
    // A striker in a cut-back zone with nobody of his side near the box.
    const lone = (candidate: boolean) => {
      const sc = scene(ST, centre(7, 1));
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      return sc;
    };
    const pre = lone(false);
    const before = actionMix(pre.s, 0, ST, pre.tags());
    expect(before.cross).toBeGreaterThan(0);
    expect(before.cutBack).toBeGreaterThan(0);
    const sc = lone(true);
    expect(boxScene(sc.s, 0)!.runners).toEqual({});
    const mix = actionMix(sc.s, 0, ST, sc.tags());
    expect(mix.cross).toBe(0);
    expect(mix.cutBack).toBe(0);
    // He carries, passes or shoots by the rest of the table.
    expect(ACTIONS.reduce((sum, a) => sum + mix[a], 0)).toBeCloseTo(1, 9);
    expect(mix.shot).toBeGreaterThan(0);
    const r = random('t444-blind');
    const tags = sc.tags();
    for (let i = 0; i < 2000; i++)
      expect(['cross', 'cutBack']).not.toContain(decide(sc.s, 0, ST, tags, r).action);
    // One zone attacked: the other forward on the near post lets him cross but not cut back, a
    // midfielder on the spot the other way round.
    const withRunner = (idx: number, p: Point) => {
      const x = lone(true);
      place(x.s, idx, p);
      return actionMix(x.s, 0, ST, x.tags());
    };
    const nearPost = withRunner(10, [97, 33]);
    expect(nearPost.cross).toBeGreaterThan(0);
    expect(nearPost.cutBack).toBe(0);
    const spot = withRunner(7, [92, 34]);
    expect(spot.cross).toBe(0);
    expect(spot.cutBack).toBeGreaterThan(0);
  });

  it('a delivery whose path is cleanly reached is chosen less often (T446)', () => {
    // T444's wing-back wide in the final third, his strikers attacking the posts.
    const wide = (blocked: boolean) => {
      const sc = scene(1, [92, 6]);
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      place(sc.s, 9, [96, 32]);
      place(sc.s, 10, [97, 40]);
      const { ball } = boxScene(sc.s, 0)!;
      const zone = deliveryPoint(0, { zone: 'nearPost', kind: 'near', ball });
      // Side 1's man standing midway along the ground to the near post.
      if (blocked) sc.s.players[1][3]!.pos = [(92 + zone[0]) / 2, (6 + zone[1]) / 2];
      return sc;
    };
    const share = (blocked: boolean) => {
      const sc = wide(blocked);
      const tags = sc.tags();
      const r = random('t446-risk');
      let near = 0;
      for (let i = 0; i < 4000; i++)
        if (chooseDelivery(sc.s, 0, 1, tags, 'cross', r)?.zone === 'nearPost') near++;
      return near / 4000;
    };
    const open = deliveries(wide(false).s, 0, 1);
    expect(open.map((d) => [d.kind, d.reach, d.cut])).toEqual([
      ['near', 0, false],
      ['far', 0, false],
    ]);
    const shut = deliveries(wide(true).s, 0, 1);
    const near = shut.find((d) => d.kind === 'near')!;
    expect(near.cut).toBe(true);
    expect(near.reach).toBe(1);
    // The lofted ball to the far post flies over him.
    expect(shut.find((d) => d.kind === 'far')).toMatchObject({ reach: 0, cut: false });
    expect(near.score).toBeCloseTo(open.find((d) => d.kind === 'near')!.score, 12);
    const before = share(false),
      after = share(true);
    expect(before).toBeGreaterThan(0.2);
    expect(after).toBeLessThan(before * 0.75);
    // With no risk the choice reads his scores only, as before.
    const risk = BOX_CONFIG.delivery.risk;
    try {
      (BOX_CONFIG.delivery as { risk: number }).risk = 0;
      expect(share(true)).toBeCloseTo(before, 1);
    } finally {
      (BOX_CONFIG.delivery as { risk: number }).risk = risk;
    }
  });

  it('no delivery when every option is cleanly reached (T446)', () => {
    // T444's striker in a cut-back zone, the other forward attacking the near post.
    const lone = (blocked: boolean, far: boolean) => {
      const sc = scene(ST, centre(7, 1));
      sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
      place(sc.s, 10, [97, 33]);
      if (far) place(sc.s, 8, [97, 41]);
      const { ball } = boxScene(sc.s, 0)!;
      const zone = deliveryPoint(0, { zone: 'nearPost', kind: 'near', ball });
      const c = sc.s.players[0][ST]!.pos;
      if (blocked) sc.s.players[1][3]!.pos = [(c[0] + zone[0]) / 2, (c[1] + zone[1]) / 2];
      return sc;
    };
    const open = lone(false, false);
    expect(boxScene(open.s, 0)!.runners).toEqual({ nearPost: 10 });
    expect(actionMix(open.s, 0, ST, open.tags()).cross).toBeGreaterThan(0);
    // The only ball, along the ground to the near post, is cut out: he does not cross blind.
    const sc = lone(true, false);
    expect(deliveries(sc.s, 0, ST)).toMatchObject([{ kind: 'near', cut: true }]);
    const tags = sc.tags();
    const mix = actionMix(sc.s, 0, ST, tags);
    expect(mix.cross).toBe(0);
    expect(ACTIONS.reduce((sum, a) => sum + mix[a], 0)).toBeCloseTo(1, 9);
    expect(chooseDelivery(sc.s, 0, ST, tags, 'cross', random('t446-none'))).toBeUndefined();
    const r = random('t446-cut');
    for (let i = 0; i < 2000; i++) expect(decide(sc.s, 0, ST, tags, r).action).not.toBe('cross');
    // A man attacking the far post too: the lofted ball over the crowd is on again.
    const both = lone(true, true);
    expect(boxScene(both.s, 0)!.runners).toMatchObject({ nearPost: 10, farPost: 8 });
    expect(actionMix(both.s, 0, ST, both.tags()).cross).toBeGreaterThan(0);
  });

  it('weighs a forward pass into the final third and stretches a carry outside the box, on the candidate model only (T408)', () => {
    const neutral = { from: 70, lateral: 1, back: 1, entry: 1, carry: 1, pass: 1 };
    // A forward pass from the middle band to a man past 70 m: its prior scaled by `entry`.
    const entry = (candidate: boolean, value: number) =>
      withCandidate({ finalThird: { ...neutral, entry: value } }, () => {
        const sc = scene(CM, centre(4, 2));
        if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
        place(sc.s, ST, [80, 34]);
        return passOptions(sc.s, 0, CM, sc.tags()).find((o) => o.target === ST)!.prior;
      });
    expect(entry(true, 0.2) / entry(true, 1)).toBeCloseTo(0.2, 12);
    expect(entry(false, 0.2)).toBeCloseTo(entry(false, 1), 12);
    // A carry from the middle of the pitch: the same draws, `carry` times as far.
    const carried = (candidate: boolean, value: number) =>
      withCandidate({ finalThird: { ...neutral, carry: value } }, () => {
        const sc = scene(CM, [50, 34]);
        if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
        const end = chooseCarry(sc.s, 0, CM, sc.tags(), random('t408-carry'));
        return Math.hypot(end[0] - 50, end[1] - 34);
      });
    expect(carried(true, 1.5) / carried(true, 1)).toBeCloseTo(1.5, 9);
    expect(carried(false, 1.5)).toBeCloseTo(carried(false, 1), 12);
  });

  it('distributes short more often as a sweeper keeper than a shot stopper', () => {
    const share = (tactic: Tactic) => {
      const kit = gridKit([tactic, 'balanced'], undefined, DISABLED_RELEASE);
      kit.state.owner = [0, 0];
      const r = random(`keeper-${tactic}`);
      let short = 0;
      for (let i = 0; i < 5000; i++)
        if (keeperDistribution(kit.state, 0, r).kind === 'short') short++;
      return short / 5000;
    };
    expect(share('possession')).toBeGreaterThan(share('balanced') + 0.1);
  });

  it('carries toward goal when open and always returns a point on the pitch', () => {
    const sc = scene(CM, [30, 34]);
    const r = random('carry');
    let forward = 0;
    for (let i = 0; i < 500; i++) {
      const [x, y] = chooseCarry(sc.s, 0, CM, sc.tags(), r);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(105);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(68);
      if (x > 30) forward++;
    }
    expect(forward).toBeGreaterThan(250);
  });

  it("consumes teammates' showing and overlap intentions", () => {
    const RWB = 5;
    const sc = scene(CM, [60, 40]);
    const { s } = sc;
    place(s, 8, [66, 36]);
    place(s, RWB, [52, 60]);
    const scoreOf = (target: number) =>
      passOptions(s, 0, CM, sc.tags()).find((o) => o.target === target)!.score;
    const before = { mix: actionMix(s, 0, CM, sc.tags()), show: scoreOf(8), wide: scoreOf(RWB) };
    const K = DECISION_CONFIG.combination;
    // A teammate showing for him scores more as a receiver; a clearance does not.
    s.players[0][8]!.intention = {
      kind: 'support',
      support: 'show',
      priority: 'tactical',
      target: [66, 36],
      teammate: CM,
      since: 600,
      until: 605,
    };
    expect(scoreOf(8)).toBeCloseTo(before.show + K.show, 9);
    s.players[0][8]!.intention!.support = 'open';
    expect(scoreOf(8)).toBeCloseTo(before.show, 9);
    // An overlap still arriving behind him: he carries more often while it comes, unpressured.
    s.players[0][RWB]!.intention = {
      kind: 'run',
      run: 'overlap',
      priority: 'tactical',
      target: [72, 62],
      teammate: CM,
      since: 600,
      until: 605,
    };
    const waiting = actionMix(s, 0, CM, sc.tags());
    expect(sc.tags().pressure).toBe(0);
    expect(waiting.carry).toBeGreaterThan(before.mix.carry);
    expect(waiting.carry / waiting.pass).toBeCloseTo(
      (K.wait * before.mix.carry) / before.mix.pass,
      9,
    );
    expect(scoreOf(RWB)).toBeCloseTo(before.wide, 9);
    // Level with him or ahead, the overlap is released: the pass to it scores more, the wait is over.
    place(s, RWB, [64, 60]);
    const level = scoreOf(RWB);
    s.players[0][RWB]!.intention = undefined;
    const plainLevel = scoreOf(RWB);
    expect(level).toBeCloseTo(plainLevel + K.release, 9);
    expect(actionMix(s, 0, CM, sc.tags())).toEqual(before.mix);
    // A combination with another carrier bends nothing for this one.
    s.players[0][RWB]!.intention = {
      kind: 'run',
      run: 'overlap',
      priority: 'tactical',
      target: [72, 62],
      teammate: 6,
      since: 600,
      until: 605,
    };
    expect(scoreOf(RWB)).toBeCloseTo(plainLevel, 9);
  });
});

describe('revision 4 shot choice (T481, →MATCH-16)', () => {
  const [, , third, fourth] = MATCH_MODEL_REVISIONS;
  // 3-5-2: a cover defender, a box-to-box midfielder and a target man (shot ×1.1): no role here
  // lowers the shot weight.
  const CB = 3;
  /** The action mix of a neutral carrier (no traits, every attribute 60) alone at `at` on `model`. */
  const mixOn = (
    slot: number,
    at: Point,
    model: MatchModelRevision,
    tactics?: [Tactic, Tactic],
  ) => {
    const sc = scene(slot, at, tactics);
    sc.s.setup = { ...sc.s.setup, model };
    sc.me.player.traits = [];
    setSkills(sc.s, slot, Object.fromEntries(ATTRIBUTES.map((a) => [a, 60])));
    return actionMix(sc.s, 0, slot, sc.tags());
  };

  it('revision 4: in the same unpressured clear chance a forward shoots at least as often as a midfielder and a midfielder as a defender in every attacking cell', () => {
    let shooting = 0;
    for (let band = 4; band <= 7; band++)
      for (let lane = 0; lane <= 4; lane++) {
        const at = centre(band, lane);
        const [fw, mf, df] = [ST, CM, CB].map((slot) => mixOn(slot, at, fourth).shot);
        expect(fw, `band ${band} lane ${lane}`).toBeGreaterThanOrEqual(mf! - 1e-12);
        expect(mf, `band ${band} lane ${lane}`).toBeGreaterThanOrEqual(df! - 1e-12);
        if (df! > 0) shooting++;
      }
    expect(shooting).toBeGreaterThan(10);
    // Revision 3 inverted it: a forward in the central box shot a fraction of a midfielder's share.
    expect(mixOn(ST, centre(6, 2), third).shot).toBeLessThan(
      mixOn(CM, centre(6, 2), third).shot / 5,
    );
  });

  it('revision 4: an unmarked forward takes his goal-area chance far more often than on revision 3 (T482)', () => {
    const at = centre(7, 2);
    const [now, before] = [fourth, third].map((model) => mixOn(ST, at, model).shot);
    expect(now).toBeGreaterThan(0.5);
    expect(now).toBeGreaterThan(2 * before!);
  });

  it('revision 4: a playmaker role shoots less than a box-to-box midfielder in the same chance', () => {
    // 4-3-3: the mezzala (6) and the deep-lying playmaker (7) differ only in that.
    const tactics: [Tactic, Tactic] = ['possession', 'balanced'];
    const at = centre(6, 2);
    const [mezzala, playmaker] = [6, 7].map((slot) => mixOn(slot, at, fourth, tactics));
    expect(playmaker!.shot).toBeLessThan(mezzala!.shot);
    // Against revision 3, the playmaker's shot weight alone moves, by `playmakerShot`.
    const [m3, p3] = [6, 7].map((slot) => mixOn(slot, at, third, tactics));
    const odds = (m: typeof mezzala) => m!.shot / m!.pass;
    expect(odds(playmaker) / odds(mezzala) / (odds(p3) / odds(m3))).toBeCloseTo(
      DECISION_CONFIG.candidate.revision4.playmakerShot,
      9,
    );
  });

  it('revision 3 keeps the old line weights', () => {
    const C = DECISION_CONFIG.candidate;
    for (const [slot, line] of [
      [ST, 'FW'],
      [CM, 'MF'],
      [CB, 'DF'],
    ] as const) {
      // In front of the box, where neither revision's chance quality applies.
      const [old, now] = [third, fourth].map((model) => mixOn(slot, centre(5, 2), model));
      // Only the shot weight differs, by exactly the lines' weights and scales.
      expect(old!.carry / old!.pass).toBeCloseTo(now!.carry / now!.pass, 12);
      expect(old!.shot / old!.pass / (now!.shot / now!.pass)).toBeCloseTo(
        (C.shotLine[line] * C.shotScale) / (C.revision4.shotLine[line] * C.revision4.shotScale),
        9,
      );
    }
  });
});
