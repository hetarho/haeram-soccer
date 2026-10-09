import { describe, expect, it } from 'vitest';
import { createWorld, operate } from '../../../../packages/engine/src/index';
import { remedies, teamStates, urgentState } from './teamState';

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
    // Everyone is equally tired, so a rest selection would change nothing: a rest day comes next.
    expect(fatigue.advice!.actions.map((action) => action.command?.type)).toEqual([
      'training',
      'care',
    ]);
    // A delegated assistant already switches to recovery, so the quick choices are care actions.
    w.delegation = { ...w.delegation, training: true };
    const delegated = teamStates(w).find((state) => state.key === 'fatigue')!;
    expect(delegated.advice!.text).toContain('회복 훈련 중');
    expect(delegated.advice!.actions.map((action) => action.command)).toEqual([
      { type: 'care', kind: 'rest-day' },
      { type: 'care', kind: 'medical' },
    ]);
  });

  it('offers four to six priced choices for every state and says why one is unavailable', () => {
    const w = world();
    for (const key of ['fatigue', 'morale', 'cash', 'squad'] as const) {
      const choices = remedies(w, key);
      expect(choices.length, key).toBeGreaterThanOrEqual(key === 'squad' ? 3 : 4);
      expect(choices.length, key).toBeLessThanOrEqual(6);
      for (const choice of choices) {
        expect(choice.effect.length).toBeGreaterThan(0);
        if (!choice.unavailable)
          expect(!!(choice.command || choice.page || choice.prepare), choice.id).toBe(true);
      }
    }
    operate(w, { type: 'care', kind: 'team-dinner' });
    const dinner = remedies(w, 'morale').find((choice) => choice.id === 'team-dinner')!;
    expect(dinner.unavailable).toBe('3라운드 뒤 다시 가능');
    expect(remedies(w, 'cash').find((choice) => choice.id === 'friendly')!.effect).toContain(
      '전원 피로 +8',
    );
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
