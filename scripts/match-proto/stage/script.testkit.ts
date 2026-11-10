// Test-only builders of hand-written scripts for the stage's tests (synthetic, ARCH-21).
import { CENTRE, HALFWAY, toAttack } from '../core/pitch.ts';
import { offsideLineX } from '../core/shape.ts';
import type {
  Beat,
  BeatKind,
  BeatOutcome,
  BeatReason,
  Fixture,
  Frame,
  Playback,
  Script,
  TeamId,
  Vec,
} from '../core/types.ts';

export interface BeatSpec {
  kind: BeatKind;
  actor: number;
  to: Vec;
  team?: TeamId;
  receiver?: number;
  opponent?: number;
  outcome?: BeatOutcome;
  reason?: BeatReason;
  loft?: boolean;
  through?: boolean;
  header?: boolean;
  hold?: number;
  possession?: number;
}

/**
 * Beats from specs: `index` in order, `from` = the previous beat's `to` (`CENTRE` first), phase
 * `buildUp`, move `test`, no loft/through/header, hold 1, team 0, outcome `complete` and possession
 * 1 unless given. Every player named must be one of the fixture's.
 */
export function beats(fixture: Fixture, list: readonly BeatSpec[]): Beat[] {
  let from: Vec = CENTRE;
  return list.map((s, index): Beat => {
    for (const i of [s.actor, s.receiver, s.opponent]) {
      if (i !== undefined && !fixture.players[i]) throw new Error('no player ' + i);
    }
    const beat: Beat = {
      index,
      possession: s.possession ?? 1,
      team: s.team ?? 0,
      phase: 'buildUp',
      move: 'test',
      kind: s.kind,
      actor: s.actor,
      ...(s.receiver !== undefined ? { receiver: s.receiver } : {}),
      ...(s.opponent !== undefined ? { opponent: s.opponent } : {}),
      from,
      to: s.to,
      loft: s.loft ?? false,
      through: s.through ?? false,
      header: s.header ?? false,
      outcome: s.outcome ?? 'complete',
      ...(s.reason !== undefined ? { reason: s.reason } : {}),
      hold: s.hold ?? 1,
    };
    from = s.to;
    return beat;
  });
}

/** A script of `beats(fixture, list)`. */
export function scriptOf(fixture: Fixture, list: readonly BeatSpec[]): Script {
  const built = beats(fixture, list);
  return { seed: 'hand', fixture, beats: built, times: built.map((_, i) => i), nominalSeconds: 0 };
}

/** Player `index`'s position in a frame. */
export const posOf = (frame: Frame, index: number): Vec => [
  frame.p[index * 2],
  frame.p[index * 2 + 1],
];

/**
 * Kicks of ordinary passes (kind `pass`, not through) in a playback, and how many were played to a
 * receiver beyond the halfway line, the ball and the offside line of that frame, each by over 0.05.
 */
export function offsideKicks(p: Playback): { kicks: number; offside: number } {
  let kicks = 0;
  let offside = 0;
  const byIndex = new Map(p.beats.map((b) => [b.index, b]));
  const byTime = new Map(p.frames.map((f) => [Math.round(f.t * 1000), f]));
  for (const e of p.events) {
    if (e.kind !== 'kick' || e.other === undefined) continue;
    const beat = byIndex.get(e.beat);
    const frame = byTime.get(Math.round(e.t * 1000));
    if (!beat || !frame || beat.kind !== 'pass' || beat.through) continue;
    kicks += 1;
    const T = beat.team;
    const rx = toAttack(T, posOf(frame, e.other))[0];
    const bx = toAttack(T, [frame.ball[0], frame.ball[1]])[0];
    const all = Array.from({ length: 22 }, (_, i) => posOf(frame, i));
    const line = offsideLineX(p.fixture, all, T);
    if (rx > HALFWAY + 0.05 && rx > bx + 0.05 && rx > line + 0.05) offside += 1;
  }
  return { kicks, offside };
}
