// Test-only builders of tiny synthetic playbacks for the metrics' tests (synthetic, ARCH-21).
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE } from '../core/pitch.ts';
import { demoFixture } from '../core/squads.ts';
import type {
  BallMode,
  Beat,
  Frame,
  Phase,
  Playback,
  StageEvent,
  TeamId,
  Vec,
} from '../core/types.ts';
import { kickOffSpot } from '../stage/world.ts';

const FIXTURE = demoFixture();
/** Every player on his kick-off place when team 0 kicks off (nobody on the spot). */
const KICK_OFF: readonly Vec[] = FIXTURE.players.map((p) => kickOffSpot(FIXTURE, p.index, 0, -1));

export interface FrameOverrides {
  ball?: Vec | readonly [number, number, number];
  owner?: number;
  mode?: BallMode;
  team?: TeamId;
  phase?: Phase;
  live?: boolean;
  beat?: number;
  /** Player index → world position. */
  players?: Readonly<Record<number, Vec>>;
}

/** A frame at `t`: everyone on his kick-off place, the ball loose at the centre, live build-up by team 0. */
export function frameOf(t: number, o: FrameOverrides = {}): Frame {
  const p = KICK_OFF.flatMap(([x, y]) => [x, y]);
  for (const [index, [x, y]] of Object.entries(o.players ?? {})) {
    p[Number(index) * 2] = x;
    p[Number(index) * 2 + 1] = y;
  }
  const ball = o.ball ?? CENTRE;
  return {
    t,
    ball: [ball[0], ball[1], ball[2] ?? 0],
    owner: o.owner ?? -1,
    mode: o.mode ?? 'loose',
    team: o.team ?? 0,
    phase: o.phase ?? 'buildUp',
    live: o.live ?? true,
    beat: o.beat ?? 0,
    p,
  };
}

/** Player `index`'s kick-off place. */
export const kickOffPlace = (index: number): Vec => KICK_OFF[index];

/**
 * A playback of the given frames, events and beats: the demo fixture, `hz` from the config,
 * `duration` the last frame's `t` and the score of the last goal event (or 0-0).
 */
export function fakePlayback(parts: {
  frames: Frame[];
  events?: StageEvent[];
  beats?: Beat[];
}): Playback {
  const events = parts.events ?? [];
  const goal = events.filter((e) => e.kind === 'goal').at(-1);
  return {
    version: 1,
    seed: 'fake',
    hz: PROTO_CONFIG.hz,
    duration: parts.frames.at(-1)?.t ?? 0,
    fixture: FIXTURE,
    beats: parts.beats ?? [],
    frames: parts.frames,
    events,
    score: goal?.score ?? [0, 0],
  };
}
