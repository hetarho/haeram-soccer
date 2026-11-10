// Test-only builders of hand-written scripts for the stage's tests (synthetic, ARCH-21).
import { CENTRE } from '../core/pitch.ts';
import type {
  Beat,
  BeatKind,
  BeatOutcome,
  BeatReason,
  Fixture,
  Frame,
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
      through: false,
      header: false,
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
