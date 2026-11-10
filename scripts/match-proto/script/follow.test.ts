import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { POST_HIGH, POST_LOW, toAttack } from '../core/pitch.ts';
import { demoFixture } from '../core/squads.ts';
import { SHOT_OUTCOMES, type TeamId, type Vec } from '../core/types.ts';
import { boxPoint, finish, goalPoint, offsideChance, type ShotKind } from './follow.ts';
import { initialState, phaseAt, type ScriptState } from './state.ts';
import { validateScript } from './validate.ts';

const OFFSIDE = PROTO_CONFIG.grammar.offside;
const KINDS: readonly ShotKind[] = ['oneOnOne', 'header', 'firstTime', 'box', 'edge', 'freeKick'];

/** `team` in open play with `holder` on the ball at `ball` (world frame). */
const openPlay = (seed: string, team: TeamId, holder: number, ball: Vec): ScriptState => {
  const state = initialState(seed, demoFixture());
  state.pending = undefined;
  state.team = team;
  state.holder = holder;
  state.ball = ball;
  state.phase = phaseAt(team, ball);
  return state;
};

describe('follow-ups', () => {
  it('offsideChance falls with decisions and stays inside its bounds', () => {
    expect(offsideChance(32)).toBeGreaterThan(3 * offsideChance(86));
    for (const d of [0, 32, 50, 60, 86, 100]) {
      expect(offsideChance(d)).toBeGreaterThanOrEqual(OFFSIDE.min);
      expect(offsideChance(d)).toBeLessThanOrEqual(OFFSIDE.max);
    }
    expect(offsideChance(60)).toBeCloseTo(OFFSIDE.base, 12);
  });

  it('goalPoint is on target for goal, saved and blocked and outside a post for wide', () => {
    for (const team of [0, 1] as const) {
      const state = openPlay(
        `goal-point-${team}`,
        team,
        team * 11 + 9,
        team === 0 ? [95, 34] : [10, 34],
      );
      for (let i = 0; i < 100; i++) {
        for (const outcome of ['goal', 'saved', 'blocked'] as const) {
          const [x, y] = toAttack(team, goalPoint(state, outcome));
          expect(x).toBe(105);
          expect(y).toBeGreaterThan(POST_LOW);
          expect(y).toBeLessThan(POST_HIGH);
        }
        const [x, y] = toAttack(team, goalPoint(state, 'wide'));
        expect(x).toBe(105);
        expect(y < POST_LOW || y > POST_HIGH).toBe(true);
        expect(Math.min(Math.abs(y - POST_LOW), Math.abs(y - POST_HIGH))).toBeLessThanOrEqual(4);
      }
    }
  });

  it("boxPoint puts the near post on the ball's side", () => {
    for (const team of [0, 1] as const) {
      for (const ballY of [8, 60]) {
        const state = openPlay('box-point', team, team * 11 + 8, [team === 0 ? 90 : 15, ballY]);
        const near = boxPoint(state, 'near');
        const far = boxPoint(state, 'far');
        expect(Math.sign(near[1] - 34), `team ${team} ball ${ballY}`).toBe(Math.sign(ballY - 34));
        expect(Math.sign(far[1] - 34)).toBe(-Math.sign(ballY - 34));
        expect(toAttack(team, near)[0]).toBe(PROTO_CONFIG.grammar.box.near[0]);
      }
    }
  });

  it('finish draws only shot outcomes and names the keeper for a save', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const state = openPlay(`finish-${i}`, 0, 9, [95, 32]);
      const beat = finish(state, 'box');
      seen.add(beat.outcome);
      expect(SHOT_OUTCOMES).toContain(beat.outcome);
      expect(beat).toMatchObject({ kind: 'shot', move: 'boxShot', actor: 9, header: false });
      if (beat.outcome === 'saved') expect(beat.opponent).toBe(11);
      if (beat.outcome === 'blocked') {
        expect(demoFixture().players[beat.opponent ?? -1].team).toBe(1);
        expect(beat.opponent).not.toBe(11);
      }
    }
    expect([...seen].sort()).toEqual([...SHOT_OUTCOMES].sort());
  });

  it('afterShot leaves a valid continuation for every outcome', () => {
    for (const kind of KINDS) {
      const outcomes = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const state = openPlay(`after-${kind}-${i}`, 1, 20, [12, 36]);
        const beat = finish(state, kind, kind === 'freeKick' ? 'freeKick' : 'shot');
        outcomes.add(beat.outcome);
        expect(beat.header).toBe(kind === 'header');
        const continues =
          state.pending !== undefined || state.fixture.players[state.holder].team === state.team;
        expect(continues, `${kind} ${i} ${beat.outcome}`).toBe(true);
        // Every rule but the opening kick-off holds on what the shot left behind.
        const errors = validateScript(state).filter((e) => !e.startsWith('rule 1:'));
        expect(errors, `${kind} ${i}`).toEqual([]);
      }
      expect(outcomes.size, kind).toBeGreaterThanOrEqual(kind === 'oneOnOne' ? 3 : 4);
    }
  });
});
