/** The touch-by-touch trace playback is built from (→MATCH-24). Only kept when the match is observed. */
import type { GridPlayer, GridState } from './state';

export interface TraceEntry {
  /** Match seconds since kick-off across periods. */
  elapsed: number;
  period: 1 | 2 | 3 | 4;
  /** The side and roster index of the player acting. */
  side: 0 | 1;
  idx: number;
  /** What he did, e.g. `pass`, `shot`, or a restart kind, and how it ended. */
  action: string;
  outcome: string;
  /** Where the actor stood when he acted (engine frame); absent for restarts. */
  from?: [number, number];
  /** Ball position in the engine frame after the action. */
  ball: [number, number];
  /** Engine-frame metres of roster slots 0–10 of each side, x then y; NaN for an empty slot. */
  positions: Float32Array;
}

export class Tracer {
  readonly entries: TraceEntry[] = [];
  constructor(private readonly on: boolean) {}

  push(
    s: GridState,
    side: 0 | 1,
    idx: number,
    action: string,
    outcome: string,
    from?: [number, number],
  ): void {
    if (!this.on) return;
    const positions = new Float32Array(44).fill(NaN);
    for (const sd of [0, 1] as const)
      s.players[sd].forEach((gp: GridPlayer) => {
        if (gp.onPitch && !gp.sentOff && gp.slot >= 0 && gp.slot < 11) {
          positions[sd * 22 + gp.slot * 2] = gp.pos[0];
          positions[sd * 22 + gp.slot * 2 + 1] = gp.pos[1];
        }
      });
    this.entries.push({
      elapsed: s.elapsed,
      period: s.period,
      side,
      idx,
      action,
      outcome,
      ...(from ? { from } : {}),
      ball: [s.ball[0], s.ball[1]],
      positions,
    });
  }
}
