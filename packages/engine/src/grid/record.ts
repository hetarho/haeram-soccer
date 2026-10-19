/** The only place a grid match is counted: team and player metrics, goals, xG and possession (→MATCH-11, MATCH-13). */
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../../contracts/src/detail';
import type { Incident, MatchRecord } from '../../../contracts/src/types';
import { zeroMetrics } from '../primitives';
import { CELL_BASELINES } from './baselines';
import { BAND_EDGES, bandOf, cellOf, inBox, type Point } from './pitch';
import type { RestartKind } from './restarts';
import type { GridSetup } from './setup';
import type { GridState } from './state';

/** Indexes of the per-player and team metric lines. */
export const M = {
  goals: 0,
  assists: 1,
  passes: 2,
  completed: 3,
  shots: 4,
  onTarget: 5,
  tackles: 6,
  interceptions: 7,
  dribbles: 8,
  saves: 9,
  minutes: 10,
  possession: 11,
} as const;

/** x (attack frame) where the final third starts, and where a won ball counts as a press action. */
const FINAL_THIRD = BAND_EDGES[5];
const PRESS_FROM = BAND_EDGES[3];

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
}

export class Tally {
  private readonly lines: [number[][], number[][]];
  private readonly xg: [number, number] = [0, 0];
  private readonly held: [number, number] = [0, 0];
  /** Team (TD) and player (PD) advanced counters (→MATCH-13). */
  private readonly td: [number[], number[]] = [emptyTeamDetail(), emptyTeamDetail()];
  private readonly pd: [number[][], number[][]];
  readonly highlights: MatchRecord['highlights'] = [];
  readonly incidents: Incident[] = [];
  readonly diagnostics: GridDiagnostics = {
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

  constructor(private readonly setup: GridSetup) {
    this.lines = [
      setup.rosters[0].map(() => zeroMetrics()),
      setup.rosters[1].map(() => zeroMetrics()),
    ];
    this.pd = [
      setup.rosters[0].map(() => emptyPlayerDetail()),
      setup.rosters[1].map(() => emptyPlayerDetail()),
    ];
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
   * `from` and reaches `to`; `ok` when a teammate got it.
   */
  passEvent(
    side: 0 | 1,
    idx: number,
    e: {
      from: Point;
      to: Point;
      ok: boolean;
      kind: 'short' | 'long' | 'switch' | 'through' | 'cross' | 'cutBack';
      lineBreaking?: boolean;
    },
  ): void {
    this.pass(side, idx, e.ok);
    const [dx, dy] = [e.to[0] - e.from[0], e.to[1] - e.from[1]];
    const direction = e.kind === 'cross' || dx > Math.abs(dy) ? 0 : -dx > Math.abs(dy) ? 2 : 1;
    this.diagnostics.directions[side][direction]!++;
    const start = bandOf(e.from[0]);
    const end = bandOf(e.to[0]);
    if (e.from[0] < FINAL_THIRD) this.count(side, undefined, TD.buildUpPasses, undefined);
    else {
      this.count(side, idx, TD.finalThirdPasses, PD.finalThirdPasses);
      if (e.ok) this.count(side, idx, TD.finalThirdCompleted, PD.finalThirdCompleted);
    }
    if (e.kind === 'cross') {
      this.count(side, idx, TD.crosses, PD.crosses);
      if (e.ok) this.count(side, idx, TD.crossesCompleted, PD.crossesCompleted);
    }
    if (e.kind === 'cutBack') this.count(side, idx, TD.cutBacks, PD.cutBacks);
    if (e.kind === 'through') {
      this.count(side, idx, TD.throughBalls, PD.throughBalls);
      if (e.ok) this.count(side, idx, TD.throughBallsCompleted, PD.throughBallsCompleted);
    }
    if (!e.ok) return;
    if (end > start) this.count(side, idx, TD.progressivePasses, PD.progressivePasses);
    if (e.lineBreaking) this.count(side, idx, TD.lineBreakingPasses, PD.lineBreakingPasses);
    this.movement(side, idx, e.from, e.to);
  }

  /** What a completed pass or carry gains: box and front-of-box entries and expected threat. */
  private movement(side: 0 | 1, idx: number, from: Point, to: Point): void {
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
  }

  /** The ball won by `(side, idx)` at `at` (his attack frame): a high turnover from x ≥ 70. */
  regain(side: 0 | 1, idx: number, at: Point): void {
    if (at[0] >= FINAL_THIRD) this.count(side, idx, TD.highTurnovers, PD.highTurnovers);
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

  foul(foulerSide: 0 | 1, fouler: number, fouled: number): void {
    this.count(foulerSide, fouler, TD.fouls, PD.fouls);
    this.count((1 - foulerSide) as 0 | 1, fouled, undefined, PD.foulsWon);
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

  /** A tackle or interception at `at` (the winner's attack frame); from x ≥ 35 it is a press action (PPDA). */
  tackle(side: 0 | 1, idx: number, at?: Point): void {
    this.add(side, idx, M.tackles);
    if (at && at[0] >= PRESS_FROM) this.count(side, undefined, TD.pressActions, undefined);
  }

  interception(side: 0 | 1, idx: number, at?: Point): void {
    this.add(side, idx, M.interceptions);
    if (at && at[0] >= PRESS_FROM) this.count(side, undefined, TD.pressActions, undefined);
  }

  dribble(side: 0 | 1, idx: number): void {
    this.add(side, idx, M.dribbles);
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
      action: '골',
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

  finish(
    state: GridState,
  ): Pick<
    MatchRecord,
    'metrics' | 'players' | 'highlights' | 'xg' | 'detail' | 'lineCounts' | 'incidents'
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
    for (const side of sides)
      for (const idx of played[side]!) {
        const gp = state.players[side][idx]!;
        this.lines[side][idx]![M.minutes] = Math.max(1, Math.round((gp.offMin ?? end) - gp.onMin));
      }
    const metrics = sides.map((side) => {
      const total = zeroMetrics();
      for (const line of this.lines[side])
        for (let i = 0; i < M.minutes; i++) total[i]! += line[i]!;
      total[M.minutes] = end;
      return total;
    }) as [number[], number[]];
    const seconds = this.held[0] + this.held[1];
    const home = seconds > 0 ? Math.round((90 * this.held[0]) / seconds) : 45;
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
      ...(this.incidents.length ? { incidents: this.incidents } : {}),
      xg: [Math.round(this.xg[0] * 100) / 100, Math.round(this.xg[1] * 100) / 100],
      detail: this.td,
      ...(setup.recordPlayers ? { lineCounts } : {}),
    };
  }
}
