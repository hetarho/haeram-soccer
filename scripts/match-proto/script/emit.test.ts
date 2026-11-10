import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE } from '../core/pitch.ts';
import { demoFixture } from '../core/squads.ts';
import type { Vec } from '../core/types.ts';
import { lerp } from '../core/vec.ts';
import { emit } from './emit.ts';
import { initialState, phaseAt, type ScriptState } from './state.ts';

const GRAMMAR = PROTO_CONFIG.grammar;
const BALL: Vec = [40, 30];

/** Team 0 in open play with its slot 5 on the ball at `BALL`. */
const openPlay = (): ScriptState => {
  const state = initialState('emit-test', demoFixture());
  state.pending = undefined;
  state.holder = 5;
  state.ball = BALL;
  state.phase = phaseAt(0, BALL);
  return state;
};

describe('emit', () => {
  it('a completed pass moves the holder and the ball', () => {
    const state = openPlay();
    const beat = emit(state, {
      move: 'test',
      kind: 'pass',
      actor: 5,
      receiver: 6,
      to: [56, 30],
      hold: 1,
      outcome: 'complete',
    });
    expect(state.holder).toBe(6);
    expect(state.ball).toEqual([56, 30]);
    expect(state.team).toBe(0);
    expect(beat).toMatchObject({ index: 0, from: BALL, possession: 0, loft: false });
    expect(state.times).toEqual([0]);
    expect(state.clock).toBeCloseTo(1 + 16 / GRAMMAR.speeds.ground, 9);
    expect(state.phase).toBe('progression');
  });

  it('an interception flips the side and starts a new possession', () => {
    const state = openPlay();
    emit(state, {
      move: 'test',
      kind: 'pass',
      actor: 5,
      receiver: 6,
      to: [60, 30],
      hold: 1,
      outcome: 'intercepted',
      opponent: 17,
    });
    expect(state.team).toBe(1);
    expect(state.holder).toBe(17);
    expect(state.possession).toBe(1);
    expect(state.ball).toEqual(lerp(BALL, [60, 30], GRAMMAR.interceptAt));
    expect(state.pending).toBeUndefined();
  });

  it('a foul leaves a free kick pending for the fouled side', () => {
    const state = openPlay();
    emit(state, {
      move: 'test',
      kind: 'carry',
      actor: 5,
      to: [50, 30],
      hold: 0.5,
      outcome: 'foul',
      opponent: 17,
    });
    const at = lerp(BALL, [50, 30], GRAMMAR.tackleAt);
    expect(state.pending).toEqual({ kind: 'freeKick', team: 0, spot: at });
    expect(state.team).toBe(0);
    expect(state.ball).toEqual(at);
  });

  it('an offside leaves a free kick pending for the other side', () => {
    const state = openPlay();
    emit(state, {
      move: 'test',
      kind: 'pass',
      actor: 5,
      receiver: 9,
      to: [80, 40],
      hold: 1,
      through: true,
      outcome: 'offside',
    });
    expect(state.pending).toEqual({ kind: 'freeKick', team: 1, spot: [80, 40] });
    expect(state.holder).toBe(5);
  });

  it('out without a following restart throws', () => {
    const state = openPlay();
    expect(() =>
      emit(state, {
        move: 'test',
        kind: 'clearance',
        actor: 5,
        to: [60, -1],
        hold: 0.5,
        loft: true,
        outcome: 'out',
      }),
    ).toThrow();
  });

  it('a goal counts and leaves a kick-off pending for the side that conceded', () => {
    const state = openPlay();
    state.ball = [95, 34];
    emit(state, {
      move: 'test',
      kind: 'shot',
      actor: 9,
      to: [105, 35],
      hold: 0.5,
      outcome: 'goal',
    });
    expect(state.score).toEqual([1, 0]);
    expect(state.pending).toEqual({ kind: 'kickOff', team: 1, spot: CENTRE });
  });
});
