import {
  FIGURE_ACTION_LONGEST,
  PITCH_METRES,
  type FigureActionKind,
  type FigureActionWindow,
} from './figureActions';
import type { PresentationSample } from './presentationClock';

/**
 * A point of the figure's local frame (→MATCH-36): torso widths from the torso's centre, +y the way
 * the upper body faces and +x to the player's right. `figureOffset` puts one on the screen.
 */
export type FigurePoint = [number, number];

/**
 * What a figure is posed from at a presented instant (→MATCH-37): recorded facts only. The caller
 * converts velocities and the way to the ball to screen space, since the drawn pitch is not
 * isotropic; playback velocity is in units per second, x 100 being 105 m and y 100 68 m.
 */
export interface FigureInput {
  id: string;
  keeper: boolean;
  /** Running seconds of the presentation clock (`PresentationSample.time`). */
  time: number;
  /** Where he is drawn, playback units. */
  position: [number, number];
  /** His recorded speed, m/s. */
  speed: number;
  /** His velocity on screen, px/s. */
  velocity: [number, number];
  /** His velocity on screen `FIGURE_POSE_CONFIG.hipLag` seconds earlier, px/s. */
  velocityBefore: [number, number];
  /** From him to the drawn ball on screen, px. */
  toBall: [number, number];
  /** The ball's height above the pitch, in the ball track's units. */
  ballHeight: number;
  /** He holds the ball now (→WEB-95's carrier). */
  carrier: boolean;
  /** Metres he has travelled by now (`gaitDistances`, interpolated); NaN reads as none. */
  distance: number;
}

/** A two-segment limb: shoulder, elbow and hand, or hip, knee and foot. */
export interface FigureLimb {
  root: FigurePoint;
  joint: FigurePoint;
  end: FigurePoint;
}

/**
 * Where a held ball is drawn (→MATCH-37): its local point, its height in the ball track's units and
 * how firmly it sits there, 1 held and 0 left to its recorded track. The caller draws the ball at
 * `track + hold · (socket − track)`, so it eases out of a kick or a throw onto its recorded path.
 */
export interface FigureBall {
  at: FigurePoint;
  height: number;
  hold: number;
}

/**
 * A figure's pose at one presented instant (→MATCH-37). Every point is in one local frame (see
 * `FigurePoint`), the legs already turned by `twist`, so a painter turns the canvas once by
 * `facing` (`figureOffset`) and scales torso widths to pixels.
 */
export interface FigurePose {
  /** Screen angle the upper body faces, radians (`atan2` of a screen-space vector). */
  facing: number;
  /** The hips' turn from the upper body, radians clockwise on screen: the upper body leads. */
  twist: number;
  /** How far the head is carried forward, torso widths. */
  lean: number;
  /** How far a foot reaches fore and aft in his stride, torso widths; 0 standing. */
  stride: number;
  /** Gait phase, radians in [0, 2π). */
  phase: number;
  /** Lift off the ground, torso widths. */
  jump: number;
  /** 0 upright to 1 lying full length on the ground (a slide or a dive). */
  lying: number;
  head: FigurePoint;
  /** Left then right. */
  arms: [FigureLimb, FigureLimb];
  legs: [FigureLimb, FigureLimb];
  ball?: FigureBall;
  /** The recorded action the body is acting out, if any. */
  action?: FigureActionKind;
  /** The hands are raised in front of or over the head, so they paint over the shirt. */
  overhead: boolean;
}

export interface FigurePoseOptions {
  /** Hold still stances and show each action as its key pose (→WEB-46). */
  reducedMotion: boolean;
  /** Screen px per playback unit along x and y; only the ratio matters. Defaults to metres. */
  unit?: readonly [number, number];
}

/**
 * Every number a pose is made with (→MATCH-36/37), started from prototype B's `CHARACTER_CONFIG`.
 * Lengths are torso widths, times seconds, angles radians; feet and hands are the right side's,
 * the left mirrors them.
 */
export const FIGURE_POSE_CONFIG = {
  /** How long the hips trail the upper body: the caller samples `velocityBefore` this much earlier. */
  hipLag: 0.16,
  /**
   * Running seconds a change of his drawn run takes to turn the body: at a sample the figure's
   * path bends, and he faces the new way this quickly, as a player turns into his run.
   */
  turn: 0.2,
  /**
   * Metres per visual gait cycle: longer than a real two-step cycle (2.8) so the limbs do not flail
   * in accelerated playback, short enough that a run shows its legs and arms going (18.6 hid it).
   */
  strideMetres: 6,
  /** Speed (m/s) at which stride, arm swing and lean are full. */
  topSpeed: 8,
  /** Below `still` m/s he turns to the ball; from `moving` he faces his run. */
  face: { still: 0.6, moving: 2 },
  /** The furthest the hips turn from the upper body. */
  maxTwist: 0.7,
  /** Full stride (foot reach fore and aft), arm swing as a share of it, and full forward lean. */
  stride: 0.6,
  armSwing: 0.55,
  lean: 0.15,
  /** Where the limbs join the body, the head, and the limbs' lengths seen from above. */
  body: {
    shoulder: [0.42, 0],
    hip: [0.16, -0.04],
    head: [0, 0.03],
    thigh: 0.95,
    shin: 0.95,
    upperArm: 0.62,
    forearm: 0.58,
    /** Share of an arm's slack that bends the elbow out of line. */
    bend: 0.35,
    /**
     * Share of a leg's slack that bends the knee forward. Seen from above most of a leg's slack is
     * the hip's height over the foot, so a standing knee stays under the chest.
     */
    kneeBend: 0.12,
  },
  /** The ready stance standing and running, and the keeper's crouch with his hands out. */
  stance: { foot: [0.24, 0.14], hand: [0.54, 0.04] },
  keeperStance: { foot: [0.42, 0.16], hand: [0.6, 0.34] },
  /** Seconds an action blends in from its start and out to its end. */
  fade: { in: 0.22, out: 0.28 },
  /** Each action's key pose under reduced motion, seconds from its contact. */
  key: {
    kick: 0,
    longKick: 0,
    shot: 0,
    throwIn: -0.1,
    header: 0,
    tackle: 0,
    slide: 0,
    catch: 0.2,
    dive: 0.2,
  },
  /**
   * The carried ball sits `gap` ahead of the furthest a foot reaches, nudged a further `nudge` of
   * the stride with each touch; a kicked or thrown ball leaves the socket over `release` seconds.
   * Heights of a ball over the head and at the chest, in the ball track's units.
   */
  ball: { gap: 0.32, nudge: 0.3, release: 0.15, overhead: 2.3, chest: 1.2 },
  /**
   * A kick: the planted foot beside the ball, the kicking foot at impact, how far it swings back
   * and follows through (times the power), and how fast the struck ball leaves the socket.
   */
  kick: {
    power: { kick: 0.7, longKick: 1.05, shot: 1.25 },
    plant: [-0.2, 0.88],
    impact: [0.24, 0.74],
    ball: [0.24, 0.98],
    backswing: 1.5,
    followThrough: 0.5,
    flight: 4,
  },
  /** A header's jump, full once the ball comes at `height` (ball track units). */
  header: { jump: 0.3, height: 2 },
  /** A tackle's reach, recovering `recoverAfter` the contact over `recover`; a slide's longer reach and turn. */
  tackle: { reach: 1.45, slideReach: 1.75, recoverAfter: 0.35, recover: 0.7, roll: 0.78 },
  /** A dive's turn onto its side and lift. */
  dive: { roll: 1.1, jump: 0.15 },
} as const;

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp = (a: readonly number[], b: readonly number[], t: number): FigurePoint => [
  mix(a[0]!, b[0]!, t),
  mix(a[1]!, b[1]!, t),
];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const turnToward = (from: number, to: number, share: number) => from + wrap(to - from) * share;
const angleOf = (v: readonly [number, number]) =>
  Math.hypot(v[0], v[1]) > 1e-9 ? Math.atan2(v[1], v[0]) : undefined;
/** A point of a frame turned `a` clockwise on screen, in the unturned frame. */
const turn = ([x, y]: readonly number[], a: number): FigurePoint => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [x! * c + y! * s, y! * c - x! * s];
};

/** FNV-1a over a player's ID: his gait's own phase offset, so a line of players does not march. */
function idHash(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Metres travelled at which `id`'s gait stands at `cycle` (0–1) of its cycle, for a set still step. */
export function gaitDistanceAt(id: string, cycle: number) {
  const offset = (idHash(id) % 1024) / 1024;
  return ((((cycle - offset) % 1) + 1) % 1) * FIGURE_POSE_CONFIG.strideMetres;
}

/** A local point as a screen offset in px: +y along `facing`, +x to his right, `scale` px a torso width. */
export function figureOffset(
  facing: number,
  [x, y]: readonly [number, number],
  scale: number,
): [number, number] {
  const c = Math.cos(facing),
    s = Math.sin(facing);
  return [(y * c - x * s) * scale, (y * s + x * c) * scale];
}

/**
 * Each player's metres travelled by every presentation sample (→MATCH-37): the drawn path from his
 * first sample, so a gait phase read from it advances with ground covered and never jumps when
 * the speed changes. NaN where a sample leaves him out; he resumes where he left off. The caller
 * interpolates between samples as it does positions.
 */
export function gaitDistances(
  samples: readonly PresentationSample[],
): ReadonlyMap<string, Float64Array> {
  const distances = new Map<string, Float64Array>();
  // Each player's last sample, where he stood then and his metres by then.
  const last = new Map<string, { k: number; at: [number, number]; total: number }>();
  samples.forEach((sample, k) => {
    for (const side of sample.players ?? [])
      for (const { id, position } of side) {
        let row = distances.get(id);
        if (!row) {
          row = new Float64Array(samples.length).fill(NaN);
          distances.set(id, row);
        }
        const before = last.get(id);
        const total = !before
          ? 0
          : before.k === k - 1
            ? before.total +
              Math.hypot(
                (position[0] - before.at[0]) * PITCH_METRES[0],
                (position[1] - before.at[1]) * PITCH_METRES[1],
              )
            : before.total;
        row[k] = total;
        last.set(id, { k, at: position, total });
      }
  });
  return distances;
}

/**
 * The windows running at `t`, in start order: those started by `t` and not yet ended. A list is in
 * start order and no window is longer than `FIGURE_ACTION_LONGEST`.
 */
function runningAt(windows: readonly FigureActionWindow[] | undefined, t: number) {
  if (!windows?.length) return [];
  let low = 0,
    high = windows.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (windows[mid]!.start <= t) low = mid + 1;
    else high = mid;
  }
  const found: FigureActionWindow[] = [];
  for (let k = low - 1; k >= 0 && t - windows[k]!.start < FIGURE_ACTION_LONGEST; k--)
    if (windows[k]!.end > t) found.unshift(windows[k]!);
  return found;
}

/** A body part of a pose before its limbs are solved: feet in the hips' frame, hands in the upper body's. */
interface Layer {
  feet: [FigurePoint, FigurePoint];
  hands: [FigurePoint, FigurePoint];
  lean: number;
  /** The upper body's turn from the hips, and the whole body's (clockwise on screen). */
  turn: number;
  roll: number;
  jump: number;
  lying: number;
  /** A ball socket, at the feet in the hips' frame (`low`) or in the hands in the upper body's. */
  ball?: FigureBall & { low: boolean };
  overhead: boolean;
}

const mirrored = (p: readonly number[]): FigurePoint => [-p[0]!, p[1]!];
const pair = (right: readonly number[]): [FigurePoint, FigurePoint] => [
  mirrored(right),
  [right[0]!, right[1]!],
];

/**
 * The action of `window` at `dt` seconds from its contact (its key pose under reduced motion);
 * `since` is the real time from contact, which alone lets a held ball go.
 */
function actionLayer(
  window: FigureActionWindow,
  dt: number,
  since: number,
  input: FigureInput,
  still: boolean,
  base: Layer,
): Layer {
  const C = FIGURE_POSE_CONFIG;
  const t = window.contact + dt;
  const layer: Layer = {
    feet: base.feet,
    hands: base.hands,
    lean: base.lean,
    turn: 0,
    roll: 0,
    jump: 0,
    lying: 0,
    overhead: false,
  };
  // A held ball leaves with the contact: at once under reduced motion.
  const letGo = since < 0 ? 1 : still ? 0 : 1 - smooth(since / C.ball.release);
  switch (window.kind) {
    case 'kick':
    case 'longKick':
    case 'shot': {
      const K = C.kick;
      const power = K.power[window.kind];
      const lead = window.contact - window.start;
      const wound = smooth((dt + lead) / 0.4);
      const back = dt < -0.3 ? wound : dt < 0 ? 1 - smooth((dt + 0.3) / 0.3) : 0;
      const follow = dt >= 0 ? Math.sin(clamp01(dt / 0.68) * Math.PI) : 0;
      const arms = dt < 0 ? wound : 1 - smooth(dt / 0.65);
      layer.feet = [
        [K.plant[0], K.plant[1]],
        [
          K.impact[0] + follow * 0.2,
          K.impact[1] - back * K.backswing * power + follow * K.followThrough * power,
        ],
      ];
      // The arm opposite the kicking leg goes out, the other back.
      layer.hands = [
        [-0.95, 0.3 + arms * 0.15],
        [0.7, -0.35 - arms * 0.15],
      ];
      layer.turn = (back * 0.22 - follow * 0.3) * power;
      layer.lean = follow * 0.15;
      layer.ball = {
        at: [K.ball[0], K.ball[1] + Math.max(0, dt) * K.flight],
        height: 0,
        hold: since < 0 ? (input.carrier ? 1 : 0) : letGo,
        low: true,
      };
      break;
    }
    case 'throwIn': {
      // Both hands hold the ball over the head, feet planted, until the throw carries them forward.
      const wound = smooth((t - window.start) / 0.42);
      const release = smooth((dt + 0.08) / 0.35);
      const reach = mix(-0.1, 0.62, release);
      layer.hands = pair([mix(0.16, 0.22, release), reach]);
      layer.feet = [
        [-0.26, -0.06],
        [0.26, 0.3],
      ];
      layer.lean = -0.06 * wound + 0.12 * release;
      layer.ball = { at: [0, reach + 0.06], height: C.ball.overhead, hold: letGo, low: false };
      layer.overhead = true;
      break;
    }
    case 'header': {
      const rise = Math.exp(-((dt / 0.23) ** 2));
      const lift = still ? 1 : Math.min(1, Math.max(0.4, input.ballHeight / C.header.height));
      layer.jump = rise * C.header.jump * lift;
      layer.lean = rise * 0.2;
      layer.hands = pair([0.95, 0.15]);
      layer.feet = [
        [-0.18, -0.06],
        [0.18, -0.12],
      ];
      break;
    }
    case 'tackle':
    case 'slide': {
      const T = C.tackle;
      const reach =
        smooth((t - window.start) / (window.contact - window.start)) *
        (1 - smooth((dt - T.recoverAfter) / T.recover));
      if (window.kind === 'tackle') {
        // A standing reach: one foot planted, the other stretched for the ball.
        layer.feet = [
          [-0.36, -0.12],
          [0.3, 0.14 + reach * T.reach],
        ];
        layer.hands = [
          [-0.9, -0.05],
          [0.85, 0.05],
        ];
        layer.turn = -reach * 0.22;
      } else {
        // Down on his side, both legs out at the ball, a hand behind him.
        layer.feet = [
          [-0.42, 0.14 + reach],
          [0.3, 0.14 + reach * T.slideReach],
        ];
        layer.hands = [
          [-0.8, -0.5 * reach],
          [0.75, 0.1],
        ];
        layer.turn = reach * T.roll;
        layer.lying = reach;
      }
      break;
    }
    case 'catch': {
      const reach = smooth((dt + 0.45) / 0.45);
      layer.feet = pair(C.keeperStance.foot);
      layer.hands = pair([mix(0.6, 0.16, reach), mix(0.34, 0.5, reach)]);
      layer.ball = {
        at: [0, 0.48],
        height: C.ball.chest,
        hold: still ? (since < 0 ? 0 : 1) : smooth((since + 0.1) / 0.1),
        low: false,
      };
      layer.overhead = true;
      break;
    }
    case 'dive': {
      // Launched onto his side, arms at the ball, legs trailing.
      const D = C.dive;
      const out = Math.sin(clamp01((dt + 0.5) / 1.4) * Math.PI);
      layer.roll = (window.dive ?? 1) * out * D.roll;
      layer.lying = out;
      layer.jump = out * D.jump;
      layer.hands = pair([mix(0.6, 0.14, out), mix(0.34, 1.05, out)]);
      layer.feet = [
        [-0.22, mix(0.16, -0.9, out)],
        [0.26, mix(0.16, -1.0, out)],
      ];
      layer.overhead = true;
      break;
    }
  }
  return layer;
}

/** The middle joint of a limb from `root` to `end`, bent toward `out` by `bend` of the limb's slack. */
function limb(
  root: FigurePoint,
  end: FigurePoint,
  a: number,
  b: number,
  out: FigurePoint,
  bend: number,
): FigureLimb {
  const length = Math.hypot(end[0] - root[0], end[1] - root[1]);
  // A limb never comes apart: an end beyond its reach is drawn at full stretch.
  const reach = length > a + b ? (a + b) / length : 1;
  const tip = lerp(root, end, reach);
  const slack = (Math.sqrt(Math.max(0, (a + b) ** 2 - (length * reach) ** 2)) / 2) * bend;
  const along = lerp(root, tip, a / (a + b));
  return { root, joint: [along[0] + out[0] * slack, along[1] + out[1] * slack], end: tip };
}

/**
 * A figure's pose at the presented instant (→MATCH-37), a value of its arguments alone: no state,
 * no randomness, so the same instant is the same pose after any speed change, seek or replay.
 * - facing: a moving player faces his run and a slow one the ball, the hips on the run of
 *   `hipLag` earlier and never more than `maxTwist` from the upper body; an action turns him to
 *   what it aims at.
 * - running: legs stride and arms swing opposite them, phase from metres travelled and his ID,
 *   stride and lean growing with speed; standing he holds his ready stance.
 * - actions: each running window blends its body in and out over `fade`, with a held ball socket
 *   for the carrier, a throw-in and a catch.
 * - reduced motion keeps position and facing, holds the still stance and shows each action as its
 *   key pose for the whole window (→WEB-46).
 */
export function poseAt(
  input: FigureInput,
  windows: readonly FigureActionWindow[] | undefined,
  options: FigurePoseOptions,
): FigurePose {
  const C = FIGURE_POSE_CONFIG;
  const B = C.body;
  const still = options.reducedMotion;
  const unit = options.unit ?? PITCH_METRES;
  // Facing: his run as he speeds up, else the ball (a carrier on the ball keeps his last run).
  const moving = smooth((input.speed - C.face.still) / (C.face.moving - C.face.still));
  const run = angleOf(input.velocity);
  const before = angleOf(input.velocityBefore);
  const look = (input.carrier ? undefined : angleOf(input.toBall)) ?? run ?? before ?? 0;
  let facing = turnToward(look, run ?? look, moving);
  const now = Math.hypot(...input.velocity);
  const earlier = moving * (now > 1e-9 ? clamp01(Math.hypot(...input.velocityBefore) / now) : 1);
  let hips = turnToward(look, before ?? run ?? look, earlier);

  // Running: the phase follows ground covered, the stride and lean the speed.
  const distance = Number.isFinite(input.distance) ? input.distance : 0;
  const cycles = distance / C.strideMetres + (idHash(input.id) % 1024) / 1024;
  const phase = TAU * (cycles - Math.floor(cycles));
  const pace = still ? 0 : clamp01(input.speed / C.topSpeed);
  const stride = pace * C.stride;
  const swing = Math.sin(phase) * stride;
  const ready = input.keeper ? C.keeperStance : C.stance;
  const foot = lerp(ready.foot, C.stance.foot, still ? 0 : moving);
  const hand = lerp(ready.hand, C.stance.hand, still ? 0 : moving);
  const base: Layer = {
    feet: [
      [-foot[0], foot[1] + swing],
      [foot[0], foot[1] - swing],
    ],
    hands: [
      [-hand[0], hand[1] - swing * C.armSwing],
      [hand[0], hand[1] + swing * C.armSwing],
    ],
    lean: pace * C.lean,
    turn: 0,
    roll: 0,
    jump: 0,
    lying: 0,
    overhead: false,
  };
  // The carried ball runs just ahead of his furthest step, nudged on with each touch.
  if (input.carrier)
    base.ball = {
      at: [0.06, foot[1] + stride * (1 + C.ball.nudge * Math.sin(phase) ** 2) + C.ball.gap],
      height: 0,
      hold: 1,
      low: true,
    };

  // Actions under way, each blended over the one before it.
  const layers: { layer: Layer; weight: number }[] = [];
  let action: FigureActionKind | undefined;
  for (const window of runningAt(windows, input.time)) {
    const weight = still
      ? 1
      : smooth((input.time - window.start) / C.fade.in) *
        smooth((window.end - input.time) / C.fade.out);
    if (weight <= 0) continue;
    const since = input.time - window.contact;
    const dt = still ? C.key[window.kind] : since;
    layers.push({ layer: actionLayer(window, dt, since, input, still, base), weight });
    action = window.kind;
    const aim = angleOf([
      (window.toward[0] - input.position[0]) * unit[0],
      (window.toward[1] - input.position[1]) * unit[1],
    ]);
    if (aim !== undefined) {
      facing = turnToward(facing, aim, weight);
      hips = turnToward(hips, aim, weight);
    }
  }
  let { lean, turn: upper, roll, jump, lying, overhead } = base;
  for (const { layer, weight } of layers) {
    lean = mix(lean, layer.lean, weight);
    upper = mix(upper, layer.turn, weight);
    roll = mix(roll, layer.roll, weight);
    jump = mix(jump, layer.jump, weight);
    lying = mix(lying, layer.lying, weight);
    if (weight >= 0.5) overhead = layer.overhead;
  }
  const lag = Math.max(-C.maxTwist, Math.min(C.maxTwist, wrap(hips - facing)));
  const twist = lag - upper;

  // Limbs and the ball, the hips' parts turned into the upper body's frame.
  const socket = (layer: Layer): FigureBall | undefined =>
    layer.ball && {
      at: layer.ball.low ? turn(layer.ball.at, twist) : layer.ball.at,
      height: layer.ball.height,
      hold: layer.ball.hold,
    };
  let { feet, hands } = base;
  let ball = socket(base);
  for (const { layer, weight } of layers) {
    feet = [lerp(feet[0], layer.feet[0], weight), lerp(feet[1], layer.feet[1], weight)];
    hands = [lerp(hands[0], layer.hands[0], weight), lerp(hands[1], layer.hands[1], weight)];
    const held = socket(layer);
    if (held)
      ball = ball
        ? {
            at: lerp(ball.at, held.at, weight),
            height: mix(ball.height, held.height, weight),
            hold: mix(ball.hold, held.hold, weight),
          }
        : { ...held, hold: held.hold * weight };
    else if (ball) ball = { ...ball, hold: ball.hold * (1 - weight) };
  }
  const side = (i: number) => (i ? 1 : -1);
  const legs = [0, 1].map((i) =>
    limb(
      turn([side(i) * B.hip[0], B.hip[1]], twist),
      turn(feet[i]!, twist),
      B.thigh,
      B.shin,
      turn([side(i) * 0.29, 0.96], twist),
      B.kneeBend,
    ),
  );
  const arms = [0, 1].map((i) =>
    limb(
      [side(i) * B.shoulder[0], B.shoulder[1]],
      hands[i]!,
      B.upperArm,
      B.forearm,
      [side(i) * 0.93, -0.37],
      B.bend,
    ),
  );
  return {
    facing: wrap(facing + upper + roll),
    twist: wrap(twist),
    lean,
    stride,
    phase,
    jump,
    lying,
    head: [B.head[0], B.head[1] + lean],
    arms: [arms[0]!, arms[1]!],
    legs: [legs[0]!, legs[1]!],
    ...(ball && ball.hold > 0 ? { ball } : {}),
    ...(action ? { action } : {}),
    overhead,
  };
}
