/** What the player on the ball does and where he plays it: the real-data mix of his cell, bent by role, traits, tactic, tags, score and head (→MATCH-8, MATCH-16). */
import type { Tactic } from '../../../contracts/src/types';
import { FORMATIONS, lineOf } from '../player';
import { actionWeight } from '../match';
import { CELL_BASELINES, OVERALL_PROFILE, POSITION_PROFILES, profileKey } from './baselines';
import { attackFrame, cellBand, cellLane, cellOf, inBox, PITCH, type Point } from './pitch';
import { offsideLine } from './shape';
import { skill, type GridPlayer, type GridState } from './state';
import type { Tags } from './tags';

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
  cutBackShare: 0.35,
  takeOnPerPass: 0.045,
  crossShare: 0.025,
  factorRange: [0.2, 3],
  shotLine: { GK: 0, DF: 0.6, MF: 1, FW: 1.25 },
  /** Global shot-volume scale; the first uncalibrated engine produced about 25 shots a side (T215 settles it). */
  shotScale: 0.05,
  tactic: {
    possession: { pass: 1.1, takeOn: 0.9, shotBand5: 0.8 },
    counter: { shotInCounter: 1.1 },
    press: { shotAfterRegain: 1.2, regainSeconds: 6 },
    balanced: {},
  } as Record<Tactic, Record<string, number>>,
  pressure: { carry: 0.6, takeOn: 1.3, takeOnDribbling: 65, clearance: 2 },
  backToGoal: { takeOn: 0.5, shot: 0.3 },
  inBehind: { shot: 1.6, carry: 1.3 },
  pocket: { takeOn: 1.2, shotBand5: 1.2 },
  leading: { minute: 75, takeOn: 0.8, clearance: 1.3 },
  trailing: { minute: 70, shot: 1.2, cross: 1.2 },
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
  },
  carry: { headings: [0, -30, 30, -90, 90], length: [6, 6], pressure: 0.5, margin: 0.5 },
  keeper: { sweeper: 0.7, stopper: 0.45, press: 0.15, longRisk: 0.5 },
} as const;

const onPitch = (gp: GridPlayer) => gp.onPitch && !gp.sentOff;
const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const slotOf = (s: GridState, gp: GridPlayer) =>
  FORMATIONS[s.setup.tactics[gp.side]].slots[gp.slot]!;

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
  const oppBend = s.setup.bends[(1 - side) as 0 | 1];
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
  const crossFactor = clamp(profile.crossShare / C.crossShare, C.factorRange[0], C.factorRange[1]);
  mix.cross *= crossFactor;
  mix.cutBack *= crossFactor;
  mix.shot *= C.shotLine[line] * C.shotScale;
  // Role and traits.
  mix.shot *= actionWeight(slot.role, traits, 'shot');
  mix.takeOn *= actionWeight(slot.role, traits, 'dribble');
  mix.cross *= actionWeight(slot.role, traits, 'cross');
  mix.cutBack *= actionWeight(slot.role, traits, 'cross');
  mix.holdUp *= actionWeight(slot.role, traits, 'hold');
  if (!inBox(c)) mix.shot *= actionWeight(slot.role, traits, 'long');
  // The tactic and its style bends.
  if (tactic === 'possession') {
    mix.pass *= C.tactic.possession.pass!;
    mix.takeOn *= C.tactic.possession.takeOn!;
    if (tags.band === 5) mix.shot *= C.tactic.possession.shotBand5!;
  }
  if (tactic === 'counter' && tags.phase === 'counter') mix.shot *= C.tactic.counter.shotInCounter!;
  if (
    tactic === 'press' &&
    s.lastRegain?.side === side &&
    s.elapsed - s.lastRegain.at <= C.tactic.press.regainSeconds! &&
    tags.band >= 5
  )
    mix.shot *= C.tactic.press.shotAfterRegain!;
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
    mix.shot *= C.inBehind.shot;
    mix.carry *= C.inBehind.carry;
  }
  if (tags.pocket) {
    mix.takeOn *= C.pocket.takeOn;
    if (tags.band === 5) mix.shot *= C.pocket.shotBand5;
  }
  if (tags.lead > 0 && tags.minute >= C.leading.minute) {
    mix.takeOn *= C.leading.takeOn;
    if (tags.band <= 2) mix.clearance *= C.leading.clearance;
  }
  if (tags.lead < 0 && tags.minute >= C.trailing.minute) {
    mix.shot *= C.trailing.shot;
    mix.cross *= C.trailing.cross;
  }
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
  for (const opp of s.players[(1 - side) as 0 | 1]) {
    if (!onPitch(opp)) continue;
    const o = attackFrame(side, opp.pos);
    if (Math.hypot(o[0] - p[0], o[1] - p[1]) <= 4.6) sum += o[0] > p[0] ? 1 : 0.5;
  }
  return sum;
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
  const other = (1 - side) as 0 | 1;
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  const slot = slotOf(s, me);
  const reach = slot.position === 'GK' || slot.position === 'CB' ? P.reachLong : P.reach;
  const baseline = CELL_BASELINES[tags.cell]!;
  const profile = POSITION_PROFILES[profileKey(slot.position)];
  const xt0 = baseline.xT;
  const opponents = s.players[other].filter(onPitch).map((gp) => attackFrame(side, gp.pos));
  const dfDeep = lineDepth(s, other, side, 'DF');
  const mfDeep = lineDepth(s, other, side, 'MF');
  const offside = offsideLine(s, other);
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
    const score =
      gain +
      P.open * open -
      P.risk * (opts.riskScale ?? 1) * risk -
      Math.max(0, dist - P.tooFar) / 10 +
      through;
    let prior = (baseline[dir] * Math.sqrt(profile[dir] / OVERALL_PROFILE[dir])) / count[dir];
    if (dir === 'back' && opts.backBias) prior *= opts.backBias;
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

function draw<T>(items: readonly T[], probabilities: readonly number[], r: () => number): T {
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
  const length = K.length[0] + K.length[1] * r();
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
    (sweeper ? K.sweeper : K.stopper) -
    (s.setup.tactics[(1 - side) as 0 | 1] === 'press' ? K.press : 0);
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
    lead: s.score[side] - s.score[(1 - side) as 0 | 1],
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
