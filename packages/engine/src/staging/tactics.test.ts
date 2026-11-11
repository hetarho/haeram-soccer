import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../formations';
import type { Tactic } from '../../../contracts/src/types';
import { STAGING_CONFIG } from './config';
import { stageFixture } from './input';
import { reactionDelay, placeLag } from './mind';
import { inPitch } from './pitch';
import { nominalSpot } from './places';
import { matchScript, scriptOf } from './script.testkit';
import { advance, createStaging } from './staging';
import { formationSides, formedStage } from './tactics.testkit';
import { dist } from './vec';
import { defaultTarget, isPressRole, positionsOf, setPossession, step } from './world';

const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const tick = STAGING_CONFIG.tick;

describe('the four staged tactics', () => {
  it('a press side counter-presses a lost ball and a counter side drops', () => {
    for (const tactic of TACTICS) {
      const state = formedStage(formationSides(tactic), [70, 34]);
      state.bodies[6].pos = [72, 34];
      state.bodies[7].pos = [74, 40];
      const beat = { ...state.beats[0], team: 1 as const, phase: 'progression' as const };
      setPossession(state, beat);
      const want = defaultTarget(state, 6, positionsOf(state));
      if (tactic === 'press' || tactic === 'possession') {
        expect(want.direct).toBe(true);
        expect(dist(want.target, state.ball.pos)).toBeCloseTo(STAGING_CONFIG.shape.press.tight);
        state.t = STAGING_CONFIG.stage.counterPress.seconds;
        expect(
          dist(defaultTarget(state, 6, positionsOf(state)).target, state.ball.pos),
        ).toBeCloseTo(STAGING_CONFIG.shape.press.standoff);
      } else if (tactic === 'counter') {
        expect(want.direct).toBe(false);
        expect(want.target[0]).toBeLessThan(state.bodies[6].pos[0]);
      } else {
        expect(dist(want.target, state.ball.pos)).toBeCloseTo(STAGING_CONFIG.shape.press.standoff);
      }
    }
  });

  it('a balanced side holds a mid block', () => {
    const lines = TACTICS.map((tactic) => {
      const s = formedStage(formationSides(tactic), [75, 34], 1);
      for (let i = 0; i < 10 / tick; i++) step(s);
      // The three centre-backs hold their shared depth, even while the nearest midfielder engages.
      return nominalSpot({ fixture: s.fixture, ball: s.ball.pos, team: 1, phase: s.phase }, 3)[0];
    });
    expect(lines[3]).toBeGreaterThan(lines[2]);
    expect(lines[3]).toBeLessThan(lines[0]);
    const s = formedStage(formationSides('balanced'), [90, 34], 1);
    expect(isPressRole(s, 0, 8, positionsOf(s))).toBe(false);
  });

  it("a 3-5-2's wing-backs give the width in possession and close into a back five out of it", () => {
    const ip = formedStage(formationSides('balanced'), [65, 34]);
    const oop = formedStage(formationSides('balanced'), [90, 34], 1);
    const wide = [1, 5];
    const back = [2, 3, 4];
    for (const slot of wide) {
      const attack = defaultTarget(ip, slot, positionsOf(ip)).target;
      const defend = defaultTarget(oop, slot, positionsOf(oop)).target;
      expect(Math.abs(attack[1] - 34)).toBeGreaterThan(28);
      expect(Math.abs(defend[1] - 34)).toBeLessThan(24);
      expect(Math.abs(defend[0] - oop.bodies[3].pos[0])).toBeLessThan(4);
    }
    expect(back.map((i) => reactionDelay(oop.fixture.players[i], i * 10))).toEqual([
      0.25, 0.25, 0.25,
    ]);
    expect(back.map((i) => placeLag(oop.fixture.players[i], i * 10))).toEqual([0.5, 0.5, 0.5]);
  });

  it("a 4-2-3-1's shadow striker shows between the lines", () => {
    const s = formedStage(formationSides('press'), [70, 34], 0, 'finalThird');
    const shadow = defaultTarget(s, 7, positionsOf(s)).target;
    const pivot = defaultTarget(s, 6, positionsOf(s)).target;
    const striker = defaultTarget(s, 9, positionsOf(s)).target;
    expect(shadow[0]).toBeGreaterThan(pivot[0] + 5);
    expect(shadow[0]).toBeLessThan(striker[0] - 1);
    expect(Math.abs(shadow[1] - 34)).toBeLessThan(3);
  });

  it.each(TACTICS)('every role a formation asks is staged: %s', (tactic) => {
    const sides = formationSides(tactic, tactic);
    const fixture = stageFixture(sides);
    expect(fixture.teams[0].players.map((p) => p.role)).toEqual(
      FORMATIONS[tactic].slots.map((s) => s.role),
    );
    const script = matchScript(
      scriptOf(fixture, [
        { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
        { kind: 'pass', actor: 5, receiver: 6, to: [60, 24] },
        { kind: 'pass', actor: 6, receiver: 9, to: [75, 36] },
        { kind: 'carry', actor: 9, to: [80, 35], hold: 70, phase: 'finalThird' },
      ]),
    );
    const staged = advance(createStaging(script, sides), 60);
    expect(staged.frames.at(-1)?.t).toBe(60);
    expect(staged.frames).toHaveLength(601);
    expect(staged.frames.every((f) => f.p.every((p) => inPitch(p.at)))).toBe(true);
    const end = staged.frames.at(-1)!;
    for (const side of [0, 1]) {
      const players = end.p.filter((p) => p.player.side === side);
      for (let i = 0; i < players.length; i++)
        for (let j = i + 1; j < players.length; j++)
          expect(dist(players[i].at, players[j].at)).toBeGreaterThanOrEqual(1);
    }
  });
});
