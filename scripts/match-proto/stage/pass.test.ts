import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { demoFixture } from '../core/squads.ts';
import type { Frame, Playback, StageEvent, Vec } from '../core/types.ts';
import { add, dist, norm, scale, sub } from '../core/vec.ts';
import { performScript } from './perform.ts';
import { posOf, type BeatSpec, scriptOf as buildScript } from './script.testkit.ts';

const fixture = demoFixture();
const STAGE = PROTO_CONFIG.stage;

const scriptOf = (specs: readonly BeatSpec[]) => buildScript(fixture, specs);

/** H6 (index 5) receives the kick-off on [45, 30] and plays the beat that follows. */
const KICK_OFF: BeatSpec = { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] };
const PASSER = 5;

/** Where the ball and each player stand when beat 1 starts (it does not depend on beat 1). */
const opening = performScript(
  scriptOf([KICK_OFF, { kind: 'pass', actor: PASSER, receiver: 2, to: [26, 22] }]),
  { duration: 30 },
);
const openingFrame = (): Frame => {
  const frame = opening.frames.find((f) => f.beat === 1);
  if (!frame) throw new Error('beat 1 never starts');
  return frame;
};
const ballAt = (frame: Frame): Vec => [frame.ball[0], frame.ball[1]];
/** The point `metres` from `from` (the ball by default) at beat 1's start toward `index`'s place then. */
const toward = (index: number, metres: number, from?: number): Vec => {
  const frame = openingFrame();
  const origin = from === undefined ? ballAt(frame) : posOf(frame, from);
  return add(origin, scale(norm(sub(posOf(frame, index), origin)), metres));
};

const firstFrameOf = (p: Playback, beat: number): Frame => {
  const frame = p.frames.find((f) => f.beat === beat);
  if (!frame) throw new Error('beat ' + beat + ' never starts');
  return frame;
};
const eventOf = (p: Playback, beat: number, kind: StageEvent['kind']): StageEvent => {
  const event = p.events.find((e) => e.beat === beat && e.kind === kind);
  if (!event) throw new Error('beat ' + beat + ' has no ' + kind);
  return event;
};
const frameAt = (p: Playback, t: number): Frame => {
  const frame = p.frames.find((f) => Math.abs(f.t - t) < 1e-6);
  if (!frame) throw new Error('no frame at ' + t);
  return frame;
};
/** How far `index` gets from where he stood at beat `beat`'s first frame before its kick. */
const driftBeforeKick = (p: Playback, beat: number, index: number): number => {
  const start = firstFrameOf(p, beat);
  const kick = eventOf(p, beat, 'kick');
  const from = posOf(start, index);
  let most = 0;
  for (const f of p.frames) {
    if (f.t < start.t || f.t > kick.t) continue;
    most = Math.max(most, dist(from, posOf(f, index)));
  }
  return most;
};

/** The share of frames from `from` seconds after beat `beat` starts until its kick in which `index` moves at `speed` m/s at least. */
const movingShare = (
  p: Playback,
  beat: number,
  index: number,
  from: number,
  speed: number,
): number => {
  const start = firstFrameOf(p, beat).t + from;
  const kick = eventOf(p, beat, 'kick').t;
  let moving = 0;
  let all = 0;
  for (let k = 1; k < p.frames.length; k++) {
    const f = p.frames[k];
    if (f.t < start || f.t > kick) continue;
    const prev = p.frames[k - 1];
    all += 1;
    if (dist(posOf(prev, index), posOf(f, index)) / (f.t - prev.t) >= speed) moving += 1;
  }
  return all === 0 ? 0 : moving / all;
};

describe('pass staging', () => {
  it('the passer keeps the ball moving while he holds', () => {
    const p = performScript(
      scriptOf([KICK_OFF, { kind: 'pass', actor: PASSER, receiver: 2, to: [26, 22], hold: 3 }]),
      { duration: 30 },
    );
    const start = firstFrameOf(p, 1);
    expect(eventOf(p, 1, 'kick').t - start.t).toBeGreaterThan(2.5);
    expect(movingShare(p, 1, PASSER, 0.6, 1)).toBeGreaterThanOrEqual(0.9);
  });

  it('the nearest opponent closes on a man holding the ball, keeps moving and lunges', () => {
    const p = performScript(
      scriptOf([KICK_OFF, { kind: 'pass', actor: PASSER, receiver: 2, to: [26, 22], hold: 4 }]),
      { duration: 30 },
    );
    const start = firstFrameOf(p, 1).t + 1;
    const kick = eventOf(p, 1, 'kick').t;
    const opponents = fixture.teams[1].players.filter((q) => q.slot !== 0).map((q) => q.index);
    let near = 0;
    let moving = 0;
    let closest = Infinity;
    for (let k = 1; k < p.frames.length; k++) {
      const f = p.frames[k];
      if (f.t < start || f.t > kick) continue;
      const me = posOf(f, PASSER);
      const nearest = opponents.reduce((a, b) =>
        dist(posOf(f, a), me) <= dist(posOf(f, b), me) ? a : b,
      );
      const gap = dist(posOf(f, nearest), me);
      closest = Math.min(closest, gap);
      if (gap > PROTO_CONFIG.shape.press.standoff + 0.5) continue;
      near += 1;
      const prev = p.frames[k - 1];
      if (dist(posOf(prev, nearest), posOf(f, nearest)) / (f.t - prev.t) >= 0.5) moving += 1;
    }
    expect(near).toBeGreaterThan(10);
    expect(moving / near).toBeGreaterThanOrEqual(0.7);
    expect(closest).toBeLessThanOrEqual(PROTO_CONFIG.shape.press.poke + 0.6);
  });

  it('a short pass is kicked when its hold ends', () => {
    // H3 (index 1) stands about 6 m from the ball; the pass is aimed 7 m away on his side.
    const to = toward(1, 7);
    expect(dist(posOf(openingFrame(), 1), to)).toBeLessThan(2);
    const p = performScript(
      scriptOf([KICK_OFF, { kind: 'pass', actor: PASSER, receiver: 1, to, hold: 1.5 }]),
      { duration: 30 },
    );
    expect(eventOf(p, 1, 'kick').t - firstFrameOf(p, 1).t).toBeLessThanOrEqual(1.5 + 0.3);
    expect(eventOf(p, 1, 'receive').other).toBe(1);
  });

  it('a pass aimed beside the passer is received stage.kickGap away', () => {
    const p = performScript(
      scriptOf([KICK_OFF, { kind: 'pass', actor: PASSER, receiver: 1, to: toward(1, 2, PASSER) }]),
      { duration: 30 },
    );
    const kick = eventOf(p, 1, 'kick');
    const frame = frameAt(p, kick.t);
    expect(dist(posOf(frame, PASSER), posOf(frame, 1))).toBeGreaterThanOrEqual(STAGE.kickGap - 0.6);
    const receive = eventOf(p, 1, 'receive');
    expect(receive.other).toBe(1);
    expect(dist(receive.at, kick.at)).toBeGreaterThanOrEqual(STAGE.kickGap - 0.6);
  });

  it('the passer and his receiver are apart again two seconds after the reception', () => {
    const p = performScript(
      scriptOf([
        KICK_OFF,
        { kind: 'pass', actor: PASSER, receiver: 1, to: toward(1, 2, PASSER) },
        { kind: 'pass', actor: 1, receiver: 9, to: [56, 36], hold: 3 },
      ]),
      { duration: 30 },
    );
    const receive = eventOf(p, 1, 'receive');
    const later = frameAt(p, Math.round((receive.t + 2) * PROTO_CONFIG.hz) / PROTO_CONFIG.hz);
    expect(dist(posOf(later, PASSER), posOf(later, 1))).toBeGreaterThanOrEqual(
      PROTO_CONFIG.limits.huddle.distance,
    );
  });

  it('a through ball’s passer carries the ball while he waits, never onto his pass’s aim', () => {
    const aim: Vec = [72, 30];
    const p = performScript(
      scriptOf([
        KICK_OFF,
        { kind: 'pass', actor: PASSER, receiver: 9, to: aim, through: true, hold: 2 },
      ]),
      { duration: 30 },
    );
    expect(driftBeforeKick(p, 1, PASSER)).toBeGreaterThanOrEqual(1.5);
    expect(driftBeforeKick(p, 1, PASSER)).toBeLessThanOrEqual(
      STAGE.holdMove.carry + STAGE.holdMove.slow * STAGE.maxExtraHold + 1,
    );
    expect(dist(eventOf(p, 1, 'kick').at, aim)).toBeGreaterThanOrEqual(STAGE.kickGap);
  });
});
