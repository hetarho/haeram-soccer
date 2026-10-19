/** The only place a grid match is counted: team and player metrics, goals, xG and possession (→MATCH-11, MATCH-13). */
import { emptyPlayerDetail, emptyTeamDetail } from '../../../contracts/src/detail';
import type { MatchRecord } from '../../../contracts/src/types';
import { zeroMetrics } from '../primitives';
import type { GridSetup } from './setup';
import type { GridState } from './state';

const M = {
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

export class Tally {
  private readonly lines: [number[][], number[][]];
  private readonly xg: [number, number] = [0, 0];
  private readonly held: [number, number] = [0, 0];
  readonly highlights: MatchRecord['highlights'] = [];

  constructor(private readonly setup: GridSetup) {
    this.lines = [
      setup.rosters[0].map(() => zeroMetrics()),
      setup.rosters[1].map(() => zeroMetrics()),
    ];
  }

  private add(side: 0 | 1, idx: number, metric: number, n = 1) {
    this.lines[side][idx]![metric]! += n;
  }

  /** A pass, cross or cut-back attempt by `idx`; `ok` when it reached a teammate. */
  pass(side: 0 | 1, idx: number, ok: boolean): void {
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
    if (result === 'goal' || result === 'save') this.add(side, idx, M.onTarget);
    this.xg[side] += recordedXg;
  }

  tackle(side: 0 | 1, idx: number): void {
    this.add(side, idx, M.tackles);
  }

  interception(side: 0 | 1, idx: number): void {
    this.add(side, idx, M.interceptions);
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

  possession(side: 0 | 1, seconds: number): void {
    this.held[side] += seconds;
  }

  goals(side: 0 | 1): number {
    return this.lines[side].reduce((sum, line) => sum + line[M.goals]!, 0);
  }

  finish(
    state: GridState,
  ): Pick<MatchRecord, 'metrics' | 'players' | 'highlights' | 'xg' | 'detail' | 'lineCounts'> {
    const { setup } = this;
    // Starters play the whole match until substitutions and cards exist (T213, T214).
    const sides = [0, 1] as const;
    const played = sides.map((side) =>
      this.lines[side].map((line, idx) => {
        const gp = state.players[side][idx]!;
        if (idx < 11 && !gp.sentOff) line[M.minutes] = 90;
        return idx < 11;
      }),
    );
    const metrics = sides.map((side) => {
      const total = zeroMetrics();
      for (const line of this.lines[side]) for (let i = 0; i < 10; i++) total[i]! += line[i]!;
      total[M.minutes] = 90;
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
        this.lines[side].forEach((line, idx) => {
          if (!played[side]![idx]) return;
          players.push({
            id: setup.rosters[side][idx]!.id,
            metrics: line,
            detail: emptyPlayerDetail(),
          });
          lineCounts[side]++;
        });
    return {
      metrics,
      players,
      highlights: this.highlights,
      xg: [Math.round(this.xg[0] * 100) / 100, Math.round(this.xg[1] * 100) / 100],
      detail: [emptyTeamDetail(), emptyTeamDetail()],
      ...(setup.recordPlayers ? { lineCounts } : {}),
    };
  }
}
