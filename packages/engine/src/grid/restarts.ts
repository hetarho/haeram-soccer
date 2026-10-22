/** The ball leaving play, fouls, offside and every set piece, at their real spot with their real dead time (→MATCH-14, MATCH-18). */
import { FORMATIONS } from '../player';
import {
  draw,
  keeperDistribution,
  passOptions,
  passProbabilities,
  temperature,
  type Decision,
} from './decide';
import { attackFrame, bandOf, goalDistance, inBox, laneOf, PITCH, toEngine } from './pitch';
import {
  resolveCross,
  resolvePass,
  resolvePenalty,
  resolveShot,
  type Outcome,
  type ShotContext,
} from './resolve';
import {
  holdSetPiece,
  lineX,
  offsideLine,
  SHAPE_CONFIG,
  setPieceTargets,
  type SetPieceScene,
} from './shape';
import { onPitch, other, skill, type GridPlayer, type GridState } from './state';
import { computeTags } from './tags';

export type RestartKind =
  | 'kickoff'
  | 'throwIn'
  | 'goalKick'
  | 'corner'
  | 'freeKick'
  | 'indirectFreeKick'
  | 'penalty'
  | 'dropBall';

export interface Restart {
  kind: RestartKind;
  side: 0 | 1;
  /** Engine frame. */
  spot: [number, number];
  /** Seconds of dead time the restart costs on the clock. */
  dead: number;
}

/** Dead time per restart (design §7.2) and the set-piece habits; initial values for T215. */
export const RESTART_CONFIG = {
  dead: {
    throwIn: 16,
    goalKick: 24,
    corner: 32,
    freeKick: 28,
    penalty: 70,
    goal: 55,
    kickoff: 55,
    substitution: 30,
    injury: 75,
    card: 25,
    offside: 22,
  },
  cornerSpot: 0.5,
  goalKickSpot: 5.5,
  directRange: 30,
  directChance: 0.25,
  shortCorner: 0.15,
  throwReach: 20,
  throwBonus: 0.05,
  throwFree: 3,
  kickoffBackBias: 10,
  offside: {
    base: 0.03,
    /** Points of 판단력 per unit of offside chance: 200 on the raw scale, times the grid's skill scale (T216). */
    decisions: 360,
    linebreaker: 0.1,
    highLine: 0.05,
    highLineFrom: 40,
    min: 0.012,
    max: 0.7,
  },
} as const;

/** Which restart follows a ball that left play. */
export function classifyOut(out: {
  at: [number, number];
  lastTouch: 0 | 1;
  over: 'touch' | 'byline';
  blockedOrSaved?: boolean;
}): Restart {
  const D = RESTART_CONFIG.dead;
  if (out.over === 'touch')
    return {
      kind: 'throwIn',
      side: other(out.lastTouch),
      spot: [out.at[0], out.at[1]],
      dead: D.throwIn,
    };
  // Side 0 attacks toward x = 105 for the whole match in the engine frame.
  const attackers: 0 | 1 = out.at[0] > PITCH.length / 2 ? 0 : 1;
  if (!out.blockedOrSaved && out.lastTouch === attackers) {
    const x =
      attackers === 0 ? PITCH.length - RESTART_CONFIG.goalKickSpot : RESTART_CONFIG.goalKickSpot;
    return {
      kind: 'goalKick',
      side: other(attackers),
      spot: [x, PITCH.width / 2],
      dead: D.goalKick,
    };
  }
  const y =
    out.at[1] < PITCH.width / 2
      ? RESTART_CONFIG.cornerSpot
      : PITCH.width - RESTART_CONFIG.cornerSpot;
  return {
    kind: 'corner',
    side: attackers,
    spot: [attackers === 0 ? PITCH.length : 0, y],
    dead: D.corner,
  };
}

/** Whether a pass to `target` is offside when played; one draw only when the position alone is offside. */
export function isOffside(
  s: GridState,
  side: 0 | 1,
  target: number,
  r: () => number,
  from?: RestartKind,
): boolean {
  if (from === 'throwIn' || from === 'goalKick' || from === 'corner') return false;
  const O = RESTART_CONFIG.offside;
  const gp = s.players[side][target]!;
  const p = attackFrame(side, gp.pos);
  const ball = attackFrame(side, s.ball);
  const foe = other(side);
  if (p[0] <= PITCH.length / 2 || p[0] <= offsideLine(s, foe) || p[0] <= ball[0]) return false;
  const chance =
    O.base -
    (skill(s, side, target, 'decisions') - 60) / O.decisions -
    (gp.player.traits.includes('linebreaker') ? O.linebreaker : 0) +
    (lineX(s, foe, 'DF') >= O.highLineFrom ? O.highLine : 0);
  return r() < Math.min(O.max, Math.max(O.min, chance));
}

/** The restart a foul gives the fouled side: a penalty inside the box it attacks, else a free kick. */
export function foulRestart(_s: GridState, fouledSide: 0 | 1, at: [number, number]): Restart {
  const D = RESTART_CONFIG.dead;
  if (inBox(attackFrame(fouledSide, at)))
    return {
      kind: 'penalty',
      side: fouledSide,
      spot: toEngine(fouledSide, [PITCH.length - 11, PITCH.width / 2]),
      dead: D.penalty,
    };
  return { kind: 'freeKick', side: fouledSide, spot: [at[0], at[1]], dead: D.freeKick };
}

export interface RestartResult {
  taker: number;
  kind: Decision['kind'] | 'cross' | 'shot' | 'penalty';
  outcome: Outcome;
  /** The receiver the taker chose, for short restarts. */
  target?: number;
}

type TakerKey = 'penalty' | 'directFreeKick' | 'corner';
const TAKER_KEY: Record<TakerKey, (gp: GridPlayer) => number> = {
  penalty: (gp) => 0.6 * gp.player.attrs.finishing + 0.4 * gp.player.attrs.composure,
  directFreeKick: (gp) => 0.5 * gp.player.attrs.finishing + 0.5 * gp.player.attrs.crossing,
  corner: (gp) => gp.player.attrs.crossing,
};

/** The set-piece taker; re-picked by the same key among players on the pitch when he has left. */
function takerFor(s: GridState, side: 0 | 1, key: TakerKey): number {
  const set = s.setup.takers[side][key];
  const gp = s.players[side][set];
  if (gp && onPitch(gp)) return set;
  let best = -1,
    value = -Infinity;
  for (const p of s.players[side]) {
    if (!onPitch(p) || p.slot === 0) continue;
    const v = TAKER_KEY[key](p);
    if (v > value) [best, value] = [p.idx, v];
  }
  return best >= 0 ? best : set;
}

/**
 * Gets the taker and a delivery's scene to the restart before it is taken. The pre-feature path
 * places them at once (`placeAtOnce`); the candidate model walks them there on the clock while the
 * ball is retrieved (`prepareRestart`, →MATCH-12).
 */
export type RestartPreparer = (
  s: GridState,
  rs: Restart,
  taker: number,
  scene?: SetPieceScene,
) => void;

/** The pre-feature preparation: taker and ball on the spot, the scene on its spots, at once. */
export function placeAtOnce(s: GridState, rs: Restart, taker: number, scene?: SetPieceScene) {
  const { side, spot } = rs;
  s.players[side][taker]!.pos = [spot[0], spot[1]];
  s.ball = [spot[0], spot[1]];
  s.owner = [side, taker];
  s.possession = side;
  if (!scene) return;
  for (const { gp, to } of [...scene.up, ...scene.marks]) gp.pos = [to[0], to[1]];
  holdSetPiece(scene, s.elapsed + rs.dead + SHAPE_CONFIG.setPiece.stay);
}

const pickFrom = (options: ReturnType<typeof passOptions>, tau: number, r: () => number) =>
  draw(options, passProbabilities(options, tau), r);

/**
 * Nearest teammate within `reach` with no opponent within `free` metres; else the nearest at all.
 * A teammate standing on the taker's own spot cannot be passed to: a pass of no length has no
 * direction (T356 found a keeper on a dropped ball's spot turning the ball and clock into NaN).
 */
function nearestFree(
  s: GridState,
  side: 0 | 1,
  idx: number,
  reach: number,
  free: number,
): number | undefined {
  const me = s.players[side][idx]!;
  const mates = s.players[side]
    .filter((gp) => gp.idx !== idx && onPitch(gp))
    .map((gp) => ({ gp, d: Math.hypot(gp.pos[0] - me.pos[0], gp.pos[1] - me.pos[1]) }))
    .filter(({ d }) => d > 0 && d <= reach)
    .sort((a, b) => a.d - b.d);
  const isFree = (gp: GridPlayer) =>
    s.players[other(side)].every(
      (o) => !onPitch(o) || Math.hypot(o.pos[0] - gp.pos[0], o.pos[1] - gp.pos[1]) > free,
    );
  return (mates.find(({ gp }) => isFree(gp)) ?? mates[0])?.gp.idx;
}

/** Plays a restart: gets the taker to the spot through `prepare` and resolves it. */
export function playRestart(
  s: GridState,
  rs: Restart,
  r: () => number,
  ctx: ShotContext,
  prepare: RestartPreparer = placeAtOnce,
): RestartResult {
  const K = RESTART_CONFIG;
  const { side } = rs;
  const place = (taker: number, scene?: SetPieceScene) => prepare(s, rs, taker, scene);
  const lead = () => {
    const slots = FORMATIONS[s.setup.tactics[side]].slots;
    const owner = s.owner && s.owner[0] === side ? s.owner[1] : -1;
    const fw = slots.findIndex(
      (slot, i) => i > 0 && onPitch(s.players[side][i]!) && slot.position === 'ST',
    );
    return owner >= 0 && onPitch(s.players[side][owner]!) ? owner : Math.max(1, fw);
  };
  if (rs.kind === 'penalty') {
    const taker = takerFor(s, side, 'penalty');
    place(taker);
    return { taker, kind: 'penalty', outcome: resolvePenalty(s, side, taker, r) };
  }
  if (rs.kind === 'goalKick') {
    const taker = s.players[side].find((gp) => gp.slot === 0 && onPitch(gp))?.idx ?? 0;
    place(taker);
    const { target, kind } = keeperDistribution(s, side, r);
    const tags = computeTags(s, side, taker, { setPiece: true });
    return {
      taker,
      kind,
      target,
      outcome: resolvePass(s, side, taker, target, tags, kind, false, r),
    };
  }
  if (rs.kind === 'kickoff') {
    const taker = lead();
    place(taker);
    const tags = computeTags(s, side, taker, { setPiece: true });
    const behind = (gp: GridPlayer) => attackFrame(side, gp.pos)[0] < attackFrame(side, rs.spot)[0];
    let options = passOptions(s, side, taker, tags, {
      filter: behind,
      backBias: K.kickoffBackBias,
    });
    if (!options.length) options = passOptions(s, side, taker, tags);
    if (!options.length) return { taker, kind: 'short', outcome: { kind: 'held' } };
    const chosen = pickFrom(options, temperature(s, side, taker, tags), r);
    const outcome = resolvePass(
      s,
      side,
      taker,
      chosen.target,
      tags,
      chosen.kind,
      chosen.lineBreaking,
      r,
    );
    return { taker, kind: chosen.kind, target: chosen.target, outcome };
  }
  if (rs.kind === 'throwIn' || rs.kind === 'dropBall') {
    // The nearest outfield teammate to the spot throws in, or takes the dropped ball and plays it short.
    let thrower = lead(),
      nearest = Infinity;
    for (const gp of s.players[side]) {
      if (!onPitch(gp) || gp.slot === 0) continue;
      const d = Math.hypot(gp.pos[0] - rs.spot[0], gp.pos[1] - rs.spot[1]);
      if (d < nearest) [thrower, nearest] = [gp.idx, d];
    }
    place(thrower);
    // Short to the nearest free teammate within reach; when nobody is near, to the nearest one at all.
    const target =
      nearestFree(s, side, thrower, K.throwReach, K.throwFree) ??
      nearestFree(s, side, thrower, 1e9, K.throwFree);
    if (target === undefined)
      return {
        taker: thrower,
        kind: 'short',
        outcome:
          rs.kind === 'dropBall'
            ? { kind: 'held' }
            : { kind: 'out', at: rs.spot, lastTouch: side, over: 'touch' },
      };
    const tags = computeTags(s, side, thrower, { setPiece: true });
    return {
      taker: thrower,
      kind: 'short',
      target,
      outcome: resolvePass(
        s,
        side,
        thrower,
        target,
        tags,
        'short',
        false,
        r,
        rs.kind === 'throwIn' ? K.throwBonus : 0,
      ),
    };
  }
  if (rs.kind === 'corner') {
    const taker = takerFor(s, side, 'corner');
    place(taker, setPieceTargets(s, side, taker));
    const tags = computeTags(s, side, taker, { setPiece: true });
    if (r() < K.shortCorner) {
      const target = nearestFree(s, side, taker, 1e9, 0);
      if (target !== undefined)
        return {
          taker,
          kind: 'short',
          target,
          outcome: resolvePass(s, side, taker, target, tags, 'short', false, r),
        };
    }
    return { taker, kind: 'cross', outcome: resolveCross(s, side, taker, tags, ctx, r) };
  }
  // Free kicks, direct and indirect.
  const spotInFrame = attackFrame(side, rs.spot);
  const band = bandOf(spotInFrame[0]);
  const lane = laneOf(spotInFrame[1]);
  const direct =
    rs.kind === 'freeKick' &&
    band >= 5 &&
    lane >= 1 &&
    lane <= 3 &&
    goalDistance(spotInFrame) <= K.directRange;
  if (direct && r() < K.directChance) {
    const taker = takerFor(s, side, 'directFreeKick');
    place(taker);
    const tags = computeTags(s, side, taker, { setPiece: true });
    return {
      taker,
      kind: 'shot',
      outcome: resolveShot(s, side, taker, tags, ctx, r, { freeKick: true }),
    };
  }
  const wide = lane === 0 || lane === 4;
  const taker = takerFor(s, side, wide || band >= 5 ? 'corner' : 'directFreeKick');
  if (band >= 5) {
    place(taker, setPieceTargets(s, side, taker));
    const tags = computeTags(s, side, taker, { setPiece: true });
    return { taker, kind: 'cross', outcome: resolveCross(s, side, taker, tags, ctx, r) };
  }
  place(taker);
  const tags = computeTags(s, side, taker, { setPiece: true });
  const options = passOptions(s, side, taker, tags);
  if (!options.length) return { taker, kind: 'short', outcome: { kind: 'held' } };
  const chosen = pickFrom(options, temperature(s, side, taker, tags), r);
  return {
    taker,
    kind: chosen.kind,
    target: chosen.target,
    outcome: resolvePass(s, side, taker, chosen.target, tags, chosen.kind, chosen.lineBreaking, r),
  };
}
