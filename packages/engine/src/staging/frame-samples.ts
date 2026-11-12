/** Sample the fitted picture; interpolation reads positions, never settles an action. */
import type { MatchScript } from '../../../contracts/src/match-script';
import type { FrameStoppage, MatchMotionSample, PlayerMotion } from '../../../contracts/src/types';
import { MATCH_MOTION_CONFIG } from '../match/motion';
import { matchSecond, rateAt, type ClockRate } from './frame-clock';
import { playerId, restartKind, units, type FrameIdentity } from './frame-events';
import { STAGING_CONFIG } from './config';
import type { StageEvent, StageFrame } from './staging';

export interface TimedFrame {
  time: number;
  frame: StageFrame;
  rate: ClockRate;
}
export interface TimedEvent {
  time: number;
  event: StageEvent;
}
export const timedFrames = (
  frames: readonly StageFrame[],
  rates: readonly ClockRate[],
): TimedFrame[] =>
  frames.flatMap((frame) => {
    const rate = rateAt(rates, frame.t);
    return rate ? [{ time: matchSecond(rate, frame.t), frame, rate }] : [];
  });
export const timedEvents = (
  events: readonly StageEvent[],
  rates: readonly ClockRate[],
): TimedEvent[] =>
  events.flatMap((event) => {
    const rate = rateAt(rates, event.t);
    return rate ? [{ time: matchSecond(rate, event.t), event }] : [];
  });

export function lastAt<T>(list: readonly T[], time: number, at: (value: T) => number): number {
  let lo = 0,
    hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (at(list[mid]) <= time + 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function ownership(
  frames: readonly TimedFrame[],
  events: readonly TimedEvent[],
  script: MatchScript,
  identity: FrameIdentity,
): [number, string][] {
  const beats = new Map(script.beats.map((b, i) => [b.index, i]));
  const changes: { time: number; who: string; order: number }[] = frames.map(({ time, frame }) => ({
    time,
    who: frame.mode === 'held' ? playerId(identity, frame.owner) : '',
    order: 0,
  }));
  for (const { time, event: e } of events) {
    let who: string | undefined;
    if (
      [
        'kick',
        'shot',
        'foul',
        'offside',
        'out',
        'goal',
        'loose',
        'whistle',
        'card',
        'sub',
        'injury',
      ].includes(e.kind)
    )
      who = '';
    if (['receive', 'intercept', 'tackle'].includes(e.kind)) who = playerId(identity, e.other);
    if (e.kind === 'save')
      who =
        script.beats[(beats.get(e.beat) ?? -1) + 1]?.kind === 'corner'
          ? ''
          : playerId(identity, e.other);
    if (who !== undefined) changes.push({ time, who, order: 1 });
  }
  changes.sort((a, b) => a.time - b.time || a.order - b.order);
  const out: [number, string][] = [];
  for (const c of changes) {
    if (out.at(-1)?.[0] === c.time) out.pop();
    if (out.at(-1)?.[1] !== c.who) out.push([c.time, c.who]);
  }
  return out;
}

export function pictureAt(
  frames: readonly TimedFrame[],
  owners: readonly [number, string][],
  time: number,
  identity: FrameIdentity,
): { sample: MatchMotionSample; height: number } {
  const index = Math.max(
    0,
    lastAt(frames, time, (f) => f.time),
  );
  const a = frames[index],
    b = frames[index + 1] ?? a;
  const mix = b.time > a.time ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))) : 0;
  const lerp = (from: number, to: number) => from + (to - from) * mix;
  const ownerId =
    owners[
      Math.max(
        0,
        lastAt(owners, time, (o) => o[0]),
      )
    ]?.[1] ?? '';
  const players: [PlayerMotion[], PlayerMotion[]] = [[], []];
  for (const p of a.frame.p) {
    const next =
      b.frame.p.find((q) => q.player.side === p.player.side && q.player.line === p.player.line) ??
      p;
    const id = playerId(identity, p.player);
    const movement = p.movement;
    players[p.player.side].push({
      id,
      position: units([lerp(p.at[0], next.at[0]), lerp(p.at[1], next.at[1])]),
      velocity: units([
        (movement?.velocity[0] ?? 0) / a.rate.rate,
        (movement?.velocity[1] ?? 0) / a.rate.rate,
      ]),
      state:
        p.slot === 0
          ? 'keeper'
          : id === ownerId
            ? 'carry'
            : movement?.state === 'carry'
              ? 'support'
              : (movement?.state ?? 'shape'),
      intent: units(movement?.intent ?? p.at),
    });
  }
  // Slot order is a rendering concern, while ids remain record-line identities.
  for (const side of [0, 1] as const) {
    const slots = new Map(
      a.frame.p
        .filter((p) => p.player.side === side)
        .map((p) => [playerId(identity, p.player), p.slot]),
    );
    players[side].sort((x, y) => slots.get(x.id)! - slots.get(y.id)!);
  }
  const { ball, height } = ballAt(frames, time);
  const phase: MatchMotionSample['phase'] = !a.frame.live
    ? 'restart'
    : a.frame.mode === 'flight'
      ? a.frame.action === 'shot' || a.frame.action === 'penalty'
        ? 'shot'
        : 'pass'
      : a.frame.phase === 'counter'
        ? 'transition'
        : 'possession';
  return {
    sample: { elapsedSeconds: time, ball, players, phase, ...(ownerId ? { ownerId } : {}) },
    height,
  };
}

/** Ball tracks keep every staged tick without constructing another 22 player objects per knot. */
export function ballAt(
  frames: readonly TimedFrame[],
  time: number,
): { ball: [number, number]; height: number } {
  const index = Math.max(
    0,
    lastAt(frames, time, (f) => f.time),
  );
  const a = frames[index],
    b = frames[index + 1] ?? a;
  const mix = b.time > a.time ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))) : 0;
  const lerp = (from: number, to: number) => from + (to - from) * mix;
  return {
    ball: units([lerp(a.frame.ball[0], b.frame.ball[0]), lerp(a.frame.ball[1], b.frame.ball[1])]),
    height: Math.min(
      MATCH_MOTION_CONFIG.ball.maxLoft,
      (lerp(a.frame.ball[2], b.frame.ball[2]) * MATCH_MOTION_CONFIG.ball.maxLoft) /
        STAGING_CONFIG.ball.loftMax,
    ),
  };
}

export interface TimedStoppage extends FrameStoppage {
  period: number;
}
export function frameStoppages(
  script: MatchScript,
  events: readonly TimedEvent[],
): TimedStoppage[] {
  const out: TimedStoppage[] = [];
  const byBeat = new Map(script.beats.map((b) => [b.index, b]));
  const first = new Set(
    [1, 2, 3, 4].map((period) => script.beats.find((b) => b.period === period)?.index),
  );
  let dead: number | undefined, settled: number | undefined;
  let incident = false;
  for (const { time, event: e } of events) {
    const b = byBeat.get(e.beat)!;
    if (b.period === 5) continue;
    const opening = first.has(b.index) && b.kind === 'kickOff';
    if (
      e.kind === 'begin' &&
      (restartKind(b) || b.kind === 'stoppage' || b.incidents?.length) &&
      !opening
    )
      dead ??= time;
    if (['goal', 'out', 'foul', 'offside', 'card', 'injury', 'sub'].includes(e.kind)) dead ??= time;
    if (['card', 'injury', 'sub'].includes(e.kind)) incident = true;
    if (e.kind === 'settled') settled = time;
    if ((e.kind === 'kick' || e.kind === 'shot') && !opening && dead !== undefined) {
      out.push({
        period: b.period,
        kind: restartKind(b) ?? 'dropBall',
        dead,
        settled: Math.max(dead, Math.min(settled ?? time, time)),
        kick: time,
      });
      dead = settled = undefined;
      incident = false;
    }
    if (e.kind === 'whistle') {
      if (dead !== undefined && incident)
        out.push({ period: b.period, kind: 'dropBall', dead, settled: time, kick: time });
      dead = settled = undefined;
      incident = false;
    }
  }
  return out;
}
