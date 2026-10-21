/** What the player on the ball does and where he plays it: the real-data mix of his cell, bent by role, traits, tactic, tags, score and head (→MATCH-8, MATCH-16). */
import type { Position } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { lineOf } from '../player';
import { actionWeight } from '../match';
import { CELL_BASELINES, OVERALL_PROFILE, POSITION_PROFILES, profileKey } from './baselines';
import {
  attackFrame,
  cellBand,
  cellLane,
  cellOf,
  clamp,
  goalDistance,
  inBox,
  PITCH,
  type Point,
} from './pitch';
import { offsideLine } from './shape';
import { onPitch, other, skill, slotOf, type GridPlayer, type GridState } from './state';
import { TAG_CONFIG, type Tags } from './tags';

export type Action =
  'pass' | 'cross' | 'cutBack' | 'carry' | 'takeOn' | 'shot' | 'holdUp' | 'clearance';
export const ACTIONS: readonly Action[] = [
  'pass',
  'cross',
  'cutBack',
  'carry',
  'takeOn',
  'shot',
  'holdUp',
  'clearance',
];

export interface Decision {
  action: Action;
  /** Roster index of the receiver. */
  target?: number;
  /** Where a carry ends, in the engine frame. */
  point?: [number, number];
  kind?: 'short' | 'long' | 'switch' | 'through';
  lineBreaking?: boolean;
}

/** Initial values (design §6); T215 and T216 tune them. The style bends `pass` and `lineHigh`/`lineLow` are applied by T209 and T206. */
export const DECISION_CONFIG = {
  holdUp: { base: 0.03, backToGoal: 0.15 },
  cutBackShare: 0.1,
  takeOnPerPass: 0.075,
  crossShare: 0.025,
  factorRange: [0.2, 3],
  shotLine: { GK: 0, DF: 1, MF: 3.8, FW: 0.9 },
  /** Global shot-volume scale; the first uncalibrated engine produced about 25 shots a side (T215 settles it). */
  shotScale: 0.19,
  /** Global open-play cross scale: the cells' own cross shares gave under one cross a side (T215 settles it). */
  crossScale: 7.2,
  /** Extra shot weight in the box band, so a carrier shoots there instead of carrying into the goal area (T215). */
  shotBox: 0.42,
  /** Beyond `from` metres from goal a shot's weight falls by e per `scale` metres: a cell's shots come from its near end (T215). */
  longShot: { from: 28, scale: 6 },
  tactic: {
    possession: { pass: 1.1, takeOn: 0.9, shotBand5: 0.8 },
    counter: { shotInCounter: 1.1 },
    press: { shotAfterRegain: 1.2, regainSeconds: 6 },
    balanced: {},
  } satisfies Record<Tactic, object>,
  pressure: { carry: 0.6, takeOn: 1.3, takeOnDribbling: 65, clearance: 2 },
  backToGoal: { takeOn: 0.5, shot: 0.3 },
  inBehind: { shot: 0.8, carry: 1.3 },
  pocket: { takeOn: 1.2, shotBand5: 1.6 },
  /** `shot`: a leading side's shot weight per goal ahead, up to `maxLead` goals, all match long (T216). */
  leading: { minute: 75, takeOn: 0.8, clearance: 1.3, shot: 0.6, maxLead: 3 },
  /** `push`: a trailing side's shot weight per goal behind, up to `leading.maxLead` goals, all match long (T216). */
  trailing: { minute: 70, shot: 1.2, cross: 1.2, push: 1.4 },
  lowXg: 0.05,
  highXg: 0.12,
  pass: {
    reach: 60,
    reachLong: 70,
    open: 0.8,
    risk: 0.6,
    tooFar: 15,
    through: 0.8,
    long: 30,
    switch: 30,
    tau: { scale: 1, decisions: 80, composure: 150, range: [0.4, 2.5] },
    backBias: 3,
    /** Weight of backward options in every pass choice; the threat gain alone kept back passes near 9% (T215). */
    backPrior: 2.2,
  },
  /** `boxLength`: a carry that starts in the box is a step or two, not a run into the goal area (T215). */
  carry: {
    headings: [0, -30, 30, -90, 90],
    length: [6, 6],
    boxLength: [3, 3],
    pressure: 0.5,
    margin: 0.5,
  },
  keeper: { sweeper: 0.7, stopper: 0.45, press: 0.15, longRisk: 0.5 },
  /**
   * Candidate model only (→MATCH-16, MATCH-17): teammates' intentions bend the carrier's choice. A
   * teammate showing for him scores `show` more; an overlap combining with him scores `release` more
   * once it is level with him or ahead, and until then an unpressured carrier carries `wait` times
   * as often while it arrives.
   */
  combination: { show: 0.6, release: 0.9, wait: 1.5 },
  /**
   * Candidate model only (T278, →MATCH-23): the open-play cross scale, the box band's shot weight
   * and the lines' shot weights in place of `crossScale`, `shotBox` and `shotLine`, against too many
   * crosses, headed goals, goal-area shots and forwards' goals and too few defenders' goals. T321
   * gave the shadow striker his own weight and raised the midfield line's and lowered the forwards'
   * so the lines' shares of goals hold.
   */
  candidate: {
    crossScale: 6.3,
    shotBox: 0.52,
    shotLine: { GK: 0, DF: 1.2, MF: 6.5, FW: 0.66 },
    /**
     * Positions whose shot weight replaces their line's (T321, →MATCH-16): a 4-2-3-1 shadow
     * striker lives in the box like a forward, so the midfield line's weight made him take most
     * of press's shots.
     */
    shotPosition: { AM: 1.5 } as Partial<Record<Position, number>>,
    /**
     * In behind the line in a central lane in front of the box (band 5), in place of `inBehind`
     * (T321, →MATCH-16: in behind favours a shot): a runner through on goal carries on toward it
     * instead of passing, so a through ball behind a high line becomes a chance. In the box the
     * shared `inBehind` holds.
     */
    inBehind: { shot: 1.3, carry: 3, pass: 0.5 },
    /** The global shot-volume scale, in place of `shotScale` (T321). */
    shotScale: 0.215,
  },
  /**
   * Candidate model only (→MATCH-8, T278): within `seconds` of a regain a listed side plays forward,
   * scoring a forward pass `forward` more and a back pass `back` times as often. T321 lengthened
   * and strengthened counter's break (8 s and 1.5 before).
   */
  direct: {
    seconds: 12,
    forward: { counter: 3 } as Partial<Record<Tactic, number>>,
    back: 0.5,
  },
} as const;

const DEG = Math.PI / 180;

/** The normalised action mix of the carrier. */
export function actionMix(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
): Record<Action, number> {
  const C = DECISION_CONFIG;
  const me = s.players[side][idx]!;
  const slot = slotOf(s, me);
  const cell = CELL_BASELINES[tags.cell]!;
  const line = lineOf(slot.position);
  const c = attackFrame(side, me.pos);
  const traits = me.player.traits;
  const tactic = s.setup.tactics[side];
  const bend = s.setup.bends[side];
  const oppBend = s.setup.bends[other(side)];
  const inCutBack = tags.band === 7 && (tags.lane === 1 || tags.lane === 3);
  const mix: Record<Action, number> = {
    pass: cell.pass * (1 - cell.crossOfPasses),
    cross: cell.pass * cell.crossOfPasses,
    cutBack: 0,
    carry: cell.carry,
    takeOn: cell.takeOn,
    shot: cell.shot,
    holdUp:
      (line === 'FW' || slot.position === 'AM') &&
      tags.lane >= 1 &&
      tags.lane <= 3 &&
      tags.orientation === 'backToGoal'
        ? C.holdUp.backToGoal
        : C.holdUp.base,
    clearance: cell.clearance,
  };
  if (inCutBack) {
    mix.cutBack = C.cutBackShare * mix.cross;
    mix.cross *= 1 - C.cutBackShare;
  }
  // The position's habits against the league's overall.
  const profile = POSITION_PROFILES[profileKey(slot.position)];
  mix.takeOn *= clamp(profile.takeOnPerPass / C.takeOnPerPass, C.factorRange[0], C.factorRange[1]);
  const candidate = s.setup.model !== undefined;
  const crossFactor =
    clamp(profile.crossShare / C.crossShare, C.factorRange[0], C.factorRange[1]) *
    (candidate ? C.candidate.crossScale : C.crossScale);
  mix.cross *= crossFactor;
  mix.cutBack *= crossFactor;
  mix.shot *=
    (candidate
      ? (C.candidate.shotPosition[slot.position] ?? C.candidate.shotLine[line])
      : C.shotLine[line]) *
    (candidate ? C.candidate.shotScale : C.shotScale) *
    (tags.band === 6 ? (candidate ? C.candidate.shotBox : C.shotBox) : 1) *
    Math.exp(-Math.max(0, goalDistance(c) - C.longShot.from) / C.longShot.scale);
  // Role and traits.
  mix.shot *= actionWeight(slot.role, traits, 'shot');
  mix.takeOn *= actionWeight(slot.role, traits, 'dribble');
  mix.cross *= actionWeight(slot.role, traits, 'cross');
  mix.cutBack *= actionWeight(slot.role, traits, 'cross');
  mix.holdUp *= actionWeight(slot.role, traits, 'hold');
  if (!inBox(c)) mix.shot *= actionWeight(slot.role, traits, 'long');
  // The tactic and its style bends.
  if (tactic === 'possession') {
    mix.pass *= C.tactic.possession.pass;
    mix.takeOn *= C.tactic.possession.takeOn;
    if (tags.band === 5) mix.shot *= C.tactic.possession.shotBand5;
  }
  if (tactic === 'counter' && tags.phase === 'counter') mix.shot *= C.tactic.counter.shotInCounter;
  if (
    tactic === 'press' &&
    s.lastRegain?.side === side &&
    s.elapsed - s.lastRegain.at <= C.tactic.press.regainSeconds &&
    tags.band >= 5
  )
    mix.shot *= C.tactic.press.shotAfterRegain;
  mix.pass *= 1 + bend.possession / 50;
  mix.carry *= 1 - bend.possession / 100;
  mix.shot *= (1 + bend.shot / 20) * (1 - oppBend.defense / 20);
  // The situation.
  if (tags.pressure >= 1) {
    mix.carry *= C.pressure.carry;
    if (skill(s, side, idx, 'dribbling') >= C.pressure.takeOnDribbling)
      mix.takeOn *= C.pressure.takeOn;
    if (tags.band <= 2) mix.clearance *= C.pressure.clearance;
  }
  if (tags.orientation === 'backToGoal') {
    mix.takeOn *= C.backToGoal.takeOn;
    mix.shot *= C.backToGoal.shot;
  }
  if (tags.inBehind && tags.band >= 5 && tags.lane >= 1 && tags.lane <= 3) {
    const through = candidate && tags.band === 5;
    const behind = through ? C.candidate.inBehind : C.inBehind;
    mix.shot *= behind.shot;
    mix.carry *= behind.carry;
    if (through) mix.pass *= C.candidate.inBehind.pass;
  }
  if (tags.pocket) {
    mix.takeOn *= C.pocket.takeOn;
    if (tags.band === 5) mix.shot *= C.pocket.shotBand5;
  }
  if (tags.lead > 0) mix.shot *= C.leading.shot ** Math.min(C.leading.maxLead, tags.lead);
  if (tags.lead < 0) mix.shot *= C.trailing.push ** Math.min(C.leading.maxLead, -tags.lead);
  if (tags.lead > 0 && tags.minute >= C.leading.minute) {
    mix.takeOn *= C.leading.takeOn;
    if (tags.band <= 2) mix.clearance *= C.leading.clearance;
  }
  if (tags.lead < 0 && tags.minute >= C.trailing.minute) {
    mix.shot *= C.trailing.shot;
    mix.cross *= C.trailing.cross;
  }
  // An overlap still arriving: unpressured, he holds the ball for it.
  if (tags.pressure < 1 && s.players[side].some((gp) => combination(s, gp, idx, c) === 'waiting'))
    mix.carry *= C.combination.wait;
  // His head on shots.
  const decisions = skill(s, side, idx, 'decisions');
  if (cell.xgPerShot !== null && cell.xgPerShot < C.lowXg) mix.shot *= 1 - (decisions - 50) / 200;
  if (cell.xgPerShot !== null && cell.xgPerShot >= C.highXg) mix.shot *= 1 + (decisions - 50) / 300;
  // Hard restrictions.
  if (tags.band <= 3) mix.shot = 0;
  if (tags.band < 5) {
    mix.cross = 0;
    mix.cutBack = 0;
  }
  if (tags.band >= 5) mix.clearance = 0;
  let total = 0;
  for (const a of ACTIONS) total += mix[a];
  if (total <= 0) return { ...mix, carry: 1 };
  for (const a of ACTIONS) mix[a] /= total;
  return mix;
}

type Direction = 'forward' | 'lateral' | 'back';

export interface PassOption {
  target: number;
  score: number;
  prior: number;
  direction: Direction;
  kind: NonNullable<Decision['kind']>;
  lineBreaking: boolean;
}

/** The temperature of the carrier's choices: a sharp head cools it, pressure on a shaky one heats it. */
export function temperature(s: GridState, side: 0 | 1, idx: number, tags: Tags): number {
  const T = DECISION_CONFIG.pass.tau;
  const decisions = skill(s, side, idx, 'decisions');
  const composure = skill(s, side, idx, 'composure');
  return clamp(
    T.scale *
      (1 + (60 - decisions) / T.decisions) *
      (1 + (tags.pressure * (60 - composure)) / T.composure),
    T.range[0],
    T.range[1],
  );
}

/** Pressure at a point of the attack frame: goal-side opponents weigh double. */
function pressureAt(s: GridState, side: 0 | 1, p: Point): number {
  let sum = 0;
  for (const opp of s.players[other(side)]) {
    if (!onPitch(opp)) continue;
    const o = attackFrame(side, opp.pos);
    if (Math.hypot(o[0] - p[0], o[1] - p[1]) <= TAG_CONFIG.pressureRadius)
      sum += o[0] > p[0] ? 1 : 0.5;
  }
  return sum;
}

/**
 * What `gp`'s intention offers carrier `idx`, whose attack-frame place is `c` (candidate model,
 * →MATCH-16): `show` when he shows for him, an overlap that is `waiting` behind the carrier or ready
 * to `release` level with or ahead of him, else nothing.
 */
export function combination(
  s: GridState,
  gp: GridPlayer,
  idx: number,
  c: Point,
): 'show' | 'waiting' | 'release' | undefined {
  const i = gp.intention;
  if (!i || i.teammate !== idx || !onPitch(gp)) return undefined;
  if (i.kind === 'support') return i.support === 'open' ? undefined : 'show';
  if (i.kind !== 'run' || i.run !== 'overlap') return undefined;
  return attackFrame(gp.side, gp.pos)[0] >= c[0] ? 'release' : 'waiting';
}

/** The scored receivers a carrier may find; `filter` narrows who counts. */
export function passOptions(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  opts: {
    crossOnly?: boolean;
    backBias?: number;
    riskScale?: number;
    filter?: (gp: GridPlayer) => boolean;
  } = {},
): PassOption[] {
  const P = DECISION_CONFIG.pass;
  const foe = other(side);
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  const slot = slotOf(s, me);
  const reach = slot.position === 'GK' || slot.position === 'CB' ? P.reachLong : P.reach;
  const baseline = CELL_BASELINES[tags.cell]!;
  const profile = POSITION_PROFILES[profileKey(slot.position)];
  const xt0 = baseline.xT;
  const opponents = s.players[foe].filter(onPitch).map((gp) => attackFrame(side, gp.pos));
  const dfDeep = lineDepth(s, foe, side, 'DF');
  const mfDeep = lineDepth(s, foe, side, 'MF');
  const offside = offsideLine(s, foe);
  const candidates: { gp: GridPlayer; p: Point; dist: number; dir: Direction }[] = [];
  for (const gp of s.players[side]) {
    if (gp.idx === idx || !onPitch(gp) || (opts.filter && !opts.filter(gp))) continue;
    const p = attackFrame(side, gp.pos);
    const dist = Math.hypot(p[0] - c[0], p[1] - c[1]);
    if (dist > reach || dist < 1e-9) continue;
    if (opts.crossOnly && !inBox(p)) continue;
    const angle = Math.abs(Math.atan2(p[1] - c[1], p[0] - c[0])) / DEG;
    candidates.push({
      gp,
      p,
      dist,
      dir: angle <= 45 ? 'forward' : angle >= 135 ? 'back' : 'lateral',
    });
  }
  const count: Record<Direction, number> = { forward: 0, lateral: 0, back: 0 };
  for (const cand of candidates) count[cand.dir]++;
  // Straight after a regain a breaking side goes forward (candidate model, →MATCH-8).
  const D = DECISION_CONFIG.direct;
  const direct =
    s.setup.model !== undefined &&
    s.lastRegain?.side === side &&
    s.elapsed - s.lastRegain.at <= D.seconds
      ? (D.forward[s.setup.tactics[side]] ?? 0)
      : 0;
  return candidates.map(({ gp, p, dist, dir }) => {
    const gain = (CELL_BASELINES[cellOf(p)]!.xT - xt0) * 100;
    let nearest = Infinity,
      risk = 0;
    const dx = p[0] - c[0],
      dy = p[1] - c[1];
    for (const o of opponents) {
      nearest = Math.min(nearest, Math.hypot(o[0] - p[0], o[1] - p[1]));
      const t = ((o[0] - c[0]) * dx + (o[1] - c[1]) * dy) / (dist * dist);
      if (t > 0 && t < 1)
        risk += Math.exp(-Math.hypot(o[0] - (c[0] + t * dx), o[1] - (c[1] + t * dy)) / 2);
    }
    const open = Math.min(1, (Number.isFinite(nearest) ? nearest : 8) / 8);
    const behindRun = gp.run?.kind === 'behind' && gp.run.until > s.elapsed;
    const through =
      behindRun || p[0] > offside
        ? P.through * actionWeight(slotOf(s, gp).role, gp.player.traits, 'key')
        : 0;
    const combo = combination(s, gp, idx, c);
    const score =
      (dir === 'forward' ? direct : 0) +
      gain +
      P.open * open -
      P.risk * (opts.riskScale ?? 1) * risk -
      Math.max(0, dist - P.tooFar) / 10 +
      through +
      (combo === 'show'
        ? DECISION_CONFIG.combination.show
        : combo === 'release'
          ? DECISION_CONFIG.combination.release
          : 0);
    let prior = (baseline[dir] * Math.sqrt(profile[dir] / OVERALL_PROFILE[dir])) / count[dir];
    if (dir === 'back') prior *= P.backPrior * (opts.backBias ?? 1) * (direct ? D.back : 1);
    const kind: PassOption['kind'] =
      through > 0
        ? 'through'
        : Math.abs(dy) > P.switch
          ? 'switch'
          : dist > P.long
            ? 'long'
            : 'short';
    const lineBreaking = [dfDeep, mfDeep].some(
      (deep) => deep !== undefined && c[0] <= deep && p[0] > deep,
    );
    return { target: gp.idx, score, prior, direction: dir, kind, lineBreaking };
  });
}

/** The deepest (largest x in the passer's frame) outfield player of an opponent line. */
function lineDepth(
  s: GridState,
  defending: 0 | 1,
  attacking: 0 | 1,
  line: 'DF' | 'MF',
): number | undefined {
  let deepest: number | undefined;
  for (const gp of s.players[defending]) {
    if (!onPitch(gp) || lineOf(slotOf(s, gp).position) !== line) continue;
    const x = attackFrame(attacking, gp.pos)[0];
    deepest = deepest === undefined ? x : Math.max(deepest, x);
  }
  return deepest;
}

/** The probabilities `choosePass` draws from, aligned with the options. */
export function passProbabilities(options: readonly PassOption[], tau: number): number[] {
  if (!options.length) return [];
  const top = Math.max(...options.map((o) => o.score));
  const weights = options.map((o) => o.prior * Math.exp((o.score - top) / tau));
  const total = weights.reduce((a, b) => a + b, 0);
  return total > 0 ? weights.map((w) => w / total) : options.map(() => 1 / options.length);
}

/** One draw from `items` by their probabilities. */
export function draw<T>(items: readonly T[], probabilities: readonly number[], r: () => number): T {
  let u = r();
  for (let i = 0; i < items.length; i++) {
    u -= probabilities[i]!;
    if (u < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function choosePass(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  r: () => number,
  opts: { crossOnly?: boolean; backBias?: number } = {},
): { target: number; kind: NonNullable<Decision['kind']>; lineBreaking: boolean } | undefined {
  const options = passOptions(s, side, idx, tags, opts);
  if (!options.length) return undefined;
  const chosen = draw(options, passProbabilities(options, temperature(s, side, idx, tags)), r);
  return { target: chosen.target, kind: chosen.kind, lineBreaking: chosen.lineBreaking };
}

/** Where a carry ends (engine frame): five headings scored by the xT they gain and the pressure they meet. */
export function chooseCarry(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  r: () => number,
): [number, number] {
  const K = DECISION_CONFIG.carry;
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  const toGoal = Math.atan2(PITCH.width / 2 - c[1], PITCH.length - c[0]);
  const [base, spread] = inBox(c) ? K.boxLength : K.length;
  const length = base + spread * r();
  const xt0 = CELL_BASELINES[tags.cell]!.xT;
  const ends = K.headings.map((deg): Point => {
    const a = toGoal + deg * DEG;
    return [
      clamp(c[0] + length * Math.cos(a), K.margin, PITCH.length - K.margin),
      clamp(c[1] + length * Math.sin(a), K.margin, PITCH.width - K.margin),
    ];
  });
  const scores = ends.map(
    (p) => (CELL_BASELINES[cellOf(p)]!.xT - xt0) * 100 - K.pressure * pressureAt(s, side, p),
  );
  const tau = temperature(s, side, idx, tags);
  const top = Math.max(...scores);
  const weights = scores.map((v) => Math.exp((v - top) / tau));
  const total = weights.reduce((a, b) => a + b, 0);
  const end = draw(
    ends,
    weights.map((w) => w / total),
    r,
  );
  const [x, y] = attackFrame(side, end);
  return [x, y];
}

/** The goalkeeper's distribution: short to a defender, else long to a forward or wide player upfield. */
export function keeperDistribution(
  s: GridState,
  side: 0 | 1,
  r: () => number,
): { target: number; kind: 'short' | 'long' } {
  const K = DECISION_CONFIG.keeper;
  const idx = s.owner && s.owner[0] === side ? s.owner[1] : 0;
  const me = s.players[side][idx]!;
  const tags = keeperTags(s, side, idx);
  const sweeper = slotOf(s, me).role === 'sweeperKeeper';
  const shortChance =
    (sweeper ? K.sweeper : K.stopper) - (s.setup.tactics[other(side)] === 'press' ? K.press : 0);
  const back = (gp: GridPlayer) =>
    ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(slotOf(s, gp).position);
  const front = (gp: GridPlayer) => {
    const p = attackFrame(side, gp.pos);
    const position = slotOf(s, gp).position;
    return (
      p[0] >= PITCH.length / 2 &&
      (lineOf(position) === 'FW' || ['LM', 'RM', 'LWB', 'RWB'].includes(position))
    );
  };
  const wantShort = r() < shortChance;
  let options = passOptions(
    s,
    side,
    idx,
    tags,
    wantShort ? { filter: back } : { filter: front, riskScale: K.longRisk },
  );
  const kind: 'short' | 'long' = wantShort ? 'short' : 'long';
  if (!options.length) options = passOptions(s, side, idx, tags);
  if (!options.length) return { target: idx === 0 ? 1 : 0, kind };
  const chosen = draw(options, passProbabilities(options, temperature(s, side, idx, tags)), r);
  return { target: chosen.target, kind };
}

/** The tags a keeper's distribution needs: his own cell and the pressure on him. */
function keeperTags(s: GridState, side: 0 | 1, idx: number): Tags {
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  return {
    cell: cellOf(c),
    band: cellBand(cellOf(c)),
    lane: cellLane(cellOf(c)),
    phase: 'buildUp',
    pressure: pressureAt(s, side, c),
    nearest: 0,
    orientation: 'facing',
    betweenLines: false,
    pocket: false,
    inBehind: false,
    channel: false,
    overload: 0,
    lead: s.score[side] - s.score[other(side)],
    minute: Math.floor(s.elapsed / 60) + 1,
    menDiff: 0,
  };
}

/** One decision: the action with one draw, then its target. */
export function decide(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  r: () => number,
): Decision {
  const me = s.players[side][idx]!;
  if (slotOf(s, me).position === 'GK') {
    const { target, kind } = keeperDistribution(s, side, r);
    return { action: 'pass', target, kind };
  }
  const mix = actionMix(s, side, idx, tags);
  const action = draw(
    ACTIONS,
    ACTIONS.map((a) => mix[a]),
    r,
  );
  if (action === 'pass' || action === 'cross' || action === 'cutBack') {
    const pass = choosePass(s, side, idx, tags, r, action === 'pass' ? {} : { crossOnly: true });
    if (pass)
      return { action, target: pass.target, kind: pass.kind, lineBreaking: pass.lineBreaking };
  } else if (action !== 'carry') return { action };
  // A carry, or a pass nobody could receive: carry on, or clear when pressed deep.
  if (action !== 'carry' && tags.pressure >= 1 && tags.band <= 2) return { action: 'clearance' };
  return { action: 'carry', point: chooseCarry(s, side, idx, tags, r) };
}
