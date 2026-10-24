/**
 * Playback frames from the grid trace (design §10.2, §10.4; →MATCH-12, WEB-32): one frame per match
 * minute with the engine's own positions, the ball's flight between its recorded touches, events with
 * Korean commentary, the minute's label and pace. Presentation only: it reads a played result and
 * draws from its own stream, never the match's.
 */
import { NEUTRAL_FRAME_PACE, type IntentionObservation } from '../../../contracts/src/match-model';
import type {
  Manager,
  MatchEvent,
  MatchFrame,
  MatchMotionSample,
  Metrics,
  PlayerMotion,
  PlayerMotionState,
  Tactic,
} from '../../../contracts/src/types';
import { FORMATIONS } from '../player';
import { hypot } from '../portable-math';
import { clamp, random } from '../primitives';
import { describe } from './commentary';
import type { GridResult } from './engine';
import type { EndedIntention, Intention } from './intentions';
import { attackFrame, bandOf, PITCH } from './pitch';
import { GRID_BALL_CONFIG } from './movement';
import { M, RUNNING } from './record';
import type { GridSetup } from './setup';
import { SPOTS } from './spots';
import type { TraceEntry, TraceKick } from './trace';

/** Motion states by the index a trace entry stores them under. */
export const MOTION_STATES = [
  'shape',
  'support',
  'run',
  'press',
  'mark',
  'recover',
  'carry',
  'keeper',
] as const satisfies readonly PlayerMotionState[];

export const PLAYBACK_CONFIG = {
  /** Motion seconds a match minute takes at pace 1, and its regular ball track points. */
  motionSecondsPerMinute: 8,
  trackPerMinute: 80,
  /**
   * Ball speeds (→MATCH-12): averages along the curve in pitch units per motion second, against a
   * 5.8 player maximum; no flight's launch may exceed `max`.
   */
  speeds: {
    max: 100,
    pass: 48,
    turnover: 44,
    restart: 60,
    throw: 36,
    shot: 84,
    loose: 36,
    tackle: 22,
  },
  flight: {
    /** Even a poke takes a couple of steps, so the renderer always has a path to draw. */
    minimumFlight: 0.2,
    /** Share of `speeds.max` a launch may reach. */
    launchHeadroom: 0.9,
    /** Flights longer than this leave the ground; the peak grows with the extra distance. */
    loftFrom: 18,
    loftPerUnit: 0.17,
    maxLoft: 9,
    /** Share of long balls driven low instead of lofted, and the height they keep. */
    drivenShare: 0.3,
    drivenLoft: 0.3,
    /**
     * Flight shapes. `ease` is the launch-speed boost (the ball slows by the same share toward the
     * end), `bend` the lateral Bézier offset range as a share of the chord, `loft` scales the
     * height rule and `bobble` adds a fixed hop.
     */
    styles: {
      pass: { ease: 0.3, bend: [0.04, 0.16], loft: 1, bobble: 0 },
      loose: { ease: 0.4, bend: [0.18, 0.32], loft: 1, bobble: 1.4 },
      cut: { ease: 0.25, bend: [0, 0], loft: 0.5, bobble: 0 },
      tackle: { ease: 0.5, bend: [0.1, 0.3], loft: 0, bobble: 0.4 },
      shot: { ease: 0.12, bend: [0.02, 0.08], loft: 0.35, bobble: 0 },
      reset: { ease: 0.5, bend: [0, 0], loft: 0, bobble: 0 },
      throw: { ease: 0.1, bend: [0, 0.04], loft: 0, bobble: 2.2 },
      cross: { ease: 0.2, bend: [0.06, 0.18], loft: 1.4, bobble: 1.5 },
    },
  },
  /** A curve whose apex comes within this many units of a touchline bends the other way. */
  curlInside: 3,
  /** Motion seconds a restart's taker takes at most to walk to the ball (pre-feature traces). */
  takerWalk: 0.9,
  /**
   * Candidate traces (→MATCH-12): metres per match second at which a restart's taker is drawn
   * walking to the spot. He arrives no earlier than the ball is set down and no later than the
   * restart is taken (its recorded kick, T359; on older traces his kick).
   */
  takerSpeed: 6,
  /**
   * Candidate traces: match seconds at least between drawn player samples. Players move straight
   * between snapshots (a restart's kick among them, T359) and waypoints; breakpoints closer than
   * this share a sample, but a restart's kick is always drawn.
   */
  sampleSpacing: 2,
  /**
   * Pre-feature traces: match seconds at least between drawn player samples, taken at every
   * snapshot (always drawn) and wherever the ball changes segment (a kick, a restart's rest), so
   * the receiver stands where the ball lands and an actor leaves the ball when he kicks it
   * (→MATCH-12).
   */
  preFeatureSpacing: 1,
  /**
   * Pre-feature traces: the share of its motion-second duration a kick flies in match seconds, so
   * a pass lasts about as long as the candidate's recorded flights (median ~1 s) and its receiver
   * is seen on the ball before he plays it on, instead of every flight being squeezed back to back.
   */
  preFeatureFlight: 0.25,
  /** Metres: farther from his target a player recovers, nearer the ball an attacker supports, nearer an opponent a defender marks. */
  states: { recover: 15, support: 20, mark: 5 },
  /** Minute weights (design §10.4): build-up in the own half, ordinary, chances and set pieces. */
  pace: { quiet: 0.6, normal: 1, busy: 1.6 },
} as const;

type Units = [number, number];
type Phase = NonNullable<MatchMotionSample['phase']>;
type Style = keyof typeof PLAYBACK_CONFIG.flight.styles;
type Ref = [0 | 1, number];

interface Flight {
  kind: 'flight';
  start: number;
  end: number;
  phase: Phase;
  from: Units;
  to: Units;
  control: Units;
  loft: number;
  ease: number;
}
/** The ball at a player's feet; `at` stands in should he no longer be found. */
interface Hold {
  kind: 'hold';
  start: number;
  end: number;
  side: 0 | 1;
  idx: number;
  at: Units;
}
/** A dead ball resting on its restart spot. */
interface Rest {
  kind: 'rest';
  start: number;
  end: number;
  at: Units;
}
type Segment = Flight | Hold | Rest;

/** The actor off the straight line between two snapshots: he stays on the ball (a restart's taker walks to it first) until he kicks it. */
interface Path {
  side: 0 | 1;
  idx: number;
  at: Units;
  arrive: number;
  kick: number;
  /**
   * Candidate traces: the actor's timed waypoints from the earlier snapshot (match seconds, units);
   * after the last he heads for his place in the later one. Replaces `at`/`arrive`/`kick`.
   */
  route?: [number, Units][];
}

interface Period {
  p: 1 | 2 | 3 | 4;
  start: number;
  end: number;
  entries: TraceEntry[];
  times: number[];
  segments: Segment[];
  starts: number[];
  paths: (Path | undefined)[];
}

interface Leg {
  to: Units;
  style: Style;
  speed: number;
  phase: Phase;
}

const SECONDS_PER_MOTION = 60 / PLAYBACK_CONFIG.motionSecondsPerMinute;
const OFFSET = [0, 45, 90, 105] as const;
const LENGTH = [45, 45, 15, 15] as const;
const CARRIES = new Set(['carry', 'takeOn', 'holdUp']);
const NOTABLE = new Set([
  '슛',
  '선방',
  '경고',
  '교체',
  '부상',
  '오프사이드',
  '파울',
  '코너킥',
  '프리킥',
  '페널티킥',
]);
const RESTART_LABEL: Record<string, string> = {
  throwIn: '스로인',
  goalKick: '골킥',
  corner: '코너킥',
  freeKick: '프리킥',
  indirectFreeKick: '프리킥',
  penalty: '페널티킥',
};
const INCIDENT_LABEL: Record<string, string> = {
  yellow: '경고',
  secondYellow: '퇴장',
  red: '퇴장',
  sub: '교체',
  injury: '부상',
};

const units = (p: readonly [number, number]): Units => [
  (p[0] * 100) / PITCH.length,
  (p[1] * 100) / PITCH.width,
];
const lerp = (a: Units, b: Units, f: number): Units => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
];
/**
 * Distances in the drawn frames use the portable hypot (V8's `Math.hypot` bit for bit), so a page
 * in any browser draws the samples Node computes for the same match (T358).
 */
const gap = (a: Units, b: Units) => hypot(a[0] - b[0], a[1] - b[1]);
const tenth = (n: number) => Math.round(n * 10) / 10;
const hundredth = (n: number) => Math.round(n * 100) / 100;
const unit = (n: number) => clamp(n, 0, 1);

/**
 * What the UI draws beside the playback: each tactic's formation spots in pitch units (from
 * `SPOTS`, slot order, attacking left to right), the ball's peak height, and the implicit team
 * tendencies (`teamMotionProfile`); a player's own are `playerTendencies` (grid/tendencies.ts).
 */
export const MATCH_MOTION_CONFIG = {
  ball: { maxLoft: PLAYBACK_CONFIG.flight.maxLoft },
  formations: {
    balanced: SPOTS.balanced.map(units),
    possession: SPOTS.possession.map(units),
    counter: SPOTS.counter.map(units),
    press: SPOTS.press.map(units),
  } as Record<Tactic, readonly Units[]>,
  manager: {
    appliedTacticWeight: 0.55,
    flexibilityWeight: 0.35,
    abilityCohesion: 0.22,
    flexibilityFreedom: 0.22,
  },
  tactics: {
    balanced: {
      formation: FORMATIONS.balanced.name,
      cohesion: 0.65,
      freedom: 0.5,
      pressing: 0.5,
      risk: 0.5,
      line: 0,
    },
    possession: {
      formation: FORMATIONS.possession.name,
      cohesion: 0.76,
      freedom: 0.56,
      pressing: 0.46,
      risk: 0.48,
      line: 4,
    },
    counter: {
      formation: FORMATIONS.counter.name,
      cohesion: 0.84,
      freedom: 0.36,
      pressing: 0.23,
      risk: 0.77,
      line: -8,
    },
    press: {
      formation: FORMATIONS.press.name,
      cohesion: 0.61,
      freedom: 0.66,
      pressing: 0.95,
      risk: 0.72,
      line: 7,
    },
  },
} as const;

export function teamMotionProfile(
  tactic: Tactic,
  manager: Pick<Manager, 'philosophy' | 'ability' | 'flexibility'>,
) {
  const c = MATCH_MOTION_CONFIG.manager;
  const applied = c.appliedTacticWeight + unit(manager.flexibility / 100) * c.flexibilityWeight;
  const tacticProfile = MATCH_MOTION_CONFIG.tactics[tactic],
    philosophy = MATCH_MOTION_CONFIG.tactics[manager.philosophy];
  const mix = (key: 'cohesion' | 'freedom' | 'pressing' | 'risk' | 'line') =>
    tacticProfile[key] * applied + philosophy[key] * (1 - applied);
  return {
    formation: tacticProfile.formation,
    cohesion: unit(mix('cohesion') + (unit(manager.ability / 100) - 0.5) * c.abilityCohesion),
    freedom: unit(mix('freedom') + (unit(manager.flexibility / 100) - 0.5) * c.flexibilityFreedom),
    pressing: unit(mix('pressing')),
    risk: unit(mix('risk')),
    line: mix('line'),
    ability: unit(manager.ability / 100),
  };
}

/** The last index whose value is at most `v`, or -1. */
function lastAt(values: readonly number[], v: number): number {
  let lo = 0,
    hi = values.length - 1,
    found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! <= v) [found, lo] = [mid, mid + 1];
    else hi = mid - 1;
  }
  return found;
}

/**
 * A traced intention as the frame shows it (→MATCH-17): its target in the period's units, its
 * teammate and opponent by player ID, and its ending once it has ended.
 */
function observed(
  i: Intention | EndedIntention,
  side: 0 | 1,
  mirror: (u: Units) => Units,
  id: (side: 0 | 1, idx: number | undefined) => string,
): IntentionObservation {
  const target = mirror(units(i.target));
  return {
    kind: i.kind,
    priority: i.priority,
    target: [clamp(target[0], 0, 100), clamp(target[1], 0, 100)],
    ...(i.teammate === undefined ? {} : { teammate: id(side, i.teammate) }),
    ...(i.opponent === undefined ? {} : { opponent: id(side === 0 ? 1 : 0, i.opponent) }),
    since: i.since,
    until: i.until,
    ...('end' in i ? { ended: i.end } : {}),
  };
}

/** What a sample draws its players from: an entry's snapshot, or a restart's kick (T359). */
type Snap = Omit<TraceKick, 'elapsed'>;

function slotIn(e: Pick<Snap, 'slots'>, side: 0 | 1, idx: number): number {
  for (let k = 0; k < 11; k++) if (e.slots[side * 11 + k] === idx) return k;
  return -1;
}

/** A player's place in a snapshot, in units of the first-half orientation. */
function placeIn(
  e: Pick<Snap, 'positions' | 'slots'>,
  side: 0 | 1,
  idx: number,
): Units | undefined {
  const k = slotIn(e, side, idx);
  if (k < 0) return undefined;
  const at = (side * 11 + k) * 2;
  return units([e.positions[at]!, e.positions[at + 1]!]);
}

/** The kick of the restart entry `b` that follows `a` (T359), when it lies between them. */
const kickAfter = (a: TraceEntry, b: TraceEntry | undefined): TraceKick | undefined =>
  b?.kick && b.kick.elapsed > a.elapsed && b.kick.elapsed < b.elapsed ? b.kick : undefined;

/**
 * The snapshot a sample at `time` shows the players' targets, states and intentions from: the
 * last entry's at or before it, except during a restart recorded with its kick (T359,
 * →MATCH-17). Its preparation shows the kick's snapshot, the restart's places that the walk-in
 * heads for; from the kick it shows the restart's entry, whose jobs start at the kick.
 */
function shownAt(P: Period, time: number): Snap {
  const j = Math.max(0, lastAt(P.times, time));
  const a = P.entries[j]!;
  const b = P.entries[j + 1];
  const kick = kickAfter(a, b);
  if (!kick || time <= a.elapsed) return a;
  return time <= kick.elapsed ? kick : b!;
}

/** Where a player stands at match second `time`, or undefined when he is not on the pitch. */
function positionAt(P: Period, side: 0 | 1, idx: number, time: number): Units | undefined {
  const j = lastAt(P.times, time);
  if (j < 0) return undefined;
  const a = P.entries[j]!;
  const here = placeIn(a, side, idx);
  if (!here) return undefined;
  const b = P.entries[j + 1];
  if (!b) return here;
  const there = placeIn(b, side, idx) ?? here;
  // A restart recorded with its kick (T359): the walk-in ends where the kick found him, the
  // delivery starts there.
  const kick = kickAfter(a, b);
  const kicked = kick ? placeIn(kick, side, idx) : undefined;
  const path = P.paths[j + 1];
  if (path?.route && path.side === side && path.idx === idx) {
    let t0 = a.elapsed,
      p0 = here;
    for (const [t1, p1] of path.route) {
      if (time <= t1) return t1 > t0 ? lerp(p0, p1, (time - t0) / (t1 - t0)) : p1;
      [t0, p0] = [t1, p1];
    }
    return b.elapsed > t0 ? lerp(p0, there, (time - t0) / (b.elapsed - t0)) : there;
  }
  if (path && path.side === side && path.idx === idx) {
    if (time <= path.kick) {
      const walk = path.arrive - a.elapsed;
      return walk > 0 ? lerp(here, path.at, Math.min(1, (time - a.elapsed) / walk)) : path.at;
    }
    return lerp(path.at, there, (time - path.kick) / (b.elapsed - path.kick));
  }
  if (kick && kicked)
    return time <= kick.elapsed
      ? lerp(here, kicked, (time - a.elapsed) / (kick.elapsed - a.elapsed))
      : lerp(kicked, there, (time - kick.elapsed) / (b.elapsed - kick.elapsed));
  return lerp(here, there, (time - a.elapsed) / (b.elapsed - a.elapsed));
}

/** The ball at match second `time`: ground point, height, phase and the player who has it. */
function ballAt(P: Period, time: number): { at: Units; h: number; phase: Phase; holder?: Ref } {
  const i = lastAt(P.starts, time);
  if (i < 0) return { at: [50, 50], h: 0, phase: 'restart' };
  const g = P.segments[i]!;
  const now = Math.min(time, g.end);
  if (g.kind === 'rest') return { at: g.at, h: 0, phase: 'restart' };
  if (g.kind === 'hold')
    return {
      at: positionAt(P, g.side, g.idx, now) ?? g.at,
      h: 0,
      phase: 'possession',
      holder: [g.side, g.idx],
    };
  const tau = g.end > g.start ? clamp((now - g.start) / (g.end - g.start), 0, 1) : 1;
  const s = (1 + g.ease) * tau - g.ease * tau * tau;
  const u = 1 - s;
  return {
    at: [
      clamp(u * u * g.from[0] + 2 * u * s * g.control[0] + s * s * g.to[0], 0, 100),
      clamp(u * u * g.from[1] + 2 * u * s * g.control[1] + s * s * g.to[1], 0, 100),
    ],
    h: 4 * g.loft * tau * (1 - tau),
    phase: g.phase,
  };
}

/** The flights an entry's ball makes, in order; none while it stays at the actor's feet. */
function legsOf(e: TraceEntry): Leg[] {
  if (!e.to) return [];
  const sp = PLAYBACK_CONFIG.speeds;
  const to = units(e.to);
  const restart = e.spot !== undefined;
  const play = restart ? (e.kind ?? 'short') : e.action;
  if (e.outcome === 'held' && !e.by) return [];
  if (CARRIES.has(play)) {
    if (e.outcome === 'complete' || e.outcome === 'foul') return [];
    return e.outcome === 'tackled'
      ? [{ to, style: 'tackle', speed: sp.tackle, phase: 'transition' }]
      : [{ to, style: 'loose', speed: sp.loose, phase: 'transition' }];
  }
  const first = restart ? (e.action === 'throwIn' ? sp.throw : sp.restart) : undefined;
  if (e.result) {
    const shot: Leg = { to, style: 'shot', speed: sp.shot, phase: 'shot' };
    if (!e.shotAt) return [shot];
    const style: Style = play === 'cross' ? 'cross' : 'pass';
    const phase: Phase = restart ? 'restart' : 'pass';
    return [{ to: units(e.shotAt), style, speed: first ?? sp.pass, phase }, shot];
  }
  const turnover = e.by !== undefined && e.by[0] !== e.side;
  const style: Style =
    e.outcome === 'loose'
      ? 'loose'
      : play === 'cross'
        ? 'cross'
        : e.action === 'throwIn'
          ? 'throw'
          : 'pass';
  const speed = first ?? (e.outcome === 'loose' ? sp.loose : turnover ? sp.turnover : sp.pass);
  return [{ to, style, speed, phase: restart ? 'restart' : turnover ? 'transition' : 'pass' }];
}

/** One kick's shape: curve sign, bend and loft from the ball stream; its duration in match seconds. */
function shape(from: Units, to: Units, style: Style, speed: number, r: () => number) {
  const F = PLAYBACK_CONFIG.flight;
  const st = F.styles[style];
  const sign = r() < 0.5 ? -1 : 1;
  let bend = sign * (st.bend[0] + (st.bend[1] - st.bend[0]) * r());
  const controlOf = (b: number): Units => [
    (from[0] + to[0]) / 2 - b * (to[1] - from[1]),
    (from[1] + to[1]) / 2 + b * (to[0] - from[0]),
  ];
  let control = controlOf(bend);
  // Curl toward the middle rather than out over a touchline.
  const apex = [0, 1].map((i) => 0.25 * from[i]! + 0.5 * control[i]! + 0.25 * to[i]!);
  const inside = PLAYBACK_CONFIG.curlInside;
  if (apex.some((n) => n < inside || n > 100 - inside)) {
    bend = -bend;
    control = controlOf(bend);
  }
  const chord = gap(from, to);
  const lift = r();
  const loft =
    Math.min(
      F.maxLoft,
      Math.max(0, chord - F.loftFrom) *
        F.loftPerUnit *
        st.loft *
        (lift < F.drivenShare ? F.drivenLoft : 0.7 + 0.6 * lift),
    ) + st.bobble;
  const legs = [gap(from, control), gap(control, to)];
  const motion = Math.max(
    F.minimumFlight,
    (chord + legs[0]! + legs[1]!) / 2 / speed,
    ((1 + st.ease) * 2 * Math.max(...legs)) / (PLAYBACK_CONFIG.speeds.max * F.launchHeadroom),
  );
  return { control, loft, ease: st.ease, duration: motion * SECONDS_PER_MOTION };
}

/** Lays a pre-feature entry's flights back to back so the last lands at `end`; returns them and the kick's time. */
function flights(legs: Leg[], from: Units, start: number, end: number, r: () => number) {
  let at = from;
  const shapes = legs.map((leg) => {
    const sh = { ...shape(at, leg.to, leg.style, leg.speed, r), from: at, leg };
    sh.duration *= PLAYBACK_CONFIG.preFeatureFlight;
    at = leg.to;
    return sh;
  });
  const total = shapes.reduce((sum, sh) => sum + sh.duration, 0);
  const scale = total > end - start ? (end - start) / total : 1;
  let t = end - total * scale;
  const kick = t;
  const out = shapes.map((sh, i): Flight => {
    const next = i === shapes.length - 1 ? end : t + sh.duration * scale;
    const g: Flight = {
      kind: 'flight',
      start: t,
      end: next,
      phase: sh.leg.phase,
      from: sh.from,
      to: sh.leg.to,
      control: sh.control,
      loft: sh.loft,
      ease: sh.ease,
    };
    t = next;
    return g;
  });
  return { out, kick };
}

/**
 * A candidate entry's ball and actor (→MATCH-12) from the engine's own knots at their recorded
 * times: the dead ball is carried back and set down, rests on its spot while the taker walks there,
 * the player on the ball carries it at his feet along its `carry` knots (in stride before his kick,
 * T426, or a carry of his own), and every flight lasts exactly from its kick to its touch,
 * reception or arrival — never shortened to fit. Returns where the ball is when the entry ends.
 */
function knotted(
  P: Period,
  k: number,
  start: number,
  ball: Units,
  add: (g: Segment) => void,
  r: () => number,
): Units {
  const e = P.entries[k]!;
  const end = e.elapsed;
  const knots = [...e.knots!].sort((a, b) => a.at - b.at);
  const legs = legsOf(e);
  const spot = e.spot ? units(e.spot) : undefined;
  const here =
    (k ? placeIn(P.entries[k - 1]!, e.side, e.idx) : undefined) ?? spot ?? units(e.from ?? e.ball);
  const hold = (from: number, to: number, at: Units): Hold => ({
    kind: 'hold',
    start: from,
    end: to,
    side: e.side,
    idx: e.idx,
    at,
  });
  const rest = (from: number, to: number, at: Units): Rest => ({
    kind: 'rest',
    start: from,
    end: to,
    at,
  });
  const route: [number, Units][] = [];
  // A carry of his own ends with the ball at his feet; an in-stride carry ends in his kick.
  const carrying =
    knots.some((knot) => knot.kind === 'carry') && !knots.some((knot) => knot.kind === 'kick');
  let cursor = start,
    at = ball,
    leg = 0,
    carried = false,
    placed: number | undefined;
  for (const knot of knots) {
    const t = clamp(knot.at, cursor, Math.max(cursor, end));
    const to = units(knot.ball);
    switch (knot.kind) {
      case 'retrieve':
        add(rest(cursor, t, at));
        break;
      case 'place': {
        // Carried back from where it went dead, then set down on the spot.
        const set = Math.max(cursor, t - GRID_BALL_CONFIG.placement);
        if (gap(at, to) > 0.05) {
          const sh = shape(at, to, 'reset', PLAYBACK_CONFIG.speeds.restart, r);
          add({ kind: 'flight', start: cursor, end: set, phase: 'restart', from: at, to, ...sh });
        }
        add(rest(set, t, to));
        placed = t;
        break;
      }
      case 'kick':
        if (spot) {
          // The taker walks to the spot at a bounded pace, after the ball is set down, and stands
          // on it when the restart is taken (its recorded kick, T359), else by his kick.
          const metres = hypot(
            ((spot[0] - here[0]) * PITCH.length) / 100,
            ((spot[1] - here[1]) * PITCH.width) / 100,
          );
          const ready = Math.min(t, e.kick?.elapsed ?? t);
          const arrive = clamp(
            start + metres / PLAYBACK_CONFIG.takerSpeed,
            Math.min(placed ?? start, ready),
            ready,
          );
          route.push([arrive, spot], [t, spot]);
          add(rest(cursor, t, spot));
        } else {
          // He kicks it where his carry took it, else where he received it.
          const kicked = carried ? to : here;
          route.push([t, kicked]);
          add(hold(cursor, t, kicked));
        }
        break;
      case 'carry':
        route.push([t, to]);
        // The ball at his feet up to this point of his carry.
        add(hold(cursor, t, at));
        carried = true;
        break;
      case 'tackle':
        add(hold(cursor, t, at));
        break;
      default:
        // A touch, reception or arrival: the end of a flight, or of a carry with the ball at his feet.
        if (carrying) {
          route.push([t, to]);
          add(hold(cursor, t, at));
        } else {
          const l = legs[Math.min(leg++, legs.length - 1)];
          const sh = shape(at, to, l?.style ?? 'pass', l?.speed ?? PLAYBACK_CONFIG.speeds.pass, r);
          add({
            kind: 'flight',
            start: cursor,
            end: t,
            phase: l?.phase ?? 'pass',
            from: at,
            to,
            ...sh,
          });
        }
    }
    at = to;
    cursor = t;
  }
  if (route.length)
    P.paths[k] = { side: e.side, idx: e.idx, at: here, arrive: start, kick: start, route };
  if (cursor < end) add(carrying ? hold(cursor, end, at) : rest(cursor, end, at));
  return at;
}

/** A period's timeline: the ball's segments and the actors' paths between snapshots. */
function timeline(p: 1 | 2 | 3 | 4, entries: TraceEntry[], r: () => number): Period {
  const first = entries[0]!;
  const P: Period = {
    p,
    start: first.elapsed - first.t,
    end: entries[entries.length - 1]!.elapsed,
    entries,
    times: entries.map((e) => e.elapsed),
    segments: [],
    starts: [],
    paths: [],
  };
  const add = (g: Segment) => {
    if (g.end <= g.start) return;
    P.segments.push(g);
    P.starts.push(g.start);
  };
  let ball: Units = [50, 50];
  entries.forEach((e, k) => {
    if (e.outcome === 'incident') return;
    const start = k ? entries[k - 1]!.elapsed : P.start;
    if (e.knots?.length) {
      ball = knotted(P, k, start, ball, add, r);
      return;
    }
    const end = e.elapsed;
    const legs = legsOf(e);
    const hold = (from: number, to: number, at: Units): Hold => ({
      kind: 'hold',
      start: from,
      end: to,
      side: e.side,
      idx: e.idx,
      at,
    });
    if (e.spot) {
      const spot = units(e.spot);
      const kickable = Math.min(end, start + (e.dead ?? 0));
      const walk = Math.min(kickable - start, PLAYBACK_CONFIG.takerWalk * SECONDS_PER_MOTION);
      if (kickable > start) {
        // The ball is brought back to its spot and rests there until the restart is taken.
        let rest = start;
        if (gap(ball, spot) > 0.05) {
          rest = start + Math.min((kickable - start) / 2, walk);
          const sh = shape(ball, spot, 'reset', PLAYBACK_CONFIG.speeds.restart, r);
          add({ kind: 'flight', start, end: rest, phase: 'restart', from: ball, to: spot, ...sh });
        }
        add({ kind: 'rest', start: rest, end: kickable, at: spot });
      }
      const { out, kick } = flights(legs, spot, kickable, end, r);
      P.paths[k] = { side: e.side, idx: e.idx, at: spot, arrive: start + walk, kick };
      add(hold(kickable, kick, spot));
      out.forEach(add);
    } else if (!legs.length) add(hold(start, end, placeIn(e, e.side, e.idx) ?? units(e.ball)));
    else {
      const here =
        (k ? placeIn(entries[k - 1]!, e.side, e.idx) : undefined) ?? units(e.from ?? e.ball);
      const { out, kick } = flights(legs, here, start, end, r);
      P.paths[k] = { side: e.side, idx: e.idx, at: here, arrive: start, kick };
      add(hold(start, kick, here));
      out.forEach(add);
    }
    ball = legs.length ? units(e.to!) : (placeIn(e, e.side, e.idx) ?? units(e.ball));
  });
  return P;
}

/** The frame label of an entry (design §10.2). */
function labelOf(e: TraceEntry): string {
  if (e.outcome === 'incident') return INCIDENT_LABEL[e.action] ?? '';
  if (e.result === 'goal') return '골';
  if (e.result === 'save') return '선방';
  if (e.result) return '슛';
  if (e.outcome === 'foul') return '파울';
  if (e.outcome === 'offside') return '오프사이드';
  if (e.spot) return RESTART_LABEL[e.action] ?? '패스';
  if (e.outcome === 'intercepted') return '인터셉트';
  if (e.outcome === 'tackled') return '태클';
  switch (e.action) {
    case 'cross':
      return '크로스';
    case 'cutBack':
      return '컷백';
    case 'carry':
    case 'holdUp':
      return '운반';
    case 'takeOn':
      return '돌파';
    case 'clearance':
      return '걷어내기';
    default:
      return '패스';
  }
}

/** How much a minute's last entry of this label should lead it: goals, then sendings-off, then other incidents. */
function weightOf(label: string): number {
  return label === '골' ? 3 : label === '퇴장' ? 2 : NOTABLE.has(label) ? 1 : 0;
}

function kindOf(e: TraceEntry): MatchEvent['kind'] {
  if (e.outcome === 'incident')
    return e.action === 'whistle'
      ? 'whistle'
      : e.action === 'sub' || e.action === 'injury'
        ? e.action
        : 'card';
  if (e.outcome === 'foul') return 'foul';
  if (e.outcome === 'offside') return 'offside';
  if (e.spot) return e.action === 'kickoff' ? 'kickoff' : 'restart';
  return e.action as MatchEvent['kind'];
}

/**
 * The minute label of second `t` of a period (design §10.2): its match minute, and the added minute
 * once past the period's length, at most the period's last frame when its `added` minutes are known.
 * Incidents are stamped with it, so each carries the label of the frame that shows it (→MATCH-24).
 */
export function stampAt(
  period: 1 | 2 | 3 | 4,
  t: number,
  added = Infinity,
): { minute: number; added?: number } {
  const length = LENGTH[period - 1]!;
  const m = Math.max(0, Math.min(Math.floor(t / 60), length + added - 1)) + 1;
  return {
    minute: OFFSET[period - 1]! + Math.min(m, length),
    ...(m > length ? { added: m - length } : {}),
  };
}

/**
 * Sorted match seconds in (`from`, `to`], plus `from` itself when `open`, at least `spacing` apart:
 * a candidate minute's sample or ball-knot times. `to` and the `keep` times (restarts' kicks,
 * T359) are always kept, each replacing a time too close before it.
 */
function instants(
  times: number[],
  from: number,
  to: number,
  open: boolean,
  spacing = 0,
  keep: readonly number[] = [],
) {
  const kept = new Set([to, ...keep]);
  const out: number[] = [];
  for (const t of [...times, ...keep, to].sort((a, b) => a - b)) {
    if (!(t > from || (open && t === from)) || t > to) continue;
    const last = out.at(-1);
    if (last === undefined || t - last > spacing) out.push(t);
    else if (kept.has(t) && last !== t) {
      if (kept.has(last)) out.push(t);
      else out[out.length - 1] = t;
    }
  }
  return out;
}

/**
 * One frame per match minute of each period, added minutes included (design §10.2). `seed` is the
 * world seed; the flights' bend and loft come from `${seed}:${fixture}:ball-decisions`.
 *
 * Candidate traces (`setup.model`, →MATCH-12, WEB-32) carry explicit times instead of a pace: each
 * minute starts 60 s after the one before (`startSeconds`), players are sampled at their snapshots
 * and waypoints (at least `sampleSpacing` apart, every restart's recorded kick kept, T359) and at
 * the minute's end, the ball track adds each knot at its own time (`ballTimes`), and `pace` is
 * neutral. A period's last action running past its final minute is counted in that minute but not
 * drawn, since a minute spans 60 s (`frameTimeIssues`).
 */
export function buildFrames(result: GridResult, setup: GridSetup, seed: string): MatchFrame[] {
  const trace = result.trace;
  if (!trace?.length) return [];
  const r = random(`${seed}:${setup.f.id}:ball-decisions`);
  const ids = setup.rosters.map((roster) => roster.map((p) => p.id)) as [string[], string[]];
  const names = setup.rosters.map((roster) => roster.map((p) => p.name)) as [string[], string[]];
  const id = (side: 0 | 1, idx: number | undefined) =>
    idx === undefined || idx < 0 ? '' : (ids[side][idx] ?? '');
  const byPeriod = new Map<1 | 2 | 3 | 4, TraceEntry[]>();
  for (const e of trace) {
    const list = byPeriod.get(e.period) ?? [];
    list.push(e);
    byPeriod.set(e.period, list);
  }
  const candidate = setup.model !== undefined;
  const frames: MatchFrame[] = [];
  const weights: number[] = [];
  let lead = { action: '패스', player: 0 };
  for (const [p, entries] of [...byPeriod].sort((a, b) => a[0] - b[0])) {
    const P = timeline(p, entries, r);
    // Breakpoints: player snapshots and, on a candidate trace, waypoints; on a pre-feature trace,
    // where each ball segment starts (an actor stays on the ball until his kick, then heads on).
    const moves = candidate
      ? [...P.times, ...P.paths.flatMap((path) => path?.route?.map(([t]) => t) ?? [])]
      : [...P.times, ...P.starts];
    // Every restart's recorded kick is drawn as its own sample, however close (T359), and so is the
    // kick that ends an in-stride carry, so the page draws the carry (T426); on a pre-feature trace
    // every snapshot is, so a receiver is drawn where the ball reaches him.
    const kicks = candidate
      ? entries.flatMap((e, k) => {
          const kick = k ? kickAfter(entries[k - 1]!, e) : undefined;
          const knots = e.knots ?? [];
          const stride = knots.findIndex(
            (knot, i) => knot.kind === 'kick' && knots[i - 1]?.kind === 'carry',
          );
          return [...(kick ? [kick.elapsed] : []), ...(stride > 0 ? [knots[stride]!.at] : [])];
        })
      : P.times;
    const knots = candidate ? entries.flatMap((e) => e.knots?.map((knot) => knot.at) ?? []) : [];
    let minuteStart = P.start;
    const mirror = (u: Units): Units => (p % 2 === 0 ? [100 - u[0], 100 - u[1]] : u);
    const length = LENGTH[p - 1]!;
    const minutes =
      length +
      (result.record.added?.[p - 1] ?? Math.max(0, Math.ceil((P.end - P.start) / 60) - length));
    // The next touch's side (did this one lose the ball?) and the previous touch (where a shot came from).
    const next: (0 | 1 | undefined)[] = [];
    const prev: (TraceEntry | undefined)[] = [];
    let seen: TraceEntry | undefined;
    entries.forEach((e, k) => {
      prev[k] = seen;
      if (e.outcome !== 'incident') seen = e;
    });
    let after: 0 | 1 | undefined;
    for (let k = entries.length - 1; k >= 0; k--) {
      next[k] = after;
      if (entries[k]!.outcome !== 'incident') after = entries[k]!.side;
    }
    const minuteOf = (e: TraceEntry) => Math.min(minutes - 1, Math.floor(e.t / 60));
    let k = 0;
    for (let m = 0; m < minutes; m++) {
      const start = candidate ? minuteStart : P.start + 60 * m;
      if (candidate) minuteStart += 60;
      const end = m === minutes - 1 ? Math.max(P.end, start + 60) : start + 60;
      const span = end - start;
      // Candidate minutes draw exactly their 60 s; pre-feature ones spread their span over 60 s.
      const drawn = candidate ? start + 60 : end;
      const drawnAt = (time: number) => (candidate ? time : start + ((time - start) * 60) / span);
      const sampleTimes = instants(
        moves,
        start,
        drawn,
        m === 0,
        candidate ? PLAYBACK_CONFIG.sampleSpacing : PLAYBACK_CONFIG.preFeatureSpacing,
        kicks,
      );
      const trackTimes = instants(
        [
          ...(candidate ? knots : P.starts),
          ...Array.from(
            { length: PLAYBACK_CONFIG.trackPerMinute },
            (_, i) => start + ((candidate ? 60 : span) * (i + 1)) / PLAYBACK_CONFIG.trackPerMinute,
          ),
        ],
        start,
        drawn,
        m === 0,
      );
      const mine: number[] = [];
      for (; k < entries.length && minuteOf(entries[k]!) <= m; k++)
        if (!(entries[k]!.action === 'whistle' && entries[k]!.t === 0)) mine.push(k);

      // Players and the ball through the minute.
      let before = new Map<number, Units>();
      let previous = start;
      const samples: MatchMotionSample[] = [];
      // A minute's first time only seeds velocities, except a period's opening, which is drawn.
      if (sampleTimes[0] !== start) sampleTimes.unshift(start);
      const drawFirst = m === 0;
      for (let j = 0; j < sampleTimes.length; j++) {
        const time = sampleTimes[j]!;
        const motionStep = Math.max(1e-9, time - previous) / SECONDS_PER_MOTION;
        previous = time;
        const ball = ballAt(P, time);
        const snap = shownAt(P, time);
        const now = new Map<number, Units>();
        const players = ([0, 1] as const).map((side) => {
          const list: PlayerMotion[] = [];
          for (let slot = 0; slot < 11; slot++) {
            const idx = snap.slots[side * 11 + slot]!;
            if (idx < 0) continue;
            const position = mirror(positionAt(P, side, idx, time) ?? placeIn(snap, side, idx)!);
            now.set(side * 64 + idx, position);
            const was = before.get(side * 64 + idx);
            const at = (side * 11 + slot) * 2;
            const holder = ball.holder?.[0] === side && ball.holder[1] === idx;
            const state = MOTION_STATES[snap.states[side * 11 + slot]!] ?? 'shape';
            const intention = snap.intentions?.[side * 11 + slot];
            // The snapshot's carrier aims where he stands; once the ball has left him (his kick,
            // T426) he shows his intention's target instead.
            const left = state === 'carry' && !holder && intention && !('end' in intention);
            const target = left
              ? mirror(units(intention.target))
              : Number.isFinite(snap.targets[at])
                ? mirror(units([snap.targets[at]!, snap.targets[at + 1]!]))
                : position;
            list.push({
              id: id(side, idx),
              position,
              velocity: was
                ? [(position[0] - was[0]) / motionStep, (position[1] - was[1]) / motionStep]
                : [0, 0],
              state: holder ? 'carry' : state === 'carry' ? 'support' : state,
              intent: [clamp(target[0], 0, 100), clamp(target[1], 0, 100)],
              ...(intention ? { intention: observed(intention, side, mirror, id) } : {}),
            });
          }
          return list;
        }) as [PlayerMotion[], PlayerMotion[]];
        before = now;
        if (j === 0 && !drawFirst) continue;
        samples.push({
          elapsedSeconds: drawnAt(time),
          ball: mirror(ball.at),
          players,
          phase: ball.phase,
          ...(ball.holder ? { ownerId: id(ball.holder[0], ball.holder[1]) } : {}),
        });
      }
      const ballTrack: [number, number, number][] = [];
      for (const time of trackTimes) {
        const b = ballAt(P, time);
        const g = mirror(b.at);
        ballTrack.push([tenth(g[0]), tenth(g[1]), tenth(b.h)]);
      }
      // Who has the ball through the minute (→WEB-95): each change at its seconds into the minute.
      const holders: [number, string][] = [];
      const change = (time: number, who: string) => {
        const t = tenth(clamp(drawnAt(time) - start, 0, 60));
        // A later change at the same tenth replaces the earlier one.
        if (holders.at(-1)?.[0] === t) holders.pop();
        if (holders.at(-1)?.[1] !== who) holders.push([t, who]);
      };
      change(start, '');
      for (let i = Math.max(0, lastAt(P.starts, start)); i < P.segments.length; i++) {
        const g = P.segments[i]!;
        if (g.start >= drawn) break;
        if (g.end <= start) continue;
        change(Math.max(start, g.start), g.kind === 'hold' ? id(g.side, g.idx) : '');
        // Nothing holds the ball between segments (an incident's stoppage).
        if (P.segments[i + 1]?.start !== g.end) change(g.end, '');
      }

      // Counts at the minute's end.
      const last = P.entries[Math.max(0, lastAt(P.times, end))]!;
      const totals = last.totals;
      const at = stampAt(p, 60 * m);
      const minute = at.minute;
      const metrics = ([0, 1] as const).map((side) => {
        const line: Metrics = new Array(M.possession + 1).fill(0);
        for (let i = 0; i < M.minutes; i++) line[i] = totals[side * RUNNING + i] ?? 0;
        line[M.minutes] = minute;
        return line;
      }) as [Metrics, Metrics];
      const held = [totals[M.minutes] ?? 0, totals[RUNNING + M.minutes] ?? 0];
      const home =
        held[0]! + held[1]! > 0
          ? Math.round((minute * held[0]!) / (held[0]! + held[1]!))
          : Math.round(minute / 2);
      metrics[0][M.possession] = home;
      metrics[1][M.possession] = minute - home;

      // The side that had the ball longest, and the entry that leads the minute.
      const share = [0, 0];
      entries.forEach((e, i) => {
        if (e.outcome === 'incident') return;
        const from = i ? entries[i - 1]!.elapsed : P.start;
        share[e.side]! += Math.max(0, Math.min(e.elapsed, end) - Math.max(from, start));
      });
      let leader: TraceEntry | undefined;
      for (const i of mine) {
        const e = entries[i]!;
        if (e.action === 'whistle') continue;
        if (!leader || weightOf(labelOf(e)) >= weightOf(labelOf(leader))) leader = e;
      }
      if (leader) {
        const i = entries.indexOf(leader);
        const slot = [leader, entries[i - 1]]
          .map((e) => (e ? slotIn(e, leader!.side, leader!.idx) : -1))
          .find((s) => s >= 0);
        lead = { action: labelOf(leader), player: slot ?? 0 };
      }

      const events = mine.map((i): MatchEvent => {
        const e = entries[i]!;
        const kind = kindOf(e);
        const incident = e.outcome === 'incident';
        const fouler = kind === 'foul' ? e.by : undefined;
        const side = fouler ? fouler[0] : e.side;
        const actor =
          fouler !== undefined
            ? id(fouler[0], fouler[1])
            : kind === 'offside'
              ? id(e.side, e.receiver ?? e.idx)
              : id(e.side, e.idx);
        const origin = e.from ?? e.spot;
        const from = mirror(
          origin
            ? units(origin)
            : (placeIn(e, e.side, e.idx) ??
                (prev[i] ? placeIn(prev[i]!, e.side, e.idx) : undefined) ??
                units(e.ball)),
        );
        const back = prev[i];
        const ballSide =
          e.result &&
          !e.shotAt &&
          !e.spot &&
          back &&
          back.side === e.side &&
          (back.from ?? back.spot)
            ? attackFrame(e.side, (back.from ?? back.spot)!)[1] < PITCH.width / 2
              ? 'left'
              : 'right'
            : undefined;
        const ev: MatchEvent = {
          t: tenth(clamp(candidate ? e.elapsed - start : ((e.elapsed - start) / span) * 60, 0, 60)),
          kind,
          side,
          actor,
          from,
          to: e.to ? mirror(units(e.to)) : from,
          text: describe(e, { names, ...(ballSide ? { ballSide } : {}) }),
        };
        if (fouler) ev.opponent = id(...(e.on ?? ([e.side, e.idx] as Ref)));
        else if (kind === 'sub') ev.receiver = id(e.side, e.other);
        else if (kind !== 'offside' && !incident) {
          if (e.receiver !== undefined) ev.receiver = id(e.side, e.receiver);
          if (e.by && e.by[0] !== e.side) ev.opponent = id(e.by[0], e.by[1]);
        }
        if (!incident && kind !== 'foul' && kind !== 'offside' && (!e.result || e.shotAt))
          ev.ok =
            e.outcome === 'complete' ||
            e.shotAt !== undefined ||
            (e.outcome === 'held' && !e.by) ||
            (e.outcome === 'loose' && e.receiver !== undefined);
        if (!incident && kind !== 'foul' && e.result !== 'goal' && next[i] !== undefined)
          ev.lost = next[i] !== e.side;
        if (e.result) ev.outcome = e.result;
        if (e.spot && e.action !== 'dropBall')
          ev.restart = (e.action === 'indirectFreeKick' ? 'freeKick' : e.action) as NonNullable<
            MatchEvent['restart']
          >;
        if (kind === 'card') ev.card = e.action === 'yellow' ? 'yellow' : 'red';
        if (e.xg !== undefined) ev.xg = hundredth(e.xg);
        if (e.header) ev.header = true;
        return ev;
      });

      // Pace (design §10.4).
      const touches = mine.map((i) => entries[i]!).filter((e) => e.outcome !== 'incident');
      const busy = mine.some((i) => {
        const e = entries[i]!;
        return (
          e.result !== undefined ||
          e.action === 'penalty' ||
          e.action === 'corner' ||
          e.action === 'red' ||
          e.action === 'secondYellow' ||
          ((e.action === 'freeKick' || e.action === 'indirectFreeKick') &&
            e.spot !== undefined &&
            bandOf(attackFrame(e.side, e.spot)[0]) >= 5)
        );
      });
      const quiet =
        touches.length > 0 &&
        touches.every(
          (e) =>
            !e.spot && e.from !== undefined && attackFrame(e.side, e.from)[0] < PITCH.length / 2,
        );
      const W = PLAYBACK_CONFIG.pace;
      weights.push(busy ? W.busy : quiet ? W.quiet : W.normal);

      const onPitch = ([0, 1] as const).map((side) => {
        const list: string[] = [];
        for (let slot = 0; slot < 11; slot++) {
          const idx = last.slots[side * 11 + slot]!;
          if (idx >= 0) list.push(id(side, idx));
        }
        return list;
      }) as [string[], string[]];
      const final = samples[samples.length - 1]!;
      frames.push({
        minute,
        score: { home: totals[M.goals] ?? 0, away: totals[RUNNING + M.goals] ?? 0 },
        metrics,
        ball: final.ball,
        side: share[1]! > share[0]! ? 1 : share[0]! > share[1]! ? 0 : last.side,
        player: lead.player,
        action: lead.action,
        elapsedSeconds: drawn,
        players: final.players,
        motion: samples,
        events,
        xg: [
          hundredth(totals[M.minutes + 1] ?? 0),
          hundredth(totals[RUNNING + M.minutes + 1] ?? 0),
        ],
        ballTrack,
        startSeconds: start,
        ballTimes: trackTimes.map(drawnAt),
        holders,
        period: p,
        label: at.added ? `${at.minute}+${at.added}` : String(at.minute),
        pace: candidate ? NEUTRAL_FRAME_PACE : 0,
        onPitch,
      });
    }
  }
  // Pre-feature frames keep their weights; the presentation clock no longer reads them (→WEB-32).
  if (!candidate) {
    const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    frames.forEach((f, i) => (f.pace = weights[i]! / mean));
  }
  return frames;
}

/** The ball at match second `time` of a period, in that period's units: for tests and tuning tools. */
export function ballPath(result: GridResult, setup: GridSetup, seed: string) {
  const r = random(`${seed}:${setup.f.id}:ball-decisions`);
  const periods = new Map<number, Period>();
  for (const p of [1, 2, 3, 4] as const) {
    const entries = (result.trace ?? []).filter((e) => e.period === p);
    if (entries.length) periods.set(p, timeline(p, entries, r));
  }
  return (period: 1 | 2 | 3 | 4, time: number) => {
    const P = periods.get(period)!;
    const b = ballAt(P, time);
    const at: Units = period % 2 === 0 ? [100 - b.at[0], 100 - b.at[1]] : b.at;
    return { at, h: b.h, holder: b.holder };
  };
}
