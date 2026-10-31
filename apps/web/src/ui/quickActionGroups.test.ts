import { describe, expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import { quickGroups } from './quickActionGroups';
import { teamStates } from './teamState';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Quick',
    color: '#24664f',
    seed: 'quick',
    level: 'easy' as const,
  });

describe('clubhouse quick actions (→WEB-11)', () => {
  it('groups the owner choices into three topics that each act where they stand', () => {
    const groups = quickGroups(world());
    expect(groups.map((group) => group.key)).toEqual(['morale', 'fatigue', 'development']);
    for (const group of groups)
      for (const action of group.actions) {
        // A request or command, or a coach's sheet over the clubhouse: never another page. Only
        // a blocked choice (no prospect to promote) may have nothing to run.
        expect(!!action.command || !!action.coach || !!action.unavailable).toBe(true);
        expect(action).not.toHaveProperty('prepare');
        expect(action.page).toBeUndefined();
        expect(action.board).toBeUndefined();
      }
    expect(groups.flatMap((group) => group.actions.map((action) => action.id))).toEqual([
      'meeting',
      'bonding',
      'win-bonus',
      'owner-visit',
      'backing',
      'rest-lineup',
      'recovery-training',
      'rest-day',
      'recovery',
      'camp',
      'friendly',
      'order-assistant',
      'order-youth',
      'promote',
    ]);
  });

  it('shows the figure each topic moves and warns with the states it answers', () => {
    const w = world();
    for (const player of w.players) player.fatigue = 55;
    w.manager.trust = 30;
    const [morale, fatigue, development] = quickGroups(w);
    const states = teamStates(w);
    expect(fatigue).toMatchObject({
      value: states.find((state) => state.key === 'fatigue')!.value,
      tone: 'warn',
      warning: true,
    });
    // The mood is fine, but the wavering manager's backing sits in the same sheet.
    expect(morale.warning).toBe(true);
    expect(morale.facts).toContain('감독 입지 30 · 위기');
    expect(fatigue.actions.find((action) => action.id === 'recovery-training')!.coach).toEqual({
      coach: 'assistant',
      focus: 'recovery',
    });
    expect(development.actions.map((action) => action.coach?.coach)).toEqual([
      'assistant',
      'youth',
      undefined,
    ]);
  });
});
