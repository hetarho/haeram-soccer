import { describe, expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import { teamStates, urgentState } from './teamState';

const world = () =>
  createWorld({ country: 'ENG', name: 'State', color: '#24664f', seed: 'state', difficulty: 2 });

describe('team state', () => {
  it('is calm for a new club', () => {
    const states = teamStates(world());
    expect(states.map((state) => state.key)).toEqual(['fatigue', 'morale', 'cash', 'squad']);
    expect(urgentState(states)).toBeUndefined();
  });

  it('recommends recovery when the starters are tired', () => {
    const w = world();
    for (const player of w.players) player.fatigue = 55;
    w.delegation = { ...w.delegation, training: false };
    const fatigue = teamStates(w).find((state) => state.key === 'fatigue')!;
    expect(fatigue.tone).toBe('warn');
    expect(fatigue.advice!.actions.map((action) => action.command?.type)).toEqual([
      'training',
      'lineup',
    ]);
    // A delegated assistant already switches to recovery, so only rest selection is offered.
    w.delegation = { ...w.delegation, training: true };
    const delegated = teamStates(w).find((state) => state.key === 'fatigue')!;
    expect(delegated.advice!.text).toContain('회복 훈련 중');
    expect(delegated.advice!.actions.map((action) => action.command?.type)).toEqual(['lineup']);
  });

  it('puts a morale crisis first and offers more squad support', () => {
    const w = world();
    for (const player of w.players) player.fatigue = 45;
    w.morale = 20;
    const urgent = urgentState(teamStates(w))!;
    expect(urgent.key).toBe('morale');
    expect(urgent.advice!.actions[0].command).toEqual({ type: 'policy', key: 'support', level: 4 });
  });

  it('flags a deficit and a thin squad with places to act', () => {
    const w = world();
    w.cash = '-100';
    w.players.slice(0, 4).forEach((player) => (player.status = 'sold'));
    const states = teamStates(w);
    expect(states.find((state) => state.key === 'cash')!.tone).toBe('bad');
    expect(states.find((state) => state.key === 'squad')!.advice!.actions[0].page).toBe(
      'transfers',
    );
  });
});
