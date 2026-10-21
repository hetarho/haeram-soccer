/**
 * The aggregate kernel (→MATCH-22, MATCH-26): one fixture's coupled team facts from a small joint
 * latent match state and grouped conditional draws over the 40 grid cells. Passing flows, carries
 * and take-ons come first; fouls fall on those actions, shots follow their completed arrivals and
 * set pieces follow the fouls and deflections — so possession, passes, entries, chances, xG,
 * turnovers and restarts are one simulated match. No player moves through space and no minute or
 * action is stepped through; only actual shots and corners are visited one by one.
 */
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { CELL_BASELINES } from '../grid/baselines';
import { cellBand, cellLane } from '../grid/pitch';
import { clamp, random } from '../primitives';
import { AGGREGATE_CONFIG as C } from './config';
import { participationIssues, sideCards, sideUnits, type AggregateUnits } from './input';
import { deriveTeamFacts, inBoxCell } from './ledger';
import type {
  AggregateFouls,
  AggregateInput,
  AggregateMove,
  AggregateMoveKind,
  AggregateParticipation,
  AggregatePeriod,
  AggregateShot,
  AggregateSide,
  AggregateSideLedger,
  AggregateStreamFamily,
  AggregateStreams,
  AggregateTeamFacts,
} from './types';

type Rng = () => number;

/**
 * The candidate model's named streams for one fixture: `<seed>:<revision>:aggregate:<family>
 * [:<period>]:<fixture>`. Each call restarts the named sequence, so neither the order of other
 * draws nor any observation or query moves it (→ARCH-5).
 */
export function aggregateStreams(
  seed: string,
  fixture: string,
  revision: string = MATCH_MODEL_REVISION,
): AggregateStreams {
  const names = (family: AggregateStreamFamily, period?: AggregatePeriod) =>
    `${seed}:${revision}:aggregate:${family}${period ? `:${period}` : ''}:${fixture}`;
  return { names, draw: (family, period) => random(names(family, period)) };
}

// Grouped draws: each costs about its result, never one draw per action.
function normal(r: Rng) {
  const u = Math.max(1e-12, r()),
    v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function poisson(r: Rng, mean: number): number {
  if (!(mean > 0)) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal(r)));
  const u = r();
  let k = 0,
    p = Math.exp(-mean),
    cdf = p;
  while (u > cdf && k < 200) {
    k++;
    p *= mean / k;
    cdf += p;
  }
  return k;
}
function binomial(r: Rng, n: number, p: number): number {
  if (n <= 0 || !(p > 0)) return 0;
  if (p >= 1) return n;
  if (p > 0.5) return n - binomial(r, n, 1 - p);
  const mean = n * p;
  if (mean > 15) {
    const k = Math.round(mean + Math.sqrt(mean * (1 - p)) * normal(r));
    return Math.min(n, Math.max(0, k));
  }
  const ratio = p / (1 - p),
    u = r();
  let k = 0,
    pk = (1 - p) ** n,
    cdf = pk;
  while (u > cdf && k < n) {
    pk *= ((n - k) / (k + 1)) * ratio;
    k++;
    cdf += pk;
  }
  return k;
}
/** Splits `n` over `weights` by sequential binomials. */
function multinomial(r: Rng, n: number, weights: readonly number[]): number[] {
  const out = weights.map(() => 0);
  let left = n,
    rest = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length && left > 0; i++) {
    const w = weights[i]!;
    if (!(w > 0)) continue;
    const k = i === weights.length - 1 || w >= rest ? left : binomial(r, left, w / rest);
    out[i] = k;
    left -= k;
    rest -= w;
  }
  return out;
}

const cell = (band: number, lane: number) => band * 5 + lane;
/** One lane towards the centre; the central lane drifts to either half-space. */
const inward = (lane: number, r: Rng) =>
  lane < 2 ? lane + 1 : lane > 2 ? lane - 1 : r() < 0.5 ? 1 : 3;
const PENALTY_SPOT = cell(6, 2);
const GOAL_AREA = cell(7, 2);
const BOX_CENTRE = cell(6, 2);
/** Reference pass volume of each cell: its share of actions that are passes. */
const PASS_WEIGHT = CELL_BASELINES.map((c) => c.share * c.pass);

interface Latent {
  tempo: number;
  possession: number;
  attack: [number, number];
}
interface Period {
  period: AggregatePeriod;
  from: number;
  to: number;
  units: [AggregateUnits, AggregateUnits];
  share: [number, number];
}
interface Match {
  input: AggregateInput;
  participation: AggregateParticipation;
  latent: Latent;
  sides: [AggregateSideLedger, AggregateSideLedger];
}

const other = (side: AggregateSide): AggregateSide => (side === 0 ? 1 : 0);
const tacticOf = (m: Match, side: AggregateSide) => C.tactics[m.input.sides[side].tactic];

/**
 * Coupled complete team facts of one fixture under its planned participation (→MATCH-26/27):
 * every Metrics and TD counter of both sides, team xG and the ledger they are derived from. The
 * regulation period draws on streams of its own, so extending a level tie by extra time leaves
 * the first 90 minutes as they were.
 */
export function generateTeamFacts(
  input: AggregateInput,
  streams: AggregateStreams,
  participation: AggregateParticipation,
): AggregateTeamFacts {
  const issues = participationIssues(input, participation);
  if (issues.length) throw new Error(`집계 출전 계획 불일치: ${issues.slice(0, 5).join('; ')}`);
  const r = streams.draw('latent');
  const latent: Latent = {
    tempo: Math.exp(C.latent.tempoSd * normal(r)),
    possession: C.latent.possessionSd * normal(r),
    attack: [Math.exp(C.latent.attackSd * normal(r)), Math.exp(C.latent.attackSd * normal(r))],
  };
  const periods: AggregatePeriod[] =
    participation.length === 120 ? ['regulation', 'extra'] : ['regulation'];
  const emptySide = (side: AggregateSide): AggregateSideLedger => {
    const cards = sideCards(participation, side, 0, participation.length);
    return {
      moves: [],
      shots: [],
      fouled: [],
      held: [],
      cards: { yellow: cards.yellow, red: cards.red },
      cardFouls: cards.fouls,
    };
  };
  const m: Match = { input, participation, latent, sides: [emptySide(0), emptySide(1)] };
  for (const period of periods) {
    const { from, to } = C.periods[period];
    const units: [AggregateUnits, AggregateUnits] = [
      sideUnits(input, participation, 0, from, to),
      sideUnits(input, participation, 1, from, to),
    ];
    const home = clamp(
      input.possessionChance +
        latent.possession +
        C.possession.manShort * (units[1].missing - units[0].missing),
      C.possession.min,
      C.possession.max,
    );
    const p: Period = { period, from, to, units, share: [home, 1 - home] };
    const flow = streams.draw('flow', period);
    for (const side of [0, 1] as const) passesAndCarries(m, p, side, flow);
    const fouls = streams.draw('fouls', period);
    for (const side of [0, 1] as const) foulsOn(m, p, side, fouls);
    const shots = streams.draw('shots', period),
      setPieces = streams.draw('setPieces', period);
    for (const side of [0, 1] as const) {
      openPlayShots(m, p, side, shots);
      setPieceShots(m, p, side, setPieces);
      m.sides[side].held.push(p.share[side] * (to - from) * 60 * C.ballInPlay);
    }
  }
  return deriveTeamFacts({ length: participation.length, periods, sides: m.sides });
}

/** Completion before direction and kind: the cell's reference rate moved by skill and tactics. */
function completionShift(m: Match, p: Period, side: AggregateSide) {
  const o = other(side),
    own = m.input.sides[side],
    opp = m.input.sides[o];
  return (
    (p.units[side].passing - p.units[o].pressing) / C.completion.skillScale +
    (own.profile.pass - opp.profile.pressure) / 100 +
    (own.strength - opp.strength) * C.completion.strength
  );
}

/** A side's passing flows, carries and take-ons in one period. */
function passesAndCarries(m: Match, p: Period, side: AggregateSide, r: Rng) {
  const o = other(side);
  const tactic = tacticOf(m, side),
    pressing = tacticOf(m, o).press;
  const span = p.to - p.from;
  const mean = C.passes.perMatch * (span / 90) * m.latent.tempo * tactic.tempo * p.share[side];
  const attempts = Math.max(0, Math.round(mean * Math.exp(C.passes.sideSd * normal(r))));
  const tilt = C.territory.dominance * (p.share[side] - 0.5) * 2;
  const origins = multinomial(
    r,
    attempts,
    PASS_WEIGHT.map((w, c) => w * Math.exp((tilt * (cellBand(c) - 3.5)) / 3.5)),
  );
  const shift = completionShift(m, p, side);
  const crossShift =
    ((p.units[side].crossing + p.units[side].aerial) / 2 - p.units[o].aerial) /
    C.completion.skillScale;
  const moves = m.sides[side].moves;
  const group = (
    from: number,
    to: number,
    kind: AggregateMoveKind,
    n: number,
    q: number,
    setPiece?: 'corner' | 'freeKick',
  ) => {
    if (n > 0) moves.push(passGroup(r, p.period, from, to, kind, n, q, pressing, setPiece));
  };
  origins.forEach((n, c) => {
    if (n === 0) return;
    const ref = CELL_BASELINES[c]!,
      band = cellBand(c),
      lane = cellLane(c);
    const crosses =
      band >= 5 && lane !== 2 ? binomial(r, n, ref.crossOfPasses * C.crosses.scale) : 0;
    const rest = n - crosses;
    const fw = band === 7 ? 0 : ref.forward * tactic.direct,
      back = band === 0 ? 0 : ref.back;
    const lat = ref.lateral + (band === 7 ? ref.forward : 0) + (band === 0 ? ref.back : 0);
    const total = fw + lat + back;
    const forward = binomial(r, rest, fw / total);
    const lateral = binomial(r, rest - forward, lat / (lat + back));
    const backward = rest - forward - lateral;
    // Direction offsets are renormalised so a cell keeps its reference completion on average.
    const d = C.completion.direction;
    const mid = (fw * d.forward + lat * d.lateral + back * d.back) / total;
    const pressed = band <= 4 ? (pressing - 1) * C.completion.pressed : 0;
    const base = ref.passCompletion + C.completion.bias + shift - pressed - mid;
    const q = (offset: number, to: number) =>
      clamp(
        base + offset + (inBoxCell(to) && !inBoxCell(c) ? C.completion.intoBox : 0),
        C.completion.min,
        C.completion.max,
      );
    if (crosses) {
      const goalArea = binomial(r, crosses, C.crosses.goalArea);
      const cq = clamp(C.crosses.completion + crossShift, C.completion.min, C.completion.max);
      group(c, GOAL_AREA, 'cross', goalArea, cq);
      group(c, BOX_CENTRE, 'cross', crosses - goalArea, cq);
    }
    if (forward) {
      const inner = band >= 3 && band <= 5 && lane >= 1 && lane <= 3;
      const through = inner ? binomial(r, forward, C.through.share * tactic.through) : 0;
      const tq = clamp(C.through.completion + shift - pressed, C.completion.min, C.completion.max);
      group(c, cell(Math.min(band + 2, 6), lane), 'through', through, tq);
      const long = band <= 5 ? binomial(r, forward - through, C.forward.long * tactic.direct) : 0;
      for (const [kind, k, to] of [
        ['long', long, band + 2],
        ['short', forward - through - long, band + 1],
      ] as const) {
        const drift = binomial(r, k, C.forward.drift);
        const straight = cell(to, lane),
          drifted = cell(to, inward(lane, r));
        const extra = kind === 'long' ? C.completion.long : 0;
        group(c, straight, kind, k - drift, q(d.forward + extra, straight));
        group(c, drifted, kind, drift, q(d.forward + extra, drifted));
      }
    }
    if (lateral) {
      const lanes = lane === 0 ? [1] : lane === 4 ? [3] : [lane - 1, lane + 1];
      const left = lanes.length === 1 ? lateral : binomial(r, lateral, 0.5);
      lanes.forEach((l, i) => {
        const to = cell(band, l);
        const k = i === 0 ? left : lateral - left;
        group(c, to, cutBack(c, to) ? 'cutBack' : 'short', k, q(d.lateral, to));
      });
    }
    if (backward) {
      const to = cell(band - 1, lane);
      group(c, to, cutBack(c, to) ? 'cutBack' : 'short', backward, q(d.back, to));
    }
    carriesFrom(m, p, side, r, c, n);
  });
}

/** A pass from the byline zones back into the box (→MATCH-13). */
const cutBack = (from: number, to: number) =>
  cellBand(from) >= 6 &&
  cellLane(from) !== 2 &&
  inBoxCell(to) &&
  Math.abs(cellLane(to) - 2) < Math.abs(cellLane(from) - 2);

/** One group of passes: completions, then how the failed ones ended. */
function passGroup(
  r: Rng,
  period: AggregatePeriod,
  from: number,
  to: number,
  kind: AggregateMoveKind,
  attempts: number,
  q: number,
  pressing: number,
  setPiece?: 'corner' | 'freeKick',
): AggregateMove {
  const completed = binomial(r, attempts, q);
  let rest = attempts - completed;
  const forward = kind === 'short' || kind === 'long' || kind === 'through';
  const ahead = forward && cellBand(to) > cellBand(from);
  const offside =
    ahead && cellBand(to) >= 5
      ? binomial(r, rest, kind === 'through' ? C.failed.offside.through : C.failed.offside.forward)
      : 0;
  rest -= offside;
  const wide = cellLane(to) % 4 === 0 || cellLane(from) % 4 === 0;
  const outTouch = wide ? binomial(r, rest, C.failed.touch) : 0;
  rest -= outTouch;
  const outByline = cellBand(to) === 7 || kind === 'cross' ? binomial(r, rest, C.failed.byline) : 0;
  rest -= outByline;
  const cornersWon = binomial(r, outByline, C.failed.corner);
  const intercept = Math.min(1, C.failed.intercepted * (cellBand(from) <= 2 ? pressing : 1));
  const intercepted = binomial(r, rest, intercept);
  const breaking =
    ahead && cellBand(from) >= 2 && cellBand(from) <= 5
      ? C.lineBreaking[kind as keyof typeof C.lineBreaking]
      : 0;
  return {
    period,
    from,
    to,
    kind,
    ...(setPiece && { setPiece }),
    attempts,
    completed,
    lineBreaking: binomial(r, completed, breaking),
    offside,
    intercepted,
    outTouch,
    outByline,
    cornersWon,
  };
}

/** Carries and take-ons from a cell, in proportion to the side's passes there (→MATCH-13). */
function carriesFrom(m: Match, p: Period, side: AggregateSide, r: Rng, c: number, passes: number) {
  const ref = CELL_BASELINES[c]!,
    band = cellBand(c),
    o = other(side);
  if (!(ref.pass > 0)) return;
  const moves = m.sides[side].moves;
  const ahead = band < 7 ? cell(band + 1, cellLane(c)) : c;
  const push = (kind: AggregateMoveKind, to: number, attempts: number, completed: number) => {
    if (attempts > 0)
      moves.push({
        period: p.period,
        from: c,
        to,
        kind,
        attempts,
        completed,
        lineBreaking: 0,
        offside: 0,
        intercepted: 0,
        outTouch: 0,
        outByline: 0,
        cornersWon: 0,
      });
  };
  const carries = poisson(
    r,
    ((passes * ref.carry) / ref.pass) * C.carries.scale * tacticOf(m, side).carries,
  );
  const lost = binomial(r, carries, C.carries.lost);
  const progressive = band < 7 ? binomial(r, carries - lost, C.carries.progressive) : 0;
  push('carry', c, carries - progressive, carries - lost - progressive);
  push('carry', ahead, progressive, progressive);
  const takeOns = poisson(r, ((passes * ref.takeOn) / ref.pass) * C.takeOns.scale);
  const success = clamp(
    (ref.takeOnSuccess ?? 0.5) +
      (p.units[side].dribbling - p.units[o].pressing) / C.takeOns.skillScale,
    C.takeOns.min,
    C.takeOns.max,
  );
  const won = binomial(r, takeOns, success);
  const through = band < 7 ? binomial(r, won, C.takeOns.progress) : 0;
  push('takeOn', c, takeOns - through, won - through);
  push('takeOn', ahead, through, through);
}

/**
 * Fouls the opponent commits on a side's actions: at least one for each card it was shown for a
 * foul, plus its ordinary fouls, placed in proportion to the side's actions by band. A foul in
 * the box is a penalty.
 */
function foulsOn(m: Match, p: Period, side: AggregateSide, r: Rng) {
  const o = other(side);
  const booked = sideCards(m.participation, o, p.from, p.to).fouls;
  const n = booked + poisson(r, C.fouls.perMatch * ((p.to - p.from) / 90) * tacticOf(m, o).fouls);
  const actions = Array<number>(40).fill(0);
  for (const move of m.sides[side].moves)
    if (move.period === p.period) actions[move.from]! += move.attempts;
  const weights = actions.map((a, c) => a * C.fouls.band[cellBand(c)]!);
  // A side with no actions at all is still fouled where play mostly is.
  if (!weights.some((w) => w > 0)) weights[cell(3, 2)] = 1;
  multinomial(r, n, weights).forEach((k, c) => {
    if (k > 0)
      m.sides[side].fouled.push({
        period: p.period,
        cell: c,
        n: k,
        penalties: inBoxCell(c) ? k : 0,
      } satisfies AggregateFouls);
  });
}

/** How likely a side's arrivals are to become a shot and how good its chances are. */
function attackOf(m: Match, p: Period, side: AggregateSide) {
  const o = other(side),
    own = m.input.sides[side],
    opp = m.input.sides[o];
  const margin = p.units[side].attack - p.units[o].defence;
  const manShort =
    Math.max(0, 1 - C.manShort.attack * p.units[side].missing) *
    (1 + C.manShort.defence * p.units[o].missing);
  const profile = clamp(
    (C.shots.profileBase + own.profile.shot - opp.profile.defense) / C.shots.profileBase,
    0.4,
    1.8,
  );
  return {
    rate: Math.exp(margin / C.shots.skillScale) * profile * m.latent.attack[side] * manShort,
    quality: Math.exp(margin / C.xg.matchupScale),
    shooting: p.units[side].shooting,
    keeping: p.units[o].keeping,
  };
}
type Attack = ReturnType<typeof attackOf>;

/** One shot's quality, outcome and minute. */
function shoot(
  m: Match,
  p: Period,
  a: Attack,
  r: Rng,
  shot: Pick<AggregateShot, 'cell' | 'source' | 'kind' | 'header'>,
  moveKind: AggregateMoveKind,
): AggregateShot {
  const penalty = shot.kind === 'penalty';
  let xg: number;
  if (penalty) xg = C.penalty.xg;
  else {
    const ref = CELL_BASELINES[shot.cell]!.xgPerShot ?? C.xg.fallback;
    const base = shot.kind === 'freeKick' && shot.source < 0 ? C.setPieces.directXg / 100 : ref;
    const spread = C.xg.spread;
    const value =
      base *
      C.xg.kind[moveKind] *
      (shot.header ? C.xg.header : 1) *
      a.quality *
      Math.exp(spread * normal(r) - (spread * spread) / 2);
    const max = inBoxCell(shot.cell) ? C.xg.max : C.xg.outsideMax;
    xg = Math.min(max, Math.max(C.xg.min, Math.round(value * 100)));
  }
  const goal = penalty
    ? clamp(
        C.penalty.base + (a.shooting - a.keeping) / C.penalty.skillScale,
        C.penalty.min,
        C.penalty.max,
      )
    : clamp((xg / 100) * m.input.access.finishing(a.shooting, a.keeping), 0.01, 0.8);
  // A defender may block the shot first; the rest finish on the shared curves, scaled so the
  // chance still scores as often as its quality and the finisher say.
  const blocked = !penalty && r() < C.shots.blocked;
  const open = Math.min(0.95, goal / (penalty ? 1 : 1 - C.shots.blocked));
  const target = m.input.access.targetChance(open, a.shooting);
  const u = r();
  const outcome = blocked ? 'block' : u < open ? 'goal' : u < target ? 'save' : 'miss';
  const corner =
    (outcome === 'block' && r() < C.shots.cornerFromBlock) ||
    (outcome === 'save' && r() < C.shots.cornerFromSave);
  const minute = p.from + 1 + Math.min(p.to - p.from - 1, Math.floor(r() * (p.to - p.from)));
  return { period: p.period, minute, ...shot, xg, outcome, corner };
}

/** Chances from completed arrivals in the final third, each at most one shot. */
function openPlayShots(m: Match, p: Period, side: AggregateSide, r: Rng) {
  const a = attackOf(m, p, side);
  const own = m.sides[side];
  own.moves.forEach((move, index) => {
    if (move.period !== p.period || move.setPiece || move.completed === 0) return;
    if (cellBand(move.to) < 5) return;
    const rate = Math.min(
      0.9,
      CELL_BASELINES[move.to]!.shot * C.shots.scale * C.shots.kind[move.kind] * a.rate,
    );
    const k = binomial(r, move.completed, rate);
    for (let i = 0; i < k; i++) {
      const header = move.kind === 'cross' && r() < C.shots.header;
      own.shots.push(
        shoot(m, p, a, r, { cell: move.to, source: index, kind: 'open', header }, move.kind),
      );
    }
  });
}

/**
 * Penalties and free kicks from the fouls on a side, then every corner it won until each is
 * delivered: a delivered set piece can be deflected for another corner, so the loop runs over
 * the corners actually won.
 */
function setPieceShots(m: Match, p: Period, side: AggregateSide, r: Rng) {
  const a = attackOf(m, p, side);
  const own = m.sides[side];
  const pressing = tacticOf(m, other(side)).press;
  const deliver = (
    from: number,
    kind: 'corner' | 'freeKick',
    n: number,
    q: number,
    shot: number,
  ) => {
    const goalArea = binomial(r, n, kind === 'corner' ? C.setPieces.corner.goalArea : 0);
    for (const [to, k] of [
      [GOAL_AREA, goalArea],
      [BOX_CENTRE, n - goalArea],
    ] as const) {
      if (k === 0) continue;
      own.moves.push(passGroup(r, p.period, from, to, 'cross', k, q, pressing, kind));
      const index = own.moves.length - 1,
        move = own.moves[index]!;
      const shots = binomial(r, move.completed, shot * a.rate);
      for (let i = 0; i < shots; i++)
        own.shots.push(
          shoot(
            m,
            p,
            a,
            r,
            { cell: to, source: index, kind, header: r() < C.shots.header },
            'cross',
          ),
        );
    }
  };
  for (const f of own.fouled) {
    if (f.period !== p.period) continue;
    for (let i = 0; i < f.penalties; i++)
      own.shots.push(
        shoot(
          m,
          p,
          a,
          r,
          { cell: PENALTY_SPOT, source: -1, kind: 'penalty', header: false },
          'short',
        ),
      );
    const band = cellBand(f.cell),
      lane = cellLane(f.cell);
    const free = f.n - f.penalties;
    if (free === 0 || band < 4 || inBoxCell(f.cell)) continue;
    const direct =
      band === 5 && lane >= 1 && lane <= 3 ? binomial(r, free, C.setPieces.directShot) : 0;
    for (let i = 0; i < direct; i++)
      own.shots.push(
        shoot(m, p, a, r, { cell: f.cell, source: -1, kind: 'freeKick', header: false }, 'short'),
      );
    const delivered = binomial(r, free - direct, C.setPieces.delivery);
    if (delivered)
      deliver(f.cell, 'freeKick', delivered, C.crosses.completion, C.setPieces.deliveryShot);
  }
  const won = () =>
    own.shots.reduce((n, s) => n + (s.period === p.period && s.corner ? 1 : 0), 0) +
    own.moves.reduce((n, mv) => n + (mv.period === p.period ? mv.cornersWon : 0), 0);
  let taken = 0;
  for (let pending = won(); pending > 0; pending = won() - taken) {
    const from = cell(7, r() < 0.5 ? 0 : 4);
    deliver(from, 'corner', pending, C.setPieces.corner.completion, C.setPieces.corner.shot);
    taken += pending;
  }
}
