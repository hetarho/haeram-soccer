import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { activateLevers, createWorld } from './index';

const world = (seed = 'activation') =>
  createWorld({ country: 'ENG', name: 'Lever Activation', color: '#553322', seed, difficulty: 1 });
/** The world as rules before 1.16 saved it: delegation without contract talks. */
function legacy(delegation: World['delegation']) {
  const w = world();
  w.delegation = delegation;
  return w;
}

describe('activating the levers of rules 1.16 (→SAVE-10)', () => {
  it('delegates contract talks where the academy is, only from before 1.16', () => {
    // A level-2 or level-3 world of 1.15: training and the academy delegated.
    const set = legacy({ training: true, academy: true, transfers: false });
    const before = canonical(set);
    const activated = activateLevers(set, '1.15.0');
    expect(activated.delegation).toEqual({
      training: true,
      academy: true,
      transfers: false,
      contracts: true,
    });
    // Pure: the input is untouched.
    expect(canonical(set)).toBe(before);
    expect(activateLevers(set, '1.9.0').delegation?.contracts).toBe(true);
    // Not where the owner runs the academy, and never over an explicit choice.
    expect(activateLevers(legacy({ academy: false }), '1.15.0').delegation?.contracts).toBe(
      undefined,
    );
    const declined = legacy({ academy: true, contracts: false });
    expect(activateLevers(declined, '1.15.0')).toBe(declined);
    // 1.16.0 worlds (unreleased, never activated twice) and later stay as they are.
    expect(activateLevers(set, '1.16.0')).toBe(set);
    expect(activateLevers(set, '1.17.2')).toBe(set);
    expect(activateLevers(set, '2.0.0')).toBe(set);
  });

  it('drops a reservation and names it in the inbox', () => {
    const w = legacy({ academy: false });
    w.calendar = { day: 40 };
    w.buildNext = { build: { youth: 'pathway' }, name: '다음 계획' };
    const activated = activateLevers(w, '1.15.0');
    expect(activated.buildNext).toBeUndefined();
    expect(w.buildNext).toBeDefined();
    expect(activated.inbox!.at(-1)).toMatchObject({
      kind: 'staff-report',
      title: '예약했던 운영 전략 ‘다음 계획’ 취소',
      detail: '운영 전략은 이제 바로 적용돼요. 구단 운영 › 운영 전략에서 다시 고를 수 있어요.',
      attention: false,
      year: w.year,
      day: 40,
    });
    expect(w.inbox).toEqual([]);
    // Without a name the item names the preset the cards match, else the cards.
    const preset = legacy({});
    preset.buildNext = {
      build: { youth: 'pathway', scouting: 'data', market: 'selling', culture: 'meritocracy' },
    };
    expect(activateLevers(preset, '1.14.0').inbox!.at(-1)!.title).toBe(
      '예약했던 운영 전략 ‘트레이딩 머신’ 취소',
    );
    const cards = legacy({});
    cards.buildNext = { build: { youth: 'pathway', fans: 'community' } };
    expect(activateLevers(cards, '1.13.0').inbox!.at(-1)!.title).toBe(
      '예약했던 운영 전략 ‘1군 직행 경로 · 지역 밀착’ 취소',
    );
  });

  it('returns the same world when nothing changes', () => {
    const w = legacy({ training: true, academy: false });
    expect(activateLevers(w, '1.15.0')).toBe(w);
    // A new club already delegates contract talks.
    const fresh = world('activation-fresh');
    expect(activateLevers(fresh, '1.15.0')).toBe(fresh);
  });
});
