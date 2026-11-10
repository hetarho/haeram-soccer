// Staging metrics: a playback judged by numbers before anyone watches it. Every metric is a pure
// function of a `Playback` and `PROTO_CONFIG` (ARCH-5); nothing here imports `stage/`. Thresholds
// live in `PROTO_CONFIG.limits`. A share with an empty denominator is 1 and passes; a rate with an
// empty denominator is 0 and passes; a mean or median over no frames is 0 and passes.
import { PROTO_CONFIG } from '../core/config.ts';
import { BOX_X, BOX_Y, GOAL_Y, HALFWAY, inPitch, PITCH, toAttack } from '../core/pitch.ts';
import { offsideLineX } from '../core/shape.ts';
import {
  isShotLike,
  PASS_KINDS,
  type Beat,
  type Frame,
  type Playback,
  type PlayerSpec,
  type RoleId,
  type StageEvent,
  type StageEventKind,
  type TeamId,
  type Vec,
} from '../core/types.ts';
import { dist } from '../core/vec.ts';

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
];

const L = PROTO_CONFIG.limits;
const { motion, stage, tick } = PROTO_CONFIG;
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

/** Everything the metrics read about one playback, worked out once. */
interface Context {
  pb: Playback;
  beatOf: Map<number, Beat>;
  live: Frame[];
  outfield: [number[], number[]];
  frameAt: (event: StageEvent) => Frame;
  label: (index: number) => string;
}

function contextOf(pb: Playback): Context {
  const last = pb.frames.length - 1;
  const outfieldOf = (team: TeamId): number[] =>
    pb.fixture.teams[team].players.filter((p) => p.slot !== 0).map((p) => p.index);
  return {
    pb,
    beatOf: new Map(pb.beats.map((b) => [b.index, b])),
    live: pb.frames.filter((f) => f.live),
    outfield: [outfieldOf(0), outfieldOf(1)],
    frameAt: (event) => pb.frames[Math.min(last, Math.max(0, Math.round(event.t * pb.hz)))],
    label: (index) => {
      const player = pb.fixture.players[index];
      return player ? `${pb.fixture.teams[player.team].code}${player.number}` : String(index);
    },
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
  ];
}
