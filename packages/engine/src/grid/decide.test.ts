import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { ATTRIBUTES, type PlayTrait } from '../../../contracts/src/player';
import { actionWeight } from '../match';
import { random } from '../primitives';
import { CELL_BASELINES } from './baselines';
import {
  actionMix,
  ACTIONS,
  chooseCarry,
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
import { enterSlot, slotOf } from './state';
import { computeTags, type Tags } from './tags';
import { gridKit } from './testkit';
import type { Tactic } from '../../../contracts/src/types';

const CM = 7;
const ST = 9;

/** A side-0 carrier at `at`; everyone else parked far away unless a test places them. */
function scene(slot: number, at: Point, tactics: [Tactic, Tactic] = ['balanced', 'balanced']) {
  const kit = gridKit(tactics);
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
      expect(passing(true)).toBeCloseTo(R.pass, 9);
      expect(passing(true, D.seconds + 1)).toBeCloseTo(R.pass, 9);
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
          const long = o.kind === 'long' || o.kind === 'switch' ? R.long : 0;
          expect(o.score - flat.score).toBeCloseTo(
            (o.direction === 'forward' ? R.forward : 0) + long,
            9,
          );
          const prior = o.direction === 'back' ? R.back : o.direction === 'lateral' ? R.lateral : 1;
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
    // he takes and the candidate's volume scale against the midfield line's and the shared scale
    // (T321, T324).
    expect(K.candidate.shotPosition.AM).toBe('FW');
    expect(ratio(true) / ratio(false)).toBeCloseTo(
      (K.candidate.shotLine.FW * K.candidate.shotScale) / (K.shotLine.MF * K.shotScale),
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
    expect(ratio(true) / ratio(false)).toBeCloseTo(
      (K.candidate.shotLine.FW *
        K.candidate.shotScale *
        Math.exp(-beyond / K.candidate.longShotScale)) /
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
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
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
      if (candidate) sc.s.setup = { ...sc.s.setup, model: MATCH_MODEL_REVISION };
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

  it('distributes short more often as a sweeper keeper than a shot stopper', () => {
    const share = (tactic: Tactic) => {
      const kit = gridKit([tactic, 'balanced']);
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
