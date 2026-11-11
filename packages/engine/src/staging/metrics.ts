// Staging metrics: a playback judged by numbers before anyone watches it. Every metric is a pure
// function of a `Playback` and `STAGING_CONFIG` (ARCH-5); nothing here imports `stage/`. Thresholds
// live in `STAGING_CONFIG.limits`. A share with an empty denominator is 1 and passes; a rate with an
// empty denominator is 0 and passes; a mean or median over no frames is 0 and passes.
import { STAGING_CONFIG } from './config';
import { BOX_X, BOX_Y, GOAL_Y, HALFWAY, inPitch, PITCH, toAttack } from './pitch';
import { offsideLineX } from './places';
import {
  isShotLike,
  PASS_KINDS,
  RESTART_KINDS,
  type Beat,
  type Frame,
  type Playback,
  type PlayerSpec,
  type RoleId,
  type StageEvent,
  type StageEventKind,
  type TeamId,
  type Vec,
} from './types';
import { dist } from './vec';

export interface Metric {
  id: string;
  value: number;
  limit: string;
  pass: boolean;
  detail?: string;
}

export const METRIC_IDS: readonly string[] = [
  'duration',
  'kinematics.maxStep',
  'kinematics.outside',
  'ball.maxSpeed',
  'ball.ownerDistance',
  'events.reception',
  'events.contest',
  'events.recastRate',
  'events.stretchRate',
  'offside.consistency',
  'shape.swarm',
  'shape.teamLength.H',
  'shape.teamLength.A',
  'shape.spacing',
  'role.invertedFullBack.inside',
  'role.invertedFullBack.pivot',
  'role.falseNine.drop',
  'role.poacher.shoulder',
  'script.backPassReason',
  'stage.pressVisible',
  'score.consistent',
  'events.shortKick',
  'shape.huddle',
  'shape.huddleLongest',
  'motion.restarts',
  'motion.startSync',
  'motion.speedSync',
  'turn.reverse',
  'turn.run',
  'turn.counterRun',
  'mark.near',
];

const L = STAGING_CONFIG.limits;
const { motion, stage, tick } = STAGING_CONFIG;
/** The fastest a player may move between frames: a full sprint plus the lunge, with slack. */
export const MAX_STEP_SPEED = motion.sprintBase + motion.sprintPerPace + stage.lunge + 0.2;
/** How far beyond a line an offside position must be. */
const OFFSIDE_EPS = 0.05;
const CONTESTS: readonly StageEventKind[] = ['intercept', 'tackle', 'save', 'block'];
const CONTESTED: readonly StageEventKind[] = ['intercept', 'tackle', 'foul', 'block'];

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const num = (v: number): string => String(round3(v));

const metric = (
  id: string,
  value: number,
  limit: string,
  pass: boolean,
  detail?: string,
): Metric =>
  detail === undefined
    ? { id, value: round3(value), limit, pass }
    : { id, value: round3(value), limit, pass, detail };

const atMost = (id: string, value: number, max: number, detail?: string): Metric =>
  metric(id, value, `<= ${num(max)}`, value <= max, detail);
const atLeast = (id: string, value: number, min: number, detail?: string): Metric =>
  metric(id, value, `>= ${num(min)}`, value >= min, detail);
const none = (id: string, count: number, detail?: string): Metric =>
  metric(id, count, '= 0', count === 0, detail);

/** A share judged against a bound; an empty denominator gives 1 and passes. */
const share = (
  id: string,
  hits: number,
  total: number,
  bound: number,
  dir: 'min' | 'max',
): Metric => {
  const detail = `n=${hits}/${total}`;
  if (total === 0) {
    return metric(id, 1, `${dir === 'min' ? '>=' : '<='} ${num(bound)}`, true, `${detail} empty`);
  }
  const value = hits / total;
  return dir === 'min' ? atLeast(id, value, bound, detail) : atMost(id, value, bound, detail);
};

/** A rate judged against a maximum; an empty denominator gives 0 and passes. */
const rate = (id: string, hits: number, total: number, max: number): Metric =>
  atMost(id, total === 0 ? 0 : hits / total, max, `n=${hits}/${total}`);

/** A mean judged against a bound; no samples give 0 and pass. */
const mean = (
  id: string,
  samples: readonly number[],
  bound: number,
  dir: 'min' | 'max',
): Metric => {
  const detail = `frames=${samples.length}`;
  if (samples.length === 0) {
    return metric(id, 0, `${dir === 'min' ? '>=' : '<='} ${num(bound)}`, true, `${detail} empty`);
  }
  const value = samples.reduce((a, b) => a + b, 0) / samples.length;
  return dir === 'min' ? atLeast(id, value, bound, detail) : atMost(id, value, bound, detail);
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const pos = (frame: Frame, i: number): Vec => [frame.p[2 * i], frame.p[2 * i + 1]];
const ballOf = (frame: Frame): Vec => [frame.ball[0], frame.ball[1]];
const positions = (frame: Frame): Vec[] =>
  Array.from({ length: frame.p.length / 2 }, (_, i) => pos(frame, i));
const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);

/** A turnover in open play: the frame index the other side has the ball from, and its kind. */
interface Turnover {
  f: number;
  counter: boolean;
}

/** Everything the metrics read about one playback, worked out once. */
interface Context {
  pb: Playback;
  beatOf: Map<number, Beat>;
  live: Frame[];
  outfield: [number[], number[]];
  /** Both teams' outfield players. */
  all: number[];
  /** Open-play frame indexes (from 1: live, no set piece, a beat that is no restart), ascending. */
  open: number[];
  openSet: Set<number>;
  openMinutes: number;
  turnovers: Turnover[];
  frameAt: (event: StageEvent) => Frame;
  label: (index: number) => string;
  /** Player `i`'s speed and x-velocity at frame `f` (from frame `f - 1`), in m/s; `f >= 1`. */
  speed: (f: number, i: number) => number;
  vx: (f: number, i: number) => number;
}

function contextOf(pb: Playback): Context {
  const { frames } = pb;
  const last = frames.length - 1;
  const beatOf = new Map(pb.beats.map((b) => [b.index, b]));
  const outfieldOf = (team: TeamId): number[] =>
    pb.fixture.teams[team].players.filter((p) => p.slot !== 0).map((p) => p.index);
  const outfield: [number[], number[]] = [outfieldOf(0), outfieldOf(1)];
  const open: number[] = [];
  for (let f = 1; f < frames.length; f++) {
    const frame = frames[f];
    const beat = beatOf.get(frame.beat);
    if (!frame.live || frame.phase === 'setPiece' || !beat || RESTART_KINDS.includes(beat.kind)) {
      continue;
    }
    open.push(f);
  }
  const openSet = new Set(open);
  const before = Math.round(L.turn.before / tick);
  const after = Math.round(Math.max(L.turn.within, L.turn.runAt) / tick);
  const turnovers: Turnover[] = open
    .filter(
      (f) =>
        frames[f].team !== frames[f - 1].team &&
        frames[f - 1].live &&
        f - before >= 1 &&
        f + after <= last,
    )
    .map((f) => ({ f, counter: frames[f].phase === 'counter' }));
  return {
    pb,
    beatOf,
    live: frames.filter((f) => f.live),
    outfield,
    all: [...outfield[0], ...outfield[1]],
    open,
    openSet,
    openMinutes: (open.length * tick) / 60,
    turnovers,
    frameAt: (event) => frames[Math.min(last, Math.max(0, Math.round(event.t * pb.hz)))],
    label: (index) => {
      const player = pb.fixture.players[index];
      return player ? `${pb.fixture.teams[player.team].code}${player.number}` : String(index);
    },
    speed: (f, i) => dist(pos(frames[f - 1], i), pos(frames[f], i)) / tick,
    vx: (f, i) => (frames[f].p[2 * i] - frames[f - 1].p[2 * i]) / tick,
  };
}

function kinematics(c: Context): Metric[] {
  const { frames } = c.pb;
  let best = 0;
  let where = '';
  let outside = 0;
  let ballFast = 0;
  let ballBest = 0;
  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    for (let i = 0; i < frame.p.length / 2; i++) {
      if (!inPitch(pos(frame, i), -L.outside)) outside += 1;
    }
    if (f === 0) continue;
    const prev = frames[f - 1];
    for (let i = 0; i < frame.p.length / 2; i++) {
      const speed = dist(pos(prev, i), pos(frame, i)) / tick;
      if (speed > best) {
        best = speed;
        where = `frame=${f} player=${c.label(i)}`;
      }
    }
    const ballSpeed = dist(ballOf(prev), ballOf(frame)) / tick;
    if (ballSpeed > L.ballSpeed) ballFast += 1;
    ballBest = Math.max(ballBest, ballSpeed);
  }
  return [
    atMost('kinematics.maxStep', best, MAX_STEP_SPEED, where || undefined),
    none('kinematics.outside', outside),
    none('ball.maxSpeed', ballFast, `max=${num(ballBest)}`),
  ];
}

function ownerDistance(c: Context): Metric {
  let held = 0;
  let near = 0;
  for (const frame of c.pb.frames) {
    if (frame.owner < 0) continue;
    held += 1;
    if (dist(ballOf(frame), pos(frame, frame.owner)) <= L.ownerDistance) near += 1;
  }
  return share('ball.ownerDistance', near, held, L.ownerShare, 'min');
}

/** Events of `kinds` whose `other` stands within `range` of the event's ball in its frame. */
function atEvent(
  c: Context,
  kinds: readonly StageEventKind[],
  range: number,
): { hits: number; total: number } {
  let hits = 0;
  let total = 0;
  for (const e of c.pb.events) {
    if (!kinds.includes(e.kind)) continue;
    total += 1;
    if (e.other !== undefined && dist(pos(c.frameAt(e), e.other), e.at) <= range) hits += 1;
  }
  return { hits, total };
}

function events(c: Context): Metric[] {
  const reception = atEvent(c, ['receive'], L.reception);
  const contest = atEvent(c, CONTESTS, L.contest);
  const contested = c.pb.events.filter((e) => CONTESTED.includes(e.kind)).length;
  const recast = c.pb.events.filter((e) => e.recast).length;
  const stretch = c.pb.events.filter((e) => e.stretch).length;
  return [
    share('events.reception', reception.hits, reception.total, L.receptionShare, 'min'),
    share('events.contest', contest.hits, contest.total, L.contestShare, 'min'),
    rate('events.recastRate', recast, contested, L.recastRate),
    rate('events.stretchRate', stretch, contested, L.stretchRate),
  ];
}

/** True when `receiver` is beyond halfway, the ball and the offside line `team` plays against. */
function inOffsidePosition(c: Context, frame: Frame, team: TeamId, receiver: number): boolean {
  const rx = toAttack(team, pos(frame, receiver))[0];
  const bx = toAttack(team, ballOf(frame))[0];
  const line = offsideLineX(c.pb.fixture, positions(frame), team);
  return rx > HALFWAY + OFFSIDE_EPS && rx > bx + OFFSIDE_EPS && rx > line + OFFSIDE_EPS;
}

function offsideConsistency(c: Context): Metric {
  let kicks = 0;
  let onsideCalls = 0;
  let missedCalls = 0;
  for (const e of c.pb.events) {
    if (e.kind !== 'kick') continue;
    const beat = c.beatOf.get(e.beat);
    if (!beat || !PASS_KINDS.includes(beat.kind) || isShotLike(beat)) continue;
    if (beat.receiver === undefined) continue;
    kicks += 1;
    const offside = inOffsidePosition(c, c.frameAt(e), beat.team, beat.receiver);
    if (beat.outcome === 'offside') {
      if (!offside) onsideCalls += 1;
    } else if (beat.kind === 'pass' && offside) {
      missedCalls += 1;
    }
  }
  return none(
    'offside.consistency',
    onsideCalls + missedCalls,
    `kicks=${kicks} onsideCalls=${onsideCalls} missedCalls=${missedCalls}`,
  );
}

/** The ball inside either penalty area (world frame): x up to 16.5 or from 88.5, y inside `BOX_Y`. */
const inEitherBox = (b: Vec): boolean =>
  (b[0] <= PITCH.length - BOX_X || b[0] >= BOX_X) && b[1] >= BOX_Y[0] && b[1] <= BOX_Y[1];

function shape(c: Context): Metric[] {
  const all = [...c.outfield[0], ...c.outfield[1]];
  let open = 0;
  let swarms = 0;
  let spaced = 0;
  let crowded = 0;
  const spreads: [number[], number[]] = [[], []];
  for (const frame of c.live) {
    for (const team of [0, 1] as const) {
      const xs = c.outfield[team].map((i) => toAttack(team, pos(frame, i))[0]);
      spreads[team].push(Math.max(...xs) - Math.min(...xs));
    }
    if (frame.phase === 'setPiece') continue;
    spaced += 1;
    if (tooClose(frame, c.outfield)) crowded += 1;
    const ball = ballOf(frame);
    if (inEitherBox(ball)) continue;
    open += 1;
    const near = all.filter((i) => dist(pos(frame, i), ball) <= L.swarm.radius).length;
    if (near >= L.swarm.count) swarms += 1;
  }
  const [lo, hi] = L.teamLength;
  const length = (team: TeamId): Metric => {
    const id = `shape.teamLength.${c.pb.fixture.teams[team].code}`;
    const values = spreads[team];
    if (values.length === 0) return metric(id, 0, `${lo}..${hi}`, true, 'frames=0 empty');
    const value = median(values);
    return metric(id, value, `${lo}..${hi}`, value >= lo && value <= hi, `frames=${values.length}`);
  };
  return [
    share('shape.swarm', swarms, open, L.swarm.share, 'max'),
    length(0),
    length(1),
    share('shape.spacing', crowded, spaced, L.spacing.share, 'max'),
  ];
}

function tooClose(frame: Frame, outfield: readonly (readonly number[])[]): boolean {
  for (const team of outfield) {
    for (let a = 0; a < team.length; a++) {
      for (let b = a + 1; b < team.length; b++) {
        if (dist(pos(frame, team[a]), pos(frame, team[b])) < L.spacing.distance) return true;
      }
    }
  }
  return false;
}

const holder = (c: Context, role: RoleId): PlayerSpec | undefined =>
  c.pb.fixture.players.find((p) => p.role === role);

/** Live frames the team is in possession, in one of `phases`. */
const possessed = (c: Context, team: TeamId, phases: readonly Frame['phase'][]): Frame[] =>
  c.live.filter((f) => f.team === team && phases.includes(f.phase));

function roles(c: Context): Metric[] {
  const out: Metric[] = [];
  const ifb = holder(c, 'invertedFullBack');
  if (ifb) {
    const team = c.pb.fixture.teams[ifb.team].players;
    const otherBack =
      team.find((p) => p.slot === (ifb.slot === 1 ? 4 : 1) && p.index !== ifb.index) ??
      team.find((p) => (p.position === 'LB' || p.position === 'RB') && p.index !== ifb.index);
    const pivot = team.find((p) => p.slot === 5);
    const frames = possessed(c, ifb.team, ['buildUp', 'progression']);
    const inside = otherBack
      ? frames.map(
          (f) =>
            Math.abs(pos(f, otherBack.index)[1] - GOAL_Y) - Math.abs(pos(f, ifb.index)[1] - GOAL_Y),
        )
      : [];
    const gap = pivot
      ? frames.map((f) =>
          Math.abs(
            toAttack(ifb.team, pos(f, ifb.index))[0] - toAttack(ifb.team, pos(f, pivot.index))[0],
          ),
        )
      : [];
    out.push(mean('role.invertedFullBack.inside', inside, L.ifbInside, 'min'));
    out.push(mean('role.invertedFullBack.pivot', gap, L.ifbPivotGap, 'max'));
  }
  const shoulderGap = (player: PlayerSpec, phases: readonly Frame['phase'][]): number[] =>
    possessed(c, player.team, phases).map(
      (f) =>
        offsideLineX(c.pb.fixture, positions(f), player.team) -
        toAttack(player.team, pos(f, player.index))[0],
    );
  const nine = holder(c, 'falseNine');
  if (nine)
    out.push(
      mean('role.falseNine.drop', shoulderGap(nine, ['progression']), L.falseNineDrop, 'min'),
    );
  const poacher = holder(c, 'poacher');
  if (poacher) {
    out.push(
      mean(
        'role.poacher.shoulder',
        shoulderGap(poacher, ['progression', 'finalThird']),
        L.poacherGap,
        'max',
      ),
    );
  }
  return out;
}

function backPassReason(c: Context): Metric {
  const { fromX, back } = L.backPass;
  let backward = 0;
  let unreasoned = 0;
  for (const b of c.pb.beats) {
    if (b.kind !== 'pass') continue;
    const from = toAttack(b.team, b.from)[0];
    const to = toAttack(b.team, b.to)[0];
    if (from < fromX || to > from - back) continue;
    backward += 1;
    if (b.reason === undefined) unreasoned += 1;
  }
  return none('script.backPassReason', unreasoned, `backward=${backward}`);
}

function pressVisible(c: Context): Metric {
  const range = stage.pressVisible + L.pressedSlack;
  let kicks = 0;
  let pressed = 0;
  for (const e of c.pb.events) {
    if (e.kind !== 'kick' || c.beatOf.get(e.beat)?.reason !== 'pressed') continue;
    kicks += 1;
    const frame = c.frameAt(e);
    const actor = pos(frame, e.actor);
    const team = c.pb.fixture.players[e.actor]?.team ?? e.team;
    if (c.outfield[other(team)].some((i) => dist(pos(frame, i), actor) <= range)) pressed += 1;
  }
  return share('stage.pressVisible', pressed, kicks, L.pressedShare, 'min');
}

function scoreConsistent(c: Context): Metric {
  const goals = c.pb.events.filter((e) => e.kind === 'goal');
  const last = goals.at(-1)?.score ?? [0, 0];
  const scoreOk = c.pb.score[0] === last[0] && c.pb.score[1] === last[1];
  const goalBeats = new Set(goals.map((e) => e.beat));
  const withEvent = c.pb.beats.filter((b) => b.outcome === 'goal' && goalBeats.has(b.index)).length;
  const beatsTotal = c.pb.beats.filter((b) => b.outcome === 'goal').length;
  return metric(
    'score.consistent',
    goals.length,
    '= score',
    scoreOk && goals.length === withEvent,
    `score=${c.pb.score[0]}-${c.pb.score[1]} last=${last[0]}-${last[1]} goalBeats=${withEvent}/${beatsTotal}`,
  );
}

/** Ordinary passes (kind `pass`) kicked with the receiver nearer the passer than `shortKick.distance`. */
function shortKick(c: Context): Metric {
  let kicks = 0;
  let short = 0;
  for (const e of c.pb.events) {
    if (e.kind !== 'kick' || e.other === undefined) continue;
    if (c.beatOf.get(e.beat)?.kind !== 'pass') continue;
    kicks += 1;
    const frame = c.frameAt(e);
    if (dist(pos(frame, e.actor), pos(frame, e.other)) < L.shortKick.distance) short += 1;
  }
  return rate('events.shortKick', short, kicks, L.shortKick.share);
}

/** Both inside the same penalty area: a box defence or a set piece's crowd, not a huddle. */
const sameBox = (a: Vec, b: Vec): boolean =>
  inEitherBox(a) && inEitherBox(b) && a[0] < HALFWAY === b[0] < HALFWAY;

/** A run of consecutive open frames `start`..`last` in which outfield teammates `a` and `b` stand close. */
interface Episode {
  a: number;
  b: number;
  start: number;
  last: number;
}

function huddle(c: Context): Metric[] {
  const { frames } = c.pb;
  const runs = new Map<number, Episode>();
  const episodes: Episode[] = [];
  for (const f of c.open) {
    const frame = frames[f];
    for (const team of c.outfield) {
      for (let x = 0; x < team.length; x++) {
        for (let y = x + 1; y < team.length; y++) {
          const a = pos(frame, team[x]);
          const b = pos(frame, team[y]);
          if (dist(a, b) >= L.huddle.distance || sameBox(a, b)) continue;
          const key = team[x] * frame.p.length + team[y];
          const run = runs.get(key);
          if (run && run.last === f - 1) {
            run.last = f;
            continue;
          }
          if (run) episodes.push(run);
          runs.set(key, { a: team[x], b: team[y], start: f, last: f });
        }
      }
    }
  }
  episodes.push(...runs.values());
  const seconds = (e: Episode): number => (e.last - e.start + 1) * tick;
  const long = episodes.filter((e) => seconds(e) > L.huddle.seconds).length;
  let longest: Episode | undefined;
  for (const e of episodes) {
    const better =
      !longest ||
      seconds(e) > seconds(longest) ||
      (seconds(e) === seconds(longest) && e.start < longest.start);
    if (better) longest = e;
  }
  return [
    atMost(
      'shape.huddle',
      c.openMinutes === 0 ? 0 : long / c.openMinutes,
      L.huddle.perMinute,
      `n=${long}/${episodes.length} minutes=${num(c.openMinutes)}`,
    ),
    atMost(
      'shape.huddleLongest',
      longest ? seconds(longest) : 0,
      L.huddle.longest,
      longest
        ? `pair=${c.label(longest.a)}-${c.label(longest.b)} t=${num(frames[longest.start].t)}`
        : 'episodes=0 empty',
    ),
  ];
}

/** A speed series whose variance is below this (m²/s²) is still: float noise, not movement. */
const STILL_VARIANCE = 1e-9;

/** A series as its deviations from its mean and their norm (0 for a still series). */
interface Centred {
  d: number[];
  norm: number;
}

/** Pearson correlation of two centred series; 0 when either is still. */
const correlation = (a: Centred, b: Centred): number => {
  if (a.norm === 0 || b.norm === 0) return 0;
  let dot = 0;
  for (let k = 0; k < a.d.length; k++) dot += a.d[k] * b.d[k];
  return dot / (a.norm * b.norm);
};

const centred = (xs: readonly number[]): Centred => {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const d = xs.map((x) => x - m);
  const ss = d.reduce((s, x) => s + x * x, 0);
  return { d, norm: ss / xs.length < STILL_VARIANCE ? 0 : Math.sqrt(ss) };
};

/** Starts after a rest, how many fall together, and how alike two players' speeds rise and fall. */
function unison(c: Context): Metric[] {
  const { rest, go } = L.motion;
  const startsAt = new Array<number>(c.pb.frames.length).fill(0);
  const starts: number[] = [];
  const series = c.all.map((i) => c.open.map((f) => c.speed(f, i)));
  series.forEach((speeds) => {
    let resting = false;
    speeds.forEach((s, k) => {
      if (s < rest) {
        resting = true;
      } else if (resting && s > go) {
        resting = false;
        starts.push(c.open[k]);
        startsAt[c.open[k]] += 1;
      }
    });
  });
  const playerMinutes = c.all.length * c.openMinutes;
  const restarts = atMost(
    'motion.restarts',
    playerMinutes === 0 ? 0 : starts.length / playerMinutes,
    L.motion.restarts,
    `starts=${starts.length}`,
  );

  const w = Math.round(L.motion.window / tick);
  const prefix = [0];
  for (const n of startsAt) prefix.push(prefix[prefix.length - 1] + n);
  const around = (f: number): number =>
    prefix[Math.min(startsAt.length, f + w + 1)] - prefix[Math.max(0, f - w)];
  const inStep = starts.filter((f) => around(f) >= L.motion.together).length;
  const startSync = rate('motion.startSync', inStep, starts.length, L.motion.startSync);

  let sync = 0;
  if (c.open.length >= 2 && series.length >= 2) {
    const all = series.map(centred);
    let sum = 0;
    let pairs = 0;
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) {
        sum += correlation(all[a], all[b]);
        pairs += 1;
      }
    }
    sync = sum / pairs;
  }
  const tops = [
    L.motion.rest,
    (motion.walk + motion.jog) / 2,
    (motion.jog + motion.run) / 2,
    motion.run + 0.3,
  ];
  const bands = [0, 0, 0, 0, 0];
  let samples = 0;
  for (const speeds of series) {
    for (const s of speeds) {
      const band = s < tops[0] ? 0 : s < tops[1] ? 1 : s < tops[2] ? 2 : s <= tops[3] ? 3 : 4;
      bands[band] += 1;
      samples += 1;
    }
  }
  const shares = bands.map((n) => num(samples === 0 ? 0 : n / samples)).join('/');
  return [
    restarts,
    startSync,
    atMost('motion.speedSync', sync, L.motion.speedSync, `bands=${shares}`),
  ];
}

/** How the outfield players react to a turnover: turning as one, and how many run after it. */
function turns(c: Context): Metric[] {
  const before = Math.round(L.turn.before / tick);
  const within = Math.round(L.turn.within / tick);
  const runAt = Math.round(L.turn.runAt / tick);
  const settled = c.turnovers.filter((t) => !t.counter);
  const counters = c.turnovers.filter((t) => t.counter);
  let movers = 0;
  let turned = 0;
  for (const { f } of settled) {
    for (const i of c.all) {
      let sum = 0;
      for (let g = f - before; g < f; g++) sum += c.vx(g, i);
      const v = sum / before;
      if (Math.abs(v) < L.turn.moving) continue;
      movers += 1;
      for (let g = f; g <= f + within; g++) {
        const x = c.vx(g, i);
        if (x * v < 0 && Math.abs(x) >= L.turn.moving) {
          turned += 1;
          break;
        }
      }
    }
  }
  const reverse = rate('turn.reverse', turned, movers, L.turn.reverseShare);
  const running = (list: readonly Turnover[]): number =>
    median(
      list.map(
        ({ f }) =>
          c.all.filter((i) => c.speed(f + runAt, i) > L.turn.runSpeed).length / c.all.length,
      ),
    );
  return [
    { ...reverse, detail: `${reverse.detail} turnovers=${settled.length}` },
    settled.length === 0
      ? atMost('turn.run', 0, L.turn.runShare, 'turnovers=0 empty')
      : atMost('turn.run', running(settled), L.turn.runShare, `turnovers=${settled.length}`),
    counters.length === 0
      ? metric('turn.counterRun', 1, `>= ${num(L.turn.counterRunShare)}`, true, 'turnovers=0 empty')
      : atLeast(
          'turn.counterRun',
          running(counters),
          L.turn.counterRunShare,
          `turnovers=${counters.length}`,
        ),
  ];
}

/** `mark.near` reads every fifth frame (half a second at 10 Hz). */
const MARK_EVERY = 5;

/** Attackers without the ball in the last part of the pitch with an outfield defender close. */
function markNear(c: Context): Metric {
  const { frames } = c.pb;
  let samples = 0;
  let marked = 0;
  for (const f of c.open) {
    if (f % MARK_EVERY !== 0) continue;
    const frame = frames[f];
    const team = frame.team;
    for (const i of c.outfield[team]) {
      if (i === frame.owner) continue;
      const p = pos(frame, i);
      if (toAttack(team, p)[0] < L.mark.fromX) continue;
      samples += 1;
      const near = c.outfield[other(team)].some((j) => dist(pos(frame, j), p) <= L.mark.distance);
      if (near) marked += 1;
    }
  }
  return share('mark.near', marked, samples, L.mark.share, 'min');
}

/** Every metric of `METRIC_IDS` in that order; role metrics of roles no team has are left out. */
export function computeMetrics(playback: Playback): Metric[] {
  const c = contextOf(playback);
  return [
    atLeast('duration', playback.duration, L.duration),
    ...kinematics(c),
    ownerDistance(c),
    ...events(c),
    offsideConsistency(c),
    ...shape(c),
    ...roles(c),
    backPassReason(c),
    pressVisible(c),
    scoreConsistent(c),
    shortKick(c),
    ...huddle(c),
    ...unison(c),
    ...turns(c),
    markNear(c),
  ];
}
