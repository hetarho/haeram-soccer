// The viewer's pure model: what the page shows at a time `t`, read from a recorded playback. It
// interpolates recorded frames and never computes football (ARCH-7); no DOM here.
import { PROTO_CONFIG } from '../core/config.ts';
import { HALFWAY, PITCH, oppGoal, toAttack } from '../core/pitch.ts';
import { playerLabel } from '../core/squads.ts';
import type { Phase, Playback, StageEventKind, TeamId, Vec } from '../core/types.ts';
import { clamp, norm, sub } from '../core/vec.ts';

const { viewer } = PROTO_CONFIG;

export interface PlayerSample {
  x: number;
  y: number;
  /** Unit facing vector. */
  fx: number;
  fy: number;
}
export interface Sample {
  t: number;
  ball: [number, number, number];
  owner: number;
  players: PlayerSample[];
  team: TeamId;
  phase: Phase;
  live: boolean;
  beat: number;
}

const frameIndex = (playback: Playback, t: number): { i: number; u: number } => {
  const last = playback.frames.length - 1;
  const at = clamp(t, 0, playback.duration) * playback.hz;
  const i = clamp(Math.floor(at), 0, Math.max(0, last));
  return { i, u: i >= last ? 0 : clamp(at - i, 0, 1) };
};

const posAt = (playback: Playback, frame: number, player: number): Vec => {
  const p = playback.frames[frame].p;
  return [p[player * 2], p[player * 2 + 1]];
};

/** The facing of `player` at frame `i`: his displacement to the next frame, else the last one above stillness, else toward the opponents' goal. */
const facingAt = (playback: Playback, i: number, player: number, team: TeamId): Vec => {
  const last = playback.frames.length - 1;
  const here = posAt(playback, i, player);
  const ahead = sub(posAt(playback, Math.min(i + 1, last), player), here);
  if (Math.hypot(ahead[0], ahead[1]) >= viewer.still) return norm(ahead);
  for (let j = i; j >= 1 && j > i - viewer.lookBack; j--) {
    const d = sub(posAt(playback, j, player), posAt(playback, j - 1, player));
    if (Math.hypot(d[0], d[1]) >= viewer.still) return norm(d);
  }
  return norm(sub(oppGoal(team), here));
};

/** The state at `t`: positions and the ball interpolated linearly between the two frames around it. */
export function sampleAt(playback: Playback, t: number): Sample {
  const { i, u } = frameIndex(playback, t);
  const last = playback.frames.length - 1;
  const a = playback.frames[i];
  const b = playback.frames[Math.min(i + 1, last)];
  const mix = (x: number, y: number): number => x + (y - x) * u;
  const players = playback.fixture.players.map((player): PlayerSample => {
    const k = player.index * 2;
    const [fx, fy] = facingAt(playback, i, player.index, player.team);
    return { x: mix(a.p[k], b.p[k]), y: mix(a.p[k + 1], b.p[k + 1]), fx, fy };
  });
  return {
    t: clamp(t, 0, playback.duration),
    ball: [mix(a.ball[0], b.ball[0]), mix(a.ball[1], b.ball[1]), mix(a.ball[2], b.ball[2])],
    owner: a.owner,
    players,
    team: a.team,
    phase: a.phase,
    live: a.live,
    beat: a.beat,
  };
}

/** `mm:ss` of the staged time, rounded down to the second. */
export function clockLabel(t: number): string {
  const s = Math.floor(Math.max(0, t));
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

export interface View {
  /** Pixels per metre. */
  scale: number;
  /** Pixel position of world (0, 0). */
  ox: number;
  oy: number;
}

/** Pixels per metre and the pixel position of world (0, 0) so the pitch plus `pad` metres fits `width × height`, centred. */
export function fitPitch(width: number, height: number, pad: number): View {
  const scale = Math.min(width / (PITCH.length + 2 * pad), height / (PITCH.width + 2 * pad));
  return {
    scale,
    ox: (width - PITCH.length * scale) / 2,
    oy: (height - PITCH.width * scale) / 2,
  };
}

/** World point to canvas pixels. */
export function toCanvas(view: View, p: Vec): [number, number] {
  return [view.ox + p[0] * view.scale, view.oy + p[1] * view.scale];
}

/** The score after the last goal at or before `t`. */
export function scoreAt(playback: Playback, t: number): [number, number] {
  let score: readonly [number, number] = [0, 0];
  for (const e of playback.events) {
    if (e.t > t) break;
    if (e.kind === 'goal' && e.score) score = e.score;
  }
  return [score[0], score[1]];
}

/** `#<index> <move> · <kind> · <outcome>[ · <reason>]  <actor>[ → <receiver>][ × <opponent>]` from the beat at `t`. */
export function captionAt(playback: Playback, t: number): string {
  const { i } = frameIndex(playback, t);
  const index = playback.frames[i]?.beat;
  const beat = playback.beats.find((b) => b.index === index);
  if (beat === undefined) return '';
  const label = (player: number): string => playerLabel(playback.fixture, player);
  const ids = [beat.move, beat.kind, beat.outcome];
  if (beat.reason !== undefined) ids.push(beat.reason);
  let who = label(beat.actor);
  if (beat.receiver !== undefined) who += ` → ${label(beat.receiver)}`;
  if (beat.opponent !== undefined) who += ` × ${label(beat.opponent)}`;
  return `#${beat.index} ${ids.join(' · ')}  ${who}`;
}

export interface Flash {
  kind: StageEventKind;
  at: Vec;
  /** Offside flashes: world x of the defending line. */
  line?: number;
  /** Seconds since the event. */
  age: number;
}

const FLASH_KINDS: readonly StageEventKind[] = [
  'goal',
  'offside',
  'save',
  'block',
  'tackle',
  'intercept',
];

/** `goal`, `offside`, `save`, `block`, `tackle`, `intercept` events of the last `viewer.flashSeconds`. */
export function flashesAt(playback: Playback, t: number): Flash[] {
  const flashes: Flash[] = [];
  for (const e of playback.events) {
    if (e.t > t) break;
    const age = t - e.t;
    if (age > viewer.flashSeconds || !FLASH_KINDS.includes(e.kind)) continue;
    flashes.push({
      kind: e.kind,
      at: e.at,
      ...(e.line === undefined ? {} : { line: e.line }),
      age,
    });
  }
  return flashes;
}

/**
 * World x of the offside line each team attacks against, from the sample's positions: the
 * second-last opponent's x, the ball when it is nearer the goal, never inside the team's own half.
 */
export function offsideLines(playback: Playback, sample: Sample): [number, number] {
  const line = (team: TeamId): number => {
    const xs = playback.fixture.players
      .filter((p) => p.team !== team)
      .map((p) => toAttack(team, [sample.players[p.index].x, sample.players[p.index].y])[0])
      .sort((a, b) => b - a);
    const ballX = toAttack(team, [sample.ball[0], sample.ball[1]])[0];
    const x = Math.max(xs[1] ?? HALFWAY, ballX, HALFWAY);
    return toAttack(team, [x, 0])[0];
  };
  return [line(0), line(1)];
}

/** The ball's ground positions over the last `viewer.trailSeconds`, oldest first, ending at `t`. */
export function trailAt(playback: Playback, t: number): Vec[] {
  const now = sampleAt(playback, t);
  const from = Math.max(0, now.t - viewer.trailSeconds);
  const trail: Vec[] = [];
  const first = Math.ceil(from * playback.hz);
  for (let i = first; i < playback.frames.length && i / playback.hz < now.t; i++) {
    const b = playback.frames[i].ball;
    trail.push([b[0], b[1]]);
  }
  trail.push([now.ball[0], now.ball[1]]);
  return trail;
}
