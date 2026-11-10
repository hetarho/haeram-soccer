import { describe, expect, it } from 'vitest';
import { demoFixture } from '../core/squads.ts';
import type { Phase, TeamId, Vec } from '../core/types.ts';
import {
  DEFAULT_MOVES,
  SAFE,
  boxShot,
  carryForward,
  cutBack,
  recycle,
  takeOn,
  type MoveDef,
} from './moves.ts';
import { initialState, phaseAt, type ScriptState } from './state.ts';
import { validateScript } from './validate.ts';

const CATALOGUE = [
  'circulate',
  'intoPivot',
  'wideOut',
  'longBall',
  'pressedBack',
  'carryForward',
  'interior',
  'dropLink',
  'switchPlay',
  'wideRelease',
  'recycle',
  'throughEarly',
  'throughBall',
  'cross',
  'cutBack',
  'edgeShot',
  'boxShot',
  'takeOn',
  'combine',
  'outlet',
];

interface Setup {
  team: TeamId;
  holder: number;
  ball: Vec;
  phase?: Phase;
}

/** A hand-built state each catalogue move accepts (team 0 attacks toward x = 105). */
const SETUPS: Record<string, Setup> = {
  circulate: { team: 0, holder: 2, ball: [20, 30] },
  intoPivot: { team: 0, holder: 2, ball: [20, 30] },
  wideOut: { team: 0, holder: 2, ball: [20, 30] },
  longBall: { team: 1, holder: 13, ball: [85, 38] },
  pressedBack: { team: 0, holder: 2, ball: [25, 30] },
  carryForward: { team: 0, holder: 6, ball: [50, 30] },
  interior: { team: 0, holder: 5, ball: [45, 30] },
  dropLink: { team: 0, holder: 5, ball: [45, 34] },
  switchPlay: { team: 0, holder: 1, ball: [50, 8] },
  wideRelease: { team: 0, holder: 6, ball: [50, 20] },
  recycle: { team: 0, holder: 8, ball: [66, 12] },
  throughEarly: { team: 1, holder: 17, ball: [60, 34], phase: 'counter' },
  throughBall: { team: 0, holder: 6, ball: [78, 34] },
  cross: { team: 0, holder: 10, ball: [90, 62] },
  cutBack: { team: 0, holder: 10, ball: [96, 60] },
  edgeShot: { team: 0, holder: 9, ball: [82, 34] },
  boxShot: { team: 0, holder: 9, ball: [95, 36] },
  takeOn: { team: 0, holder: 8, ball: [80, 10] },
  combine: { team: 0, holder: 6, ball: [80, 34] },
  outlet: { team: 1, holder: 16, ball: [70, 34], phase: 'counter' },
};

const build = (seed: string, s: Setup): ScriptState => {
  const state = initialState(seed, demoFixture());
  state.pending = undefined;
  state.team = s.team;
  state.holder = s.holder;
  state.ball = s.ball;
  state.phase = s.phase ?? phaseAt(s.team, s.ball);
  if (state.phase === 'counter') state.flags.counterBeats = 2;
  return state;
};

const moveById = (id: string): MoveDef => {
  const move = DEFAULT_MOVES.find((m) => m.id === id);
  if (move === undefined) throw new Error(`no move ${id}`);
  return move;
};

describe('the move catalogue', () => {
  it('lists the catalogue ids and keeps SAFE apart', () => {
    expect(DEFAULT_MOVES.map((m) => m.id)).toEqual(CATALOGUE);
    expect(SAFE.id).toBe('safe');
  });

  it('every move emits valid beats from a state it accepts', () => {
    for (const id of CATALOGUE) {
      const move = moveById(id);
      const setup = SETUPS[id];
      expect(move.phases, id).toContain(build('phase', setup).phase);
      for (let i = 0; i < 50; i++) {
        const state = build(`${id}-${i}`, setup);
        expect(move.weight(state), id).toBeGreaterThan(0);
        move.run(state);
        expect(state.beats.length, id).toBeGreaterThanOrEqual(1);
        expect(state.beats[0], `${id} ${i}`).toMatchObject({
          actor: setup.holder,
          move: id,
          team: setup.team,
        });
        const errors = validateScript(state).filter((e) => !e.startsWith('rule 1:'));
        expect(errors, `${id} ${i}`).toEqual([]);
      }
    }
  });

  it('weights are zero where the guards say so', () => {
    expect(boxShot.weight(build('g', { team: 0, holder: 9, ball: [80, 34] }))).toBe(0);
    expect(boxShot.weight(build('g', { team: 0, holder: 9, ball: [95, 34] }))).toBeGreaterThan(0);
    expect(cutBack.weight(build('g', { team: 0, holder: 10, ball: [80, 60] }))).toBe(0);
    expect(cutBack.weight(build('g', { team: 0, holder: 10, ball: [96, 36] }))).toBe(0);
    expect(cutBack.weight(build('g', { team: 0, holder: 10, ball: [96, 60] }))).toBeGreaterThan(0);
    const keeper = build('g', { team: 0, holder: 0, ball: [80, 34] });
    expect(carryForward.weight(keeper)).toBe(0);
    expect(takeOn.weight(keeper)).toBe(0);
    expect(takeOn.weight(build('g', { team: 0, holder: 2, ball: [80, 34] }))).toBe(0);

    // Right after a won take-on the attack does not recycle.
    let won: ScriptState | undefined;
    for (let i = 0; i < 50 && won === undefined; i++) {
      const state = build(`take-on-${i}`, SETUPS.takeOn);
      takeOn.run(state);
      if (state.beats[0].outcome === 'complete') won = state;
    }
    if (won === undefined) throw new Error('no take-on won in 50 seeds');
    expect(won.phase).toBe('finalThird');
    expect(won.flags.beatMan).toBe(true);
    expect(recycle.weight(won)).toBe(0);
    won.flags.beatMan = false;
    expect(recycle.weight(won)).toBeGreaterThan(0);
    won.flags.counterBoost = true;
    expect(recycle.weight(won)).toBe(0);
  });

  it('weight functions draw nothing', () => {
    const flagSets = [
      {},
      { counterBoost: true, beatMan: true, boostLong: true, boostSwitch: true },
    ];
    for (const [id, setup] of Object.entries(SETUPS)) {
      for (const flags of flagSets) {
        const a = build(`draw-${id}`, setup);
        const b = build(`draw-${id}`, setup);
        Object.assign(a.flags, flags);
        for (const move of [...DEFAULT_MOVES, SAFE]) move.weight(a);
        expect(a.rng.next(), id).toBe(b.rng.next());
      }
    }
  });
});
