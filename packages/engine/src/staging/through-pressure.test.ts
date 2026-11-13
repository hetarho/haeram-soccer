import { describe, expect, it } from 'vitest';
import { STAGING_CONFIG } from './config';
import { giveBall } from './ball';
import { performPass } from './pass';
import { RELEASE } from './release';
import { offsideLineX } from './places';
import { scriptOf } from './script.testkit';
import { demoFixture } from './squads.testkit';
import { freezeOthers } from './tactics.testkit';
import { createStage, positionsOf } from './world';
import { dist } from './vec';
import type { BeatOutcome } from './types';

/** A real handler, a ready runner and one opponent continuously tracking the carrier at 1.5 m. */
function pressuredThrough(escape = 0, outcome: BeatOutcome = 'complete', runnerX = 69.6) {
  const fixture = demoFixture();
  fixture.players[5].escape = escape;
  const script = scriptOf(fixture, [
    { kind: 'pass', actor: 5, receiver: 8, to: [90, 30], through: true, hold: 8, outcome },
  ]);
  const state = createStage(script);
  for (const p of fixture.players) {
    state.bodies[p.index].pos = p.team === 0 ? [15, 3 + p.slot * 6] : [70, 3 + p.slot * 6];
    state.bodies[p.index].vel = [0, 0];
  }
  state.bodies[11].pos = [104, 34];
  state.bodies[5].pos = [45, 30];
  state.bodies[8].pos = [runnerX, 30];
  state.bodies[17].pos = [46.5, 30];
  giveBall(state, 5);
  state.frames = [];
  freezeOthers(state, [5, 8, 17]);
  state.orders.set(17, {
    target: () => [state.bodies[5].pos[0] + 1.5, state.bodies[5].pos[1]],
    pace: 'run',
  });
  const program = performPass(state, { beat: script.beats[0] });
  const before: { t: number; gap: number }[] = [];
  let kicked: { t: number; receiver: number; line: number; ball: number } | undefined;
  for (let step = 0; step < 1000; step++) {
    if (!kicked) before.push({ t: state.t, gap: dist(state.bodies[5].pos, state.bodies[17].pos) });
    const next = program.next();
    const event = state.events.find((e) => e.kind === 'kick');
    if (event && !kicked)
      kicked = {
        t: event.t,
        receiver: state.bodies[8].pos[0],
        line: offsideLineX(fixture, positionsOf(state), 0),
        ball: event.at[0],
      };
    if (next.done) return { state, kicked: kicked!, before };
  }
  throw new Error('handler did not finish');
}

describe('through-pass pressure release', () => {
  it.each([
    [0, RELEASE.react],
    [RELEASE.escape, RELEASE.shield],
  ] as const)(
    'escape %s plays a ready legal through ball after %s s of pressure',
    (escape, expected) => {
      const { state, kicked, before } = pressuredThrough(escape);
      expect(Math.max(...before.filter((p) => p.t <= kicked.t).map((p) => p.gap))).toBeLessThan(
        RELEASE.reach,
      );
      expect(kicked.t).toBeCloseTo(expected, 6);
      expect(kicked.receiver).toBeLessThan(kicked.line);
      expect(state.events.some((e) => e.kind === 'receive' && e.other === 8)).toBe(true);
      expect(state.ball.owner).toBe(8);
    },
  );

  it('waits for a legal runner rather than kicking to one still beyond the line', () => {
    const { state, kicked } = pressuredThrough(0, 'complete', 82);
    expect(kicked.t).toBeGreaterThan(RELEASE.react);
    expect(kicked.receiver).toBeLessThan(kicked.line);
    expect(state.ball.owner).toBe(8);
  });

  it('keeps a recorded offside outcome and movement bounds under pressure', () => {
    const { state, kicked } = pressuredThrough(0, 'offside');
    expect(state.events.some((e) => e.kind === 'offside' && e.other === 8)).toBe(true);
    expect(kicked.receiver).toBeGreaterThan(kicked.line);
    expect(kicked.receiver).toBeGreaterThan(kicked.ball);
    const maxStep =
      (STAGING_CONFIG.motion.sprintBase +
        STAGING_CONFIG.motion.sprintPerPace +
        STAGING_CONFIG.stage.lunge) *
        STAGING_CONFIG.tick +
      0.02;
    for (let f = 1; f < state.frames.length; f++) {
      const prev = state.frames[f - 1];
      const frame = state.frames[f];
      for (let i = 0; i < 22; i++)
        expect(
          dist([prev.p[i * 2], prev.p[i * 2 + 1]], [frame.p[i * 2], frame.p[i * 2 + 1]]),
        ).toBeLessThanOrEqual(maxStep);
    }
  });
});
