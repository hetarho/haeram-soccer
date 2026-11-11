/** Minimal synthetic sides; no world generation or fixture settlement in unit tests. */
import type { StagingSide } from '../../../contracts/src/match-script';
import type { Tactic } from '../../../contracts/src/types';
import { FORMATIONS } from '../formations';
import { stageFixture } from './input';
import { nominalSpot } from './places';
import { remember } from './mind';
import { scriptOf } from './script.testkit';
import { createStage, positionsOf, type StageState } from './world';
import type { Phase, TeamId, Vec } from './types';

export function formationSides(home: Tactic, away: Tactic = 'counter'): [StagingSide, StagingSide] {
  return [home, away].map((tactic): StagingSide => ({
    tactic,
    players: FORMATIONS[tactic].slots.map(({ role }, slot) => ({
      line: slot,
      slot,
      role,
      pace: 50,
      anticipation: 50,
      discipline: 50,
      pressing: 50,
      freedom: 50,
    })),
  })) as [StagingSide, StagingSide];
}

export function formedStage(
  sides: readonly [StagingSide, StagingSide],
  ball: Vec = [35, 10],
  team: TeamId = 0,
  phase: Phase = 'progression',
): StageState {
  const fixture = stageFixture(sides);
  const state = createStage(scriptOf(fixture, [{ kind: 'carry', actor: 5, to: ball }]));
  state.team = team;
  state.phase = phase;
  state.ball = { pos: [...ball], z: 0, mode: 'loose', owner: -1 };
  // Prepare a settled shape and fill the delay's history with the same initial inputs.
  for (let pass = 0; pass < 2; pass++) {
    const snapshot = positionsOf(state);
    fixture.players.forEach((p) => {
      const at = nominalSpot({ fixture, ball, team, phase, positions: snapshot }, p.index);
      state.bodies[p.index].pos = [...at];
      state.minds[p.index].place = [...at];
    });
  }
  state.frames = [];
  state.seen = [];
  for (let i = 0; i < 30; i++) remember(state);
  return state;
}

/** Isolate one player's movement while retaining teammates as real spacing obstacles. */
export function freezeOthers(state: StageState, free: readonly number[]): void {
  state.fixture.players.forEach((p) => {
    if (!free.includes(p.index))
      state.orders.set(p.index, {
        target: [...state.bodies[p.index].pos],
        pace: 'walk',
        speedCap: 0,
      });
  });
}
