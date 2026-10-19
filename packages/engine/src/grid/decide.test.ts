import { describe, expect, it } from 'vitest';
import { ATTRIBUTES, type PlayTrait } from '../../../contracts/src/player';
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
  type Action,
} from './decide';
import { BAND_EDGES, LANE_EDGES, type Point } from './pitch';
import { enterSlot } from './state';
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

  it('keeps a leading side safer late', () => {
    const at = centre(4, 2);
    const level = mixAt(CM, at, (t) => ({ ...t, lead: 0, minute: 85 }));
    const ahead = mixAt(CM, at, (t) => ({ ...t, lead: 1, minute: 85 }));
    const earlyAhead = mixAt(CM, at, (t) => ({ ...t, lead: 1, minute: 30 }));
    expect(ahead.takeOn).toBeLessThan(level.takeOn);
    expect(earlyAhead.takeOn).toBeCloseTo(level.takeOn, 9);
    const deep = centre(1, 2);
    expect(mixAt(CM, deep, (t) => ({ ...t, lead: 1, minute: 85 })).clearance).toBeGreaterThan(
      mixAt(CM, deep, (t) => ({ ...t, lead: 0, minute: 85 })).clearance,
    );
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
});
