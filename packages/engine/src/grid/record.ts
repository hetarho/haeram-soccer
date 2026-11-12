import { message as sourceMessage } from '../../../contracts/src/messages';
/** The only place a grid match is counted: team and player metrics, goals, xG and possession (→MATCH-11, MATCH-13). */
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../../contracts/src/detail';
import type { Line } from '../../../contracts/src/player';
import type { Incident, MatchRecord } from '../../../contracts/src/types';
import { FORMATIONS, lineOf } from '../player';
import { zeroMetrics } from '../primitives';
import { CELL_BASELINES } from '../match/baselines';
import { attackFrame, BAND_EDGES, bandOf, cellOf, inBox, PITCH, type Point } from '../match/pitch';
import type { RestartKind } from './restarts';
import type { Outcome } from './resolve';
import type { GridSetup } from './setup';
import type { GridState } from './state';
import { COUNTER_ZONES, isCutBack, M, MaterialTally, possessionShare } from '../match/record';
export {
  COUNTER_ZONES,
  inBoxCell,
  isCutBack,
  M,
  MaterialTally,
  mirrorBand,
  possessionShare,
  type PlayPhase,
} from '../match/record';

/** Opponent lines a line-breaking pass is played beyond (MATCH-13: the deepest player of a line). */
const BROKEN_LINES: readonly Line[] = ['DF', 'MF'];

/**
 * Where a cross arrived, in the crosser's attack frame: the teammate who controlled or headed it when it reached
 * one, otherwise its origin `from` (MATCH-13 box entries).
 */
export function crossArrival(s: GridState, side: 0 | 1, o: Outcome, from: Point): Point {
  const to = o.kind === 'complete' ? o.receiver : o.kind === 'shot' ? o.shooter : undefined;
  return to === undefined ? from : attackFrame(side, s.players[side][to]!.pos);
}

/**
 * Values per side in `Tally.running()`: the counts before `M.minutes`, what possession is shared
 * by (attempted passes on the candidate model, seconds on the ball before it) and xG.
 */
export const RUNNING = M.minutes + 2;

/** x (attack frame) where MATCH-13's zones start (`COUNTER_ZONES`): the final third, press, high turnover. */
const FINAL_THIRD = BAND_EDGES[COUNTER_ZONES.finalThird];
const PRESS_FROM = BAND_EDGES[COUNTER_ZONES.press];
const HIGH_FROM = BAND_EDGES[COUNTER_ZONES.highTurnover];

/**
 * The deepest x, in `attacking`'s frame, of the on-pitch outfielders of `defending` that `keep`
 * selects by their slot's line; undefined when there is none.
 */
function deepest(
  s: GridState,
  defending: 0 | 1,
  attacking: 0 | 1,
  keep: (line: Line) => boolean,
): number | undefined {
  let x: number | undefined;
  // state.ts's `onPitch` and `slotOf`, read inline: the aggregate path imports this module, and
  // state.ts's imports lead back to it.
  const slots = FORMATIONS[s.setup.tactics[defending]].slots;
  for (const gp of s.players[defending]) {
    if (!gp.onPitch || gp.sentOff || gp.slot < 0) continue;
    const line = lineOf(slots[gp.slot]!.position);
    if (line === 'GK' || !keep(line)) continue;
    const at = attackFrame(attacking, gp.pos)[0];
    x = x === undefined ? at : Math.max(x, at);
  }
  return x;
}
/** Played from at or behind `line` to beyond it, along the attack frame's x. */
const beyond = (line: number | undefined, from: Point, to: Point) =>
  line !== undefined && from[0] <= line && to[0] > line;

/**
 * How MATCH-13 classifies a pass of `side` from `from` to `to` (its attack frame) with the players
 * where they stand when it is played: a cut-back by its cells; otherwise a through ball when it is
 * played from at or behind the deepest outfield opponent into the space beyond him (MATCH-15's
 * "in behind") for a receiver who is not beyond him yet (`receiverAt`, T397: a ball to a man
 * already standing past the line is a pass to his feet, not a ball into the space in behind); a
 * line-breaking pass when it is played from at or behind the deepest player of an opponent line
 * (defenders or midfielders) to beyond him. A cross stays a cross. Read by the candidate model's
 * tally only; the pre-feature tally keeps the decision's labels.
 */
function classifyPass(
  s: GridState,
  side: 0 | 1,
  e: { from: Point; to: Point; kind: string; receiverAt?: Point },
): { cutBack: boolean; through: boolean; lineBreaking: boolean } {
  const foe = side === 0 ? 1 : 0;
  const cross = e.kind === 'cross';
  const cutBack = isCutBack(cellOf(e.from), cellOf(e.to));
  const last = deepest(s, foe, side, () => true);
  const through =
    !cross &&
    !cutBack &&
    beyond(last, e.from, e.to) &&
    (e.receiverAt === undefined || e.receiverAt[0] <= last!);
  const lineBreaking = BROKEN_LINES.some((line) =>
    beyond(
      deepest(s, foe, side, (l) => l === line),
      e.from,
      e.to,
    ),
  );
  return { cutBack, through, lineBreaking };
}

/** One shot as T215's band script reads it (attack-frame metres). */
export interface ShotDiagnostic {
  side: 0 | 1;
  x: number;
  y: number;
  xg: number;
  header: boolean;
  /** Within 10 s of a corner or free kick being taken (penalties apart). */
  setPiece: boolean;
  penalty: boolean;
  goal: boolean;
  /** The shooter's line at his slot. */
  line: string;
  /**
   * Revision 10 on (T599): an unopposed chance, a shot in open play from a clear chance
   * (`clearChance`: no outfield opponent ahead of him, or none within 5 m); absent before.
   */
  clear?: boolean;
}

/** Measurements for calibration that the record does not carry (→MATCH-23). */
export interface GridDiagnostics {
  /** Seconds the ball was in play. */
  ballInPlay: number;
  shots: ShotDiagnostic[];
  /** Open-play pass attempts per side: forward, lateral, back (±45° in the attack frame). */
  directions: [number[], number[]];
  /** Each possession's pass attempts and whether it ended in a shot. */
  possessions: { side: 0 | 1; passes: number; shot: boolean }[];
  /** Each side's freshness at the final whistle (changes.ts `sideFreshness`, →MATCH-29). */
  freshness: [number, number];
}

/**
 * The candidate model's whole minutes per line of a side (→MATCH-27): every entry and exit is
 * rounded once from its regulation minute, in the order it happened (by elapsed seconds; an exit
 * before an entry at the same moment, as added time shares its period's last minute), never earlier
 * than the boundary before it and at least a minute after the player's own entry, then pulled back
 * so that everyone after it still gets a minute before `end`. A line plays from its entry boundary
 * to its exit boundary, so the side never sums past eleven times the match, however the boundaries
 * round, and everyone who came on has at least one minute.
 */
export function lineMinutes(
  state: GridState,
  side: 0 | 1,
  played: readonly number[],
  end: number,
): Map<number, number> {
  const on = new Map<number, number>(),
    off = new Map<number, number>();
  const events: { idx: number; exit: boolean; at: number; minute: number; order: number }[] = [];
  played.forEach((idx, order) => {
    const gp = state.players[side][idx]!;
    if (order < 11) on.set(idx, 0);
    else events.push({ idx, exit: false, at: gp.onAt, minute: gp.onMin, order });
    if (gp.offMin !== undefined)
      events.push({ idx, exit: true, at: gp.offAt ?? gp.onAt, minute: gp.offMin, order });
    else off.set(idx, end);
  });
  events.sort((a, b) => a.at - b.at || Number(b.exit) - Number(a.exit) || a.order - b.order);
  const bound = new Array<number>(events.length);
  let last = 0;
  events.forEach((e, i) => {
    let b = Math.max(Math.round(e.minute), last);
    if (e.exit) b = Math.max(b, (on.get(e.idx) ?? 0) + 1);
    else on.set(e.idx, b);
    bound[i] = last = b;
  });
  let next = end;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    let b = Math.min(bound[i]!, next);
    if (e.exit) off.set(e.idx, b);
    else {
      b = Math.min(b, (off.get(e.idx) ?? end) - 1);
      on.set(e.idx, b);
    }
    bound[i] = next = b;
  }
  return new Map(played.map((idx) => [idx, (off.get(idx) ?? end) - (on.get(idx) ?? 0)]));
}

export class Tally {
  private readonly lines: [number[][], number[][]];
  private readonly xg: [number, number] = [0, 0];
  private readonly held: [number, number] = [0, 0];
  /** Team (TD) and player (PD) advanced counters (→MATCH-13). */
  private readonly td: [number[], number[]] = [emptyTeamDetail(), emptyTeamDetail()];
  private readonly pd: [number[][], number[][]];
  /** Post-match material, counted for every match with an own side. */
  readonly material?: MaterialTally;
  readonly highlights: MatchRecord['highlights'] = [];
  readonly incidents: Incident[] = [];
  /** Counted through the match; `freshness` is read once at the final whistle. */
  readonly diagnostics: Omit<GridDiagnostics, 'freshness'> = {
    ballInPlay: 0,
    shots: [],
    directions: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    possessions: [],
  };
  private spell: { side: 0 | 1; passes: number; shot: boolean } = {
    side: 0,
    passes: 0,
    shot: false,
  };

  /**
   * `state` is the match being counted: the candidate model reads where the players stand when a
   * pass is played (`classifyPass`) and where a restart's receiver is.
   */
  constructor(
    private readonly setup: GridSetup,
    private readonly state?: GridState,
  ) {
    this.lines = [
      setup.rosters[0].map(() => zeroMetrics()),
      setup.rosters[1].map(() => zeroMetrics()),
    ];
    this.pd = [
      setup.rosters[0].map(() => emptyPlayerDetail()),
      setup.rosters[1].map(() => emptyPlayerDetail()),
    ];
    if (setup.own !== undefined && setup.recordPlayers)
      this.material = new MaterialTally(setup.own, setup.rosters[setup.own].length);
  }

  /** Bumps a team counter and, when the player has the same counter, his. */
  private count(
    side: 0 | 1,
    idx: number | undefined,
    team: number | undefined,
    player: number | undefined,
    n = 1,
  ) {
    if (team !== undefined) this.td[side][team]! += n;
    if (idx !== undefined && player !== undefined) this.pd[side][idx]![player]! += n;
  }

  /**
   * A pass, cross or cut-back by `idx`. Points are in the passer's attack frame: the pass starts at
   * `from` and is played to `to`, for a receiver standing at `receiverAt` when it is played; `ok`
   * when a teammate got it. The candidate model classifies it by MATCH-13's rules where the players
   * stand (`classifyPass`); the pre-feature model keeps the decision's kind and line-breaking flag.
   */
  passEvent(
    side: 0 | 1,
    idx: number,
    e: {
      from: Point;
      to: Point;
      receiverAt?: Point;
      ok: boolean;
      kind: 'short' | 'long' | 'switch' | 'through' | 'cross' | 'cutBack';
      lineBreaking?: boolean;
    },
  ): void {
    const [dx, dy] = [e.to[0] - e.from[0], e.to[1] - e.from[1]];
    const direction = e.kind === 'cross' || dx > Math.abs(dy) ? 0 : -dx > Math.abs(dy) ? 2 : 1;
    this.diagnostics.directions[side][direction]!++;
    this.counted(side, idx, e);
  }

  /**
   * A restart played as a pass (a throw-in, goal kick, kick-off, short corner or free kick) by
   * `idx` from `spot` (engine frame) to the receiver he chose, `target`. It is a pass attempt like
   * any other; the candidate model also counts it by where it starts and ends (MATCH-13: final-third
   * and build-up passes, progression, entries, xT, lines broken), as the aggregate ledger counts
   * every pass. Open-play pass directions (MATCH-23) leave it out on both models.
   */
  restartPass(
    side: 0 | 1,
    idx: number,
    spot: Point,
    res: { target?: number; outcome: Outcome },
  ): void {
    const ok = res.outcome.kind === 'complete' && res.outcome.receiver !== idx;
    if (this.setup.model === undefined) return this.pass(side, idx, ok);
    const from = attackFrame(side, spot);
    const target =
      res.target === undefined ? undefined : this.matchState().players[side][res.target];
    const to = target ? attackFrame(side, target.pos) : from;
    this.counted(side, idx, { from, to, receiverAt: to, ok, kind: 'short' });
  }

  private matchState(): GridState {
    if (!this.state) throw new Error('the candidate tally reads the match state');
    return this.state;
  }

  /** A pass attempt's counters under MATCH-13 (`passEvent`, `restartPass`). */
  private counted(
    side: 0 | 1,
    idx: number,
    e: {
      from: Point;
      to: Point;
      receiverAt?: Point;
      ok: boolean;
      kind: 'short' | 'long' | 'switch' | 'through' | 'cross' | 'cutBack';
      lineBreaking?: boolean;
    },
  ): void {
    this.pass(side, idx, e.ok);
    const rules =
      this.setup.model === undefined
        ? {
            cutBack: e.kind === 'cutBack',
            through: e.kind === 'through',
            lineBreaking: e.lineBreaking ?? false,
          }
        : classifyPass(this.matchState(), side, e);
    const cross = e.kind === 'cross';
    // The material report counts by the same classification (a pulled-back cross is both).
    if (cross) this.material?.pass(side, 'cross', e.ok);
    if (rules.cutBack) this.material?.pass(side, 'cutBack', e.ok);
    if (rules.through) this.material?.pass(side, 'through', e.ok);
    const start = bandOf(e.from[0]);
    const end = bandOf(e.to[0]);
    if (e.from[0] < FINAL_THIRD) this.count(side, undefined, TD.buildUpPasses, undefined);
    else {
      this.count(side, idx, TD.finalThirdPasses, PD.finalThirdPasses);
      if (e.ok) this.count(side, idx, TD.finalThirdCompleted, PD.finalThirdCompleted);
    }
    if (cross) {
      this.count(side, idx, TD.crosses, PD.crosses);
      if (e.ok) this.count(side, idx, TD.crossesCompleted, PD.crossesCompleted);
    }
    if (rules.cutBack && e.ok) this.count(side, idx, TD.cutBacks, PD.cutBacks);
    if (rules.through) {
      this.count(side, idx, TD.throughBalls, PD.throughBalls);
      if (e.ok) this.count(side, idx, TD.throughBallsCompleted, PD.throughBallsCompleted);
    }
    if (!e.ok) return;
    if (end > start) this.count(side, idx, TD.progressivePasses, PD.progressivePasses);
    if (rules.lineBreaking) this.count(side, idx, TD.lineBreakingPasses, PD.lineBreakingPasses);
    this.movement(side, idx, e.from, e.to);
  }

  /** What a completed pass or carry gains: box and front-of-box entries and expected threat. */
  private movement(side: 0 | 1, idx: number, from: Point, to: Point): void {
    this.material?.entry(side, from, to);
    if (inBox(to) && !inBox(from)) this.count(side, idx, TD.boxEntries, PD.boxEntries);
    if (bandOf(to[0]) === 5 && bandOf(from[0]) < 5)
      this.count(side, idx, TD.frontOfBoxEntries, PD.frontOfBoxEntries);
    const gain = Math.round(
      Math.max(0, CELL_BASELINES[cellOf(to)]!.xT - CELL_BASELINES[cellOf(from)]!.xT) * 1000,
    );
    if (gain > 0) this.count(side, idx, TD.xtAdded, PD.xtAdded, gain);
  }

  /** A carry or successful take-on from `from` to `to` (attack frame). */
  carryEvent(side: 0 | 1, idx: number, from: Point, to: Point): void {
    if (bandOf(to[0]) > bandOf(from[0]))
      this.count(side, idx, TD.progressiveCarries, PD.progressiveCarries);
    this.movement(side, idx, from, to);
  }

  /** A take-on attempt, won or not (the won ones also count as dribbles). */
  takeOnAttempt(side: 0 | 1, idx: number): void {
    this.count(side, idx, TD.takeOns, PD.takeOns);
    this.material?.takeOn(side);
  }

  /**
   * The ball won by `(side, idx)` in open play at `at` (his attack frame) — a tackle, an
   * interception, a loose ball or a keeper's claim; restarts never come here. It starts his side's
   * sequence, a high turnover from band `COUNTER_ZONES.highTurnover` on (→MATCH-13).
   */
  regain(side: 0 | 1, idx: number, at: Point): void {
    if (at[0] >= HIGH_FROM) this.count(side, idx, TD.highTurnovers, PD.highTurnovers);
    this.material?.regain(side, at);
  }

  /**
   * A shot from `from` (shooter's attack frame) with the chance's xG; `passer` is the player whose
   * completed pass set it up, who earns the key pass and the shot's xA.
   */
  shotDetail(
    side: 0 | 1,
    idx: number,
    e: { from: Point; xg: number; recordedXg: number; goal: boolean; passer?: number },
  ): void {
    this.count(side, idx, undefined, PD.xg, Math.round(e.recordedXg * 100));
    if (inBox(e.from)) this.count(side, undefined, TD.boxShots, undefined);
    const big = e.xg >= 0.3;
    if (big) {
      this.count(side, undefined, TD.bigChances, undefined);
      if (e.goal) this.count(side, undefined, TD.bigChancesScored, undefined);
    }
    if (e.passer !== undefined) {
      this.count(side, e.passer, TD.keyPasses, PD.keyPasses);
      this.count(side, e.passer, undefined, PD.xa, Math.round(e.recordedXg * 100));
      if (big) this.count(side, e.passer, undefined, PD.bigChancesCreated);
    }
  }

  restart(side: 0 | 1, kind: RestartKind, scored = false): void {
    if (kind === 'corner') this.count(side, undefined, TD.corners, undefined);
    if (kind === 'throwIn') this.count(side, undefined, TD.throwIns, undefined);
    if (kind === 'goalKick') this.count(side, undefined, TD.goalKicks, undefined);
    if (kind === 'freeKick' || kind === 'indirectFreeKick')
      this.count(side, undefined, TD.freeKicks, undefined);
    if (kind === 'penalty') {
      this.count(side, undefined, TD.penalties, undefined);
      if (scored) this.count(side, undefined, TD.penaltiesScored, undefined);
    }
  }

  /** A card shown to `idx`; a second yellow counts one yellow and one red. */
  card(side: 0 | 1, idx: number, kind: 'yellow' | 'secondYellow' | 'red'): void {
    if (kind !== 'red') this.count(side, idx, TD.yellowCards, PD.yellowCards);
    if (kind !== 'yellow') this.count(side, idx, TD.redCards, PD.redCards);
  }

  /**
   * A foul by `(foulerSide, fouler)` on `fouled`; at `at` (the fouler's attack frame) the candidate
   * model reads it as a defensive action of PPDA (→MATCH-13).
   */
  foul(foulerSide: 0 | 1, fouler: number, fouled: number, at?: Point): void {
    this.count(foulerSide, fouler, TD.fouls, PD.fouls);
    this.count((1 - foulerSide) as 0 | 1, fouled, undefined, PD.foulsWon);
    if (at && this.setup.model !== undefined) this.pressed(foulerSide, at);
  }

  offside(side: 0 | 1, target: number): void {
    this.count(side, target, TD.offsides, PD.offsides);
  }

  private add(side: 0 | 1, idx: number, metric: number, n = 1) {
    this.lines[side][idx]![metric]! += n;
  }

  /** A pass, cross or cut-back attempt by `idx`; `ok` when it reached a teammate. */
  pass(side: 0 | 1, idx: number, ok: boolean): void {
    this.spellTo(side);
    this.spell.passes++;
    this.add(side, idx, M.passes);
    if (ok) this.add(side, idx, M.completed);
  }

  shot(
    side: 0 | 1,
    idx: number,
    recordedXg: number,
    result: 'goal' | 'save' | 'block' | 'miss',
  ): void {
    this.add(side, idx, M.shots);
    this.spellTo(side);
    this.spell.shot = true;
    if (result === 'goal' || result === 'save') this.add(side, idx, M.onTarget);
    this.xg[side] += recordedXg;
  }

  /** A defensive action of `side` at `at` (its attack frame): PPDA's denominator in the press zone. */
  private pressed(side: 0 | 1, at: Point): void {
    if (at[0] >= PRESS_FROM) this.count(side, undefined, TD.pressActions, undefined);
  }

  /** A tackle won at `at` (the winner's attack frame), a defensive action of PPDA. */
  tackle(side: 0 | 1, idx: number, at?: Point): void {
    this.add(side, idx, M.tackles);
    this.material?.tackle(side);
    if (at) this.pressed(side, at);
  }

  /** An interception at `at` (the winner's attack frame), a defensive action of PPDA. */
  interception(side: 0 | 1, idx: number, at?: Point): void {
    this.add(side, idx, M.interceptions);
    if (at) this.pressed(side, at);
  }

  /**
   * A take-on won by `(side, idx)` from `from` (his attack frame); on the candidate model the side
   * he beat lost a challenge there, a defensive action of PPDA (→MATCH-13).
   */
  dribble(side: 0 | 1, idx: number, from?: Point): void {
    this.add(side, idx, M.dribbles);
    this.material?.dribble(side);
    if (from && this.setup.model !== undefined)
      this.pressed((1 - side) as 0 | 1, [PITCH.length - from[0], PITCH.width - from[1]]);
  }

  save(side: 0 | 1, idx: number): void {
    this.add(side, idx, M.saves);
  }

  goal(side: 0 | 1, idx: number, minute: number, assister?: number): void {
    this.add(side, idx, M.goals);
    if (assister !== undefined) this.add(side, assister, M.assists);
    this.highlights.push({
      minute,
      side,
      player: this.setup.rosters[side][idx]!.name,
      action: sourceMessage('copy.summary.68a6cf8ed8'),
    });
  }

  /** Closes the current possession when `side` now has the ball, or at a period's end (`undefined`). */
  spellTo(side: 0 | 1 | undefined): void {
    if (side === this.spell.side) return;
    if (this.spell.passes || this.spell.shot) this.diagnostics.possessions.push(this.spell);
    this.spell = { side: side ?? 0, passes: 0, shot: false };
  }

  possession(side: 0 | 1, seconds: number): void {
    this.held[side] += seconds;
  }

  goals(side: 0 | 1): number {
    return this.lines[side].reduce((sum, line) => sum + line[M.goals]!, 0);
  }

  /**
   * Running team counts for playback: per side `M.goals`…`M.saves`, what possession
   * is shared by (MATCH-3: attempted passes on the candidate model, seconds on the ball before it)
   * and xG.
   */
  running(): Float64Array {
    const out = new Float64Array(2 * RUNNING);
    for (const side of [0, 1] as const) {
      const at = side * RUNNING;
      for (const line of this.lines[side])
        for (let i = 0; i < M.minutes; i++) out[at + i]! += line[i]!;
      out[at + M.minutes] = this.setup.model === undefined ? this.held[side] : out[at + M.passes]!;
      out[at + M.minutes + 1] = this.xg[side];
    }
    return out;
  }

  finish(
    state: GridState,
  ): Pick<
    MatchRecord,
    'metrics' | 'players' | 'highlights' | 'xg' | 'detail' | 'lineCounts' | 'incidents' | 'material'
  > {
    const { setup } = this;
    const sides = [0, 1] as const;
    // Starters, then the substitutes in the order they came on; minutes are regulation minutes on the
    // pitch, at least 1 for anyone who played (a substitute in added time still appears).
    const end = state.period > 2 ? 120 : 90;
    const played = sides.map((side) => [
      ...state.players[side].slice(0, 11).map((gp) => gp.idx),
      ...state.changes[side].entered,
    ]);
    for (const side of sides) {
      const whole = setup.model ? lineMinutes(state, side, played[side]!, end) : undefined;
      for (const idx of played[side]!) {
        const gp = state.players[side][idx]!;
        this.lines[side][idx]![M.minutes] =
          whole?.get(idx) ?? Math.max(1, Math.round((gp.offMin ?? end) - gp.onMin));
      }
    }
    const metrics = sides.map((side) => {
      const total = zeroMetrics();
      for (const line of this.lines[side])
        for (let i = 0; i < M.minutes; i++) total[i]! += line[i]!;
      total[M.minutes] = end;
      return total;
    }) as [number[], number[]];
    // MATCH-3: the share of attempted passes on the candidate model; the pre-feature model keeps
    // its seconds on the ball (its golden facts).
    const home =
      setup.model === undefined
        ? possessionShare(this.held[0], this.held[1])
        : possessionShare(metrics[0]![M.passes]!, metrics[1]![M.passes]!);
    metrics[0]![M.possession] = home;
    metrics[1]![M.possession] = 90 - home;
    const players: MatchRecord['players'] = [];
    const lineCounts: [number, number] = [0, 0];
    if (setup.recordPlayers)
      for (const side of sides)
        for (const idx of played[side]!) {
          players.push({
            id: setup.rosters[side][idx]!.id,
            metrics: this.lines[side][idx]!,
            detail: this.pd[side][idx]!,
          });
          lineCounts[side]++;
        }
    return {
      metrics,
      players,
      highlights: this.highlights,
      // The candidate model tracks incidents, so its record always carries the list (→MATCH-27).
      ...(this.incidents.length || setup.model ? { incidents: this.incidents } : {}),
      xg: [Math.round(this.xg[0] * 100) / 100, Math.round(this.xg[1] * 100) / 100],
      detail: this.td,
      ...(setup.recordPlayers ? { lineCounts } : {}),
      ...(this.material ? { material: this.material.finish(played) } : {}),
    };
  }
}
