/** Open-play resolution: every chosen action is settled by a duel between named players on their attributes (→MATCH-11, MATCH-13). */
import { ATTRIBUTES } from '../../../contracts/src/player';
import { actionWeight, bend as bendMargin, finishing, goalChance, targetChance } from '../match';
import { FORMATIONS, lineOf } from '../player';
import { CELL_BASELINES } from './baselines';
import { attackFrame, goalAngle, goalDistance, inBox, PITCH, type Point } from './pitch';
import { skill, type GridPlayer, type GridState } from './state';
import type { Tags } from './tags';
import type { Decision } from './decide';

type Kind = NonNullable<Decision['kind']>;
type Ref = [0 | 1, number];

export type Outcome =
  | { kind: 'complete'; to: [number, number]; receiver: number }
  | { kind: 'intercepted'; by: number; at: [number, number] }
  | { kind: 'tackled'; by: number }
  | { kind: 'loose'; at: [number, number]; winner: Ref }
  | { kind: 'out'; at: [number, number]; lastTouch: 0 | 1; over: 'touch' | 'byline' }
  | { kind: 'foul'; by: number; at: [number, number] }
  | { kind: 'held'; by?: number }
  | {
      kind: 'shot';
      result: 'goal' | 'save' | 'block' | 'miss';
      xg: number;
      recordedXg: number;
      then?: 'corner' | 'loose' | 'hold' | 'goalKick';
      by?: number;
    };

/** Initial values (design §7.1); T215 and T216 tune them. */
export const DUEL_CONFIG = {
  pass: {
    passer: 1 / 250,
    marker: 1 / 300,
    risk: 0.08,
    distance: 1 / 200,
    pressure: 0.03,
    min: 0.25,
    max: 0.97,
    lost: { intercepted: 0.55, loose: 0.3, out: 0.15 },
  },
  cross: {
    base: 0.24,
    skill: 1 / 150,
    crowd: 0.03,
    min: 0.08,
    max: 0.6,
    claim: 0.12,
    failOut: 0.3,
  },
  cutBack: { base: 0.43, skill: 1 / 200, min: 0.2, max: 0.7 },
  takeOn: {
    skill: 1 / 140,
    min: 0.2,
    max: 0.85,
    fail: { tackle: 0.7, foul: 0.22, loose: 0.08 },
    past: [5, 8],
  },
  carry: { lostScale: 3, skill: 1 / 120, min: 0.01, max: 0.35, foul: 0.15 },
  holdUp: { base: 0.6, skill: 1 / 150, min: 0.3, max: 0.85 },
  aerial: { skill: 1 / 150, base: 0.5, min: 0.15, max: 0.85 },
  clearance: { out: 0.3, reach: [25, 45] },
} as const;

/** Initial values (design §7.4). */
export const SHOT_CONFIG = {
  a: -1.0,
  b: -0.11,
  c: 1.6,
  header: 0.55,
  cutBack: 1.25,
  pressure: 0.12,
  freeKickWall: 0.6,
  onTargetSkill: 1 / 250,
  block: { base: 0.25, perDefender: 0.06, skill: 1 / 300, min: 0.05, max: 0.5, lane: 2 },
  save: { hold: 0.55, corner: 0.25, loose: 0.2 },
  blockThen: { corner: 0.35 },
  penalty: { base: 0.78, min: 0.6, max: 0.92, xg: 0.76 },
  maxXg: 0.8,
} as const;

const onPitch = (gp: GridPlayer) => gp.onPitch && !gp.sentOff;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const other = (side: 0 | 1) => (1 - side) as 0 | 1;
const frame = (side: 0 | 1, p: Point): Point => attackFrame(side, p);
const back = (side: 0 | 1, p: Point): [number, number] => {
  const q = attackFrame(side, p);
  return [q[0], q[1]];
};
const slotPosition = (s: GridState, gp: GridPlayer) =>
  FORMATIONS[s.setup.tactics[gp.side]].slots[gp.slot]?.position;

/** Chance quality of a shot from `p` (the shooter's attack frame): place, angle, kind and pressure. */
export function chanceXg(
  p: Point,
  opts: { header?: boolean; cutBack?: boolean; pressure?: number; freeKick?: boolean } = {},
): number {
  const C = SHOT_CONFIG;
  const z = C.a + C.b * goalDistance(p) + C.c * goalAngle(p);
  return (
    sigmoid(z) *
    (opts.header ? C.header : 1) *
    (opts.cutBack ? C.cutBack : 1) *
    (opts.freeKick ? C.freeKickWall : 1) *
    (1 - C.pressure * (opts.pressure ?? 0))
  );
}

/** What the match needs once: the level finisher's factor recorded xG is scaled by. */
export interface ShotContext {
  levelFactor: number;
}

/** The factor of the level's average finisher (starting forwards of both sides) against the average keeper. */
export function shotContext(s: GridState): ShotContext {
  let shooting = 0,
    count = 0,
    keeping = 0;
  for (const side of [0, 1] as const) {
    for (const gp of s.players[side].slice(0, 11)) {
      if (slotPosition(s, gp) === 'GK') keeping += gp.base[ATTR.reflexes]!;
      else if (lineOf(slotPosition(s, gp)!) === 'FW') {
        shooting += gp.base[ATTR.finishing]!;
        count++;
      }
    }
  }
  return { levelFactor: finishing(count ? shooting / count : 55, keeping / 2) };
}
const ATTR = {
  finishing: ATTRIBUTES.indexOf('finishing'),
  reflexes: ATTRIBUTES.indexOf('reflexes'),
};

/** Distance from `p` to the segment `a`→`b`, and where along it (0–1) the nearest point lies. */
function toSegment(p: Point, a: Point, b: Point): { d: number; t: number } {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
  return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

function nearestToSegment(s: GridState, side: 0 | 1, a: Point, b: Point) {
  let best: { gp: GridPlayer; d: number; t: number } | undefined;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const q = toSegment(frame(side, gp.pos), a, b);
    if (!best || q.d < best.d) best = { gp, ...q };
  }
  return best;
}

function laneRisk(s: GridState, side: 0 | 1, a: Point, b: Point): number {
  let risk = 0;
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const o = frame(side, gp.pos);
    const t = ((o[0] - a[0]) * dx + (o[1] - a[1]) * dy) / len2;
    if (t > 0 && t < 1) risk += Math.exp(-toSegment(o, a, b).d / 2);
  }
  return risk;
}

/** The winner of a loose ball among the two nearest players of each side, weighted 1/(distance + 1); one draw. */
export function looseWinner(s: GridState, at: Point, r: () => number): Ref {
  const near: { ref: Ref; w: number }[] = [];
  for (const side of [0, 1] as const)
    near.push(
      ...s.players[side]
        .filter(onPitch)
        .map((gp) => ({
          ref: [side, gp.idx] as Ref,
          d: Math.hypot(gp.pos[0] - at[0], gp.pos[1] - at[1]),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .map(({ ref, d }) => ({ ref, w: 1 / (d + 1) })),
    );
  let u = r() * near.reduce((sum, n) => sum + n.w, 0);
  for (const n of near) {
    u -= n.w;
    if (u <= 0) return n.ref;
  }
  return near[near.length - 1]!.ref;
}

/** Where a ball played from `from` through `to` first leaves the pitch (engine frame). */
function exitPoint(from: Point, to: Point): { at: [number, number]; over: 'touch' | 'byline' } {
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const tx = dx > 0 ? (PITCH.length - from[0]) / dx : dx < 0 ? -from[0] / dx : Infinity;
  const ty = dy > 0 ? (PITCH.width - from[1]) / dy : dy < 0 ? -from[1] / dy : Infinity;
  const t = Math.max(1, Math.min(tx, ty));
  return {
    at: [clamp(from[0] + dx * t, 0, PITCH.length), clamp(from[1] + dy * t, 0, PITCH.width)],
    over: ty < tx ? 'touch' : 'byline',
  };
}

/**
 * A pass. Draws, in order: completion; on failure the split; for a loose ball the winner.
 * Offside is checked by the caller before this resolves (T210).
 */
export function resolvePass(
  s: GridState,
  side: 0 | 1,
  idx: number,
  target: number,
  tags: Tags,
  kind: Kind,
  lineBreaking: boolean,
  r: () => number,
  bonus = 0,
): Outcome {
  const P = DUEL_CONFIG.pass;
  const from = frame(side, s.players[side][idx]!.pos);
  const receiver = s.players[side][target]!;
  const to = frame(side, receiver.pos);
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const keeper = slotPosition(s, s.players[side][idx]!) === 'GK';
  const long = kind === 'long' || kind === 'through' || kind === 'switch' || lineBreaking;
  const passer = keeper
    ? skill(s, side, idx, 'distribution')
    : long
      ? (skill(s, side, idx, 'passing') + skill(s, side, idx, 'vision')) / 2
      : skill(s, side, idx, 'passing');
  const marker = nearestToSegment(s, side, from, to);
  const markerSkill = marker ? skill(s, other(side), marker.gp.idx, 'positioning') : 60;
  const base = CELL_BASELINES[tags.cell]!.passCompletion;
  const p = clamp(
    base +
      (passer - 60) * P.passer -
      (markerSkill - 60) * P.marker -
      P.risk * laneRisk(s, side, from, to) -
      Math.max(0, dist - 20) * P.distance -
      P.pressure * tags.pressure +
      s.setup.bends[side].pass / 100 +
      bonus,
    P.min,
    P.max,
  );
  if (r() < p) return { kind: 'complete', to: back(side, to), receiver: target };
  const u = r();
  if (u < P.lost.intercepted && marker) {
    const at = back(side, [
      from[0] + (to[0] - from[0]) * marker.t,
      from[1] + (to[1] - from[1]) * marker.t,
    ]);
    return { kind: 'intercepted', by: marker.gp.idx, at };
  }
  if (u < P.lost.intercepted + P.lost.loose) {
    const at = back(side, to);
    return { kind: 'loose', at, winner: looseWinner(s, at, r) };
  }
  const exit = exitPoint(back(side, from), back(side, to));
  return { kind: 'out', at: exit.at, lastTouch: side, over: exit.over };
}

const aerialRating = (s: GridState, side: 0 | 1, idx: number, header: number) =>
  header * skill(s, side, idx, 'heading') + (1 - header) * skill(s, side, idx, 'strength');

/** An aerial duel at `at`: the attacker's chance by 0.6 heading + 0.4 strength against the defender's; one draw. */
export function resolveAerial(
  s: GridState,
  attacker: Ref,
  defender: Ref,
  at: Point,
  r: () => number,
): Outcome {
  const A = DUEL_CONFIG.aerial;
  const diff =
    aerialRating(s, attacker[0], attacker[1], 0.6) - aerialRating(s, defender[0], defender[1], 0.6);
  const winner = r() < clamp(A.base + diff * A.skill, A.min, A.max) ? attacker : defender;
  return { kind: 'loose', at: [at[0], at[1]], winner };
}

/** The shot of a header or a cut-back chance; shared by crosses and cut-backs. */
export function resolveShot(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Pick<Tags, 'pressure'>,
  ctx: ShotContext,
  r: () => number,
  opts: { header?: boolean; cutBack?: boolean; freeKick?: boolean } = {},
): Outcome {
  const C = SHOT_CONFIG;
  const from = frame(side, s.players[side][idx]!.pos);
  const xg = chanceXg(from, { ...opts, pressure: tags.pressure });
  const hard = tags.pressure >= 1 || xg >= 0.3;
  const main = opts.header ? skill(s, side, idx, 'heading') : skill(s, side, idx, 'finishing');
  const shooting =
    (hard ? 0.65 : 0.8) * main + (hard ? 0.35 : 0.2) * skill(s, side, idx, 'composure');
  const keeper =
    s.players[other(side)].find((gp) => gp.slot === 0 && onPitch(gp)) ?? s.players[other(side)][0]!;
  const goal = goalChance(xg, shooting, skill(s, other(side), keeper.idx, 'reflexes'));
  const onTarget = targetChance(goal, shooting);
  const recordedXg = Math.min(C.maxXg, xg * ctx.levelFactor);
  const u = r();
  if (u < goal) return { kind: 'shot', result: 'goal', xg, recordedXg };
  if (u < onTarget) {
    const v = r();
    const then = v < C.save.hold ? 'hold' : v < C.save.hold + C.save.corner ? 'corner' : 'loose';
    return { kind: 'shot', result: 'save', xg, recordedXg, then, by: keeper.idx };
  }
  // A miss: a defender on the shot line may have got in the way.
  const end: Point = [PITCH.length, PITCH.width / 2];
  let lane = 0,
    blocker: GridPlayer | undefined,
    near = Infinity;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp) || gp === keeper) continue;
    const q = toSegment(frame(side, gp.pos), from, end);
    if (q.d <= C.block.lane) {
      lane++;
      if (q.d < near) [blocker, near] = [gp, q.d];
    }
  }
  const p = clamp(
    C.block.base +
      C.block.perDefender * lane +
      (blocker ? (skill(s, other(side), blocker.idx, 'positioning') - 55) * C.block.skill : 0),
    C.block.min,
    C.block.max,
  );
  if (blocker && r() < p) {
    return {
      kind: 'shot',
      result: 'block',
      xg,
      recordedXg,
      then: r() < C.blockThen.corner ? 'corner' : 'loose',
      by: blocker.idx,
    };
  }
  return { kind: 'shot', result: 'miss', xg, recordedXg, then: 'goalKick' };
}

/** The best aerial target among the side's players inside the box, by 0.6 heading + 0.4 strength. */
function headerTarget(s: GridState, side: 0 | 1, except: number): GridPlayer | undefined {
  let best: GridPlayer | undefined,
    value = -Infinity;
  for (const gp of s.players[side]) {
    if (gp.idx === except || !onPitch(gp) || !inBox(frame(side, gp.pos))) continue;
    const v =
      aerialRating(s, side, gp.idx, 0.6) *
      actionWeight(slotRole(s, gp), gp.player.traits, 'aerial');
    if (v > value) [best, value] = [gp, v];
  }
  return best;
}
const slotRole = (s: GridState, gp: GridPlayer) =>
  FORMATIONS[s.setup.tactics[gp.side]].slots[gp.slot]!.role;

/**
 * A cross. Draws, in order: delivery; the keeper's claim; the aerial duel; then the header's draws.
 * Delivered: the keeper claims, or the best attacker and best defender duel in the air and the winner heads it.
 */
export function resolveCross(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  ctx: ShotContext,
  r: () => number,
): Outcome {
  const X = DUEL_CONFIG.cross;
  const foe = other(side);
  const attacker = headerTarget(s, side, idx);
  const defenders = s.players[foe].filter((gp) => onPitch(gp) && inBox(frame(side, gp.pos)));
  const attackers = s.players[side].filter(
    (gp) => gp.idx !== idx && onPitch(gp) && inBox(frame(side, gp.pos)),
  );
  const p = clamp(
    X.base +
      (skill(s, side, idx, 'crossing') - 60) * X.skill -
      Math.max(0, defenders.length - attackers.length) * X.crowd,
    X.min,
    X.max,
  );
  const delivered = r() < p;
  const keeper = s.players[foe].find((gp) => gp.slot === 0 && onPitch(gp));
  if (!delivered || !attacker) {
    const out = r() < X.failOut;
    const at = back(side, [
      PITCH.length,
      clamp(frame(side, s.players[side][idx]!.pos)[1], 0, PITCH.width),
    ]);
    if (out) return { kind: 'out', at, lastTouch: side, over: 'byline' };
    const by = nearestDefender(
      s,
      side,
      attacker ? frame(side, attacker.pos) : [PITCH.length - 10, PITCH.width / 2],
    );
    return {
      kind: 'intercepted',
      by,
      at: back(side, attacker ? frame(side, attacker.pos) : [PITCH.length - 10, PITCH.width / 2]),
    };
  }
  const claimP = X.claim + (keeper ? (skill(s, foe, keeper.idx, 'handling') - 60) / 400 : 0);
  if (keeper && r() < claimP) return { kind: 'held', by: keeper.idx };
  const defender = defenders.reduce<GridPlayer | undefined>(
    (best, gp) =>
      !best || aerialRating(s, foe, gp.idx, 0.6) > aerialRating(s, foe, best.idx, 0.6) ? gp : best,
    undefined,
  );
  if (defender) {
    const duel = resolveAerial(
      s,
      [side, attacker.idx],
      [foe, defender.idx],
      [88.5, frame(side, attacker.pos)[1]],
      r,
    );
    if (duel.kind === 'loose' && duel.winner[0] === foe) {
      const at = back(side, [88.5, frame(side, attacker.pos)[1]]);
      return { kind: 'loose', at, winner: duel.winner };
    }
  }
  return resolveShot(s, side, attacker.idx, tags, ctx, r, { header: true });
}

function nearestDefender(s: GridState, side: 0 | 1, at: Point): number {
  let best = 0,
    d = Infinity;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const v = Math.hypot(frame(side, gp.pos)[0] - at[0], frame(side, gp.pos)[1] - at[1]);
    if (v < d) [best, d] = [gp.idx, v];
  }
  return best;
}

/** A cut-back to a teammate in the box; the next action is a forced shot with `cutBack`. One draw. */
export function resolveCutBack(
  s: GridState,
  side: 0 | 1,
  idx: number,
  target: number,
  r: () => number,
): Outcome {
  const K = DUEL_CONFIG.cutBack;
  const to = frame(side, s.players[side][target]!.pos);
  const p = clamp(K.base + (skill(s, side, idx, 'crossing') - 60) * K.skill, K.min, K.max);
  if (r() < p) return { kind: 'complete', to: back(side, to), receiver: target };
  return { kind: 'intercepted', by: nearestDefender(s, side, to), at: back(side, to) };
}

/** The nearest opponent ahead of the carrier within 4.6 m. */
function inFront(s: GridState, side: 0 | 1, idx: number): GridPlayer | undefined {
  const c = frame(side, s.players[side][idx]!.pos);
  let best: GridPlayer | undefined,
    d = 4.6;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const o = frame(side, gp.pos);
    const v = Math.hypot(o[0] - c[0], o[1] - c[1]);
    if (o[0] >= c[0] && v <= d) [best, d] = [gp, v];
  }
  return best;
}

/** A take-on. Draws: success; on failure the split; for a loose ball the winner. */
export function resolveTakeOn(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  r: () => number,
): Outcome {
  const T = DUEL_CONFIG.takeOn;
  const me = s.players[side][idx]!;
  const c = frame(side, me.pos);
  const foe = inFront(s, side, idx);
  const past: Point = [
    Math.min(
      PITCH.length - 0.5,
      (foe ? frame(side, foe.pos)[0] : c[0]) + T.past[0] + (T.past[1] - T.past[0]) / 2,
    ),
    c[1],
  ];
  if (!foe) return { kind: 'complete', to: back(side, past), receiver: idx };
  const edge =
    0.7 * skill(s, side, idx, 'dribbling') +
    0.3 * skill(s, side, idx, 'pace') -
    0.7 * skill(s, foe.side, foe.idx, 'tackling') -
    0.3 * skill(s, foe.side, foe.idx, 'pace');
  const p = clamp((CELL_BASELINES[tags.cell]!.takeOnSuccess ?? 0.5) + edge * T.skill, T.min, T.max);
  if (r() < p) return { kind: 'complete', to: back(side, past), receiver: idx };
  const u = r();
  if (u < T.fail.tackle) return { kind: 'tackled', by: foe.idx };
  if (u < T.fail.tackle + T.fail.foul)
    return { kind: 'foul', by: foe.idx, at: [me.pos[0], me.pos[1]] };
  const at: [number, number] = [me.pos[0], me.pos[1]];
  return { kind: 'loose', at, winner: looseWinner(s, at, r) };
}

/** A carry to `to` (engine frame); only under pressure can the carrier be dispossessed. Draws: loss; then the foul. */
export function resolveCarry(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  to: Point,
  r: () => number,
): Outcome {
  const K = DUEL_CONFIG.carry;
  const me = s.players[side][idx]!;
  const foe = nearestToSegment(s, side, frame(side, me.pos), frame(side, to));
  if (tags.pressure >= 1 && foe) {
    const lost = CELL_BASELINES[tags.cell]!.lostPer100 / 100;
    const edge = skill(s, foe.gp.side, foe.gp.idx, 'tackling') - skill(s, side, idx, 'dribbling');
    const p = clamp(lost * K.lostScale * (1 + edge * K.skill), K.min, K.max);
    if (r() < p) {
      if (r() < K.foul) return { kind: 'foul', by: foe.gp.idx, at: [me.pos[0], me.pos[1]] };
      return { kind: 'tackled', by: foe.gp.idx };
    }
  }
  return { kind: 'complete', to: [to[0], to[1]], receiver: idx };
}

/** A hold-up: a shielding duel on strength; one draw. */
export function resolveHoldUp(s: GridState, side: 0 | 1, idx: number, r: () => number): Outcome {
  const H = DUEL_CONFIG.holdUp;
  const me = s.players[side][idx]!;
  const foe = nearestToSegment(s, side, frame(side, me.pos), frame(side, me.pos));
  if (!foe) return { kind: 'held' };
  const edge = skill(s, side, idx, 'strength') - skill(s, foe.gp.side, foe.gp.idx, 'strength');
  if (r() < clamp(H.base + edge * H.skill, H.min, H.max)) return { kind: 'held' };
  return { kind: 'tackled', by: foe.gp.idx };
}

/** A clearance 25–45 m upfield. Draws: out; the distance; the second-ball winner. */
export function resolveClearance(s: GridState, side: 0 | 1, idx: number, r: () => number): Outcome {
  const K = DUEL_CONFIG.clearance;
  const me = s.players[side][idx]!;
  const c = frame(side, me.pos);
  const out = r() < K.out;
  const reach = K.reach[0] + (K.reach[1] - K.reach[0]) * r();
  const x = clamp(c[0] + reach, 0, PITCH.length);
  if (out) {
    const y = c[1] < PITCH.width / 2 ? 0 : PITCH.width;
    return { kind: 'out', at: back(side, [x, y]), lastTouch: side, over: 'touch' };
  }
  const at = back(side, [x, c[1]]);
  return { kind: 'loose', at, winner: looseWinner(s, at, r) };
}

/** A penalty between kicker and keeper; one draw. Recorded as 0.76 xG. */
export function resolvePenalty(s: GridState, side: 0 | 1, idx: number, r: () => number): Outcome {
  const C = SHOT_CONFIG.penalty;
  const foe = other(side);
  const keeper = s.players[foe].find((gp) => gp.slot === 0 && onPitch(gp)) ?? s.players[foe][0]!;
  const kicker = 0.6 * skill(s, side, idx, 'finishing') + 0.4 * skill(s, side, idx, 'composure');
  const p = clamp(C.base + (kicker - skill(s, foe, keeper.idx, 'reflexes')) / 300, C.min, C.max);
  if (r() < p) return { kind: 'shot', result: 'goal', xg: C.xg, recordedXg: C.xg };
  return {
    kind: 'shot',
    result: 'save',
    xg: C.xg,
    recordedXg: C.xg,
    then: 'loose',
    by: keeper.idx,
  };
}

export { bendMargin as bend };
