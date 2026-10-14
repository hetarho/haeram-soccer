import { describe, expect, it } from 'vitest';
import { activateLevers, createWorld } from './index';

const world = (seed = 'activation') =>
  createWorld({ country: 'ENG', name: 'Lever Activation', color: '#553322', seed, difficulty: 1 });

describe('activating the levers of rules 1.16 (→SAVE-10)', () => {
  it('drops a reservation and names it in the inbox', () => {
    const w = world();
    w.calendar = { day: 40 };
    w.buildNext = { build: { youth: 'pathway' }, name: '다음 계획' };
    const activated = activateLevers(w, '1.15.0');
    expect(activated.buildNext).toBeUndefined();
    expect(w.buildNext).toBeDefined();
    expect(activated.inbox!.at(-1)).toMatchObject({
      kind: 'staff-report',
      title: '예약했던 방향 ‘다음 계획’ 취소',
      detail: '방향은 이제 바로 적용돼요. 방향 탭에서 다시 고를 수 있어요.',
      attention: false,
      year: w.year,
      day: 40,
    });
    expect(w.inbox).toEqual([]);
    // Without a name the item names the preset the cards match, else the cards.
    const preset = world();
    preset.buildNext = {
      build: { youth: 'pathway', scouting: 'data', market: 'selling', culture: 'meritocracy' },
    };
    expect(activateLevers(preset, '1.14.0').inbox!.at(-1)!.title).toBe(
      '예약했던 방향 ‘트레이딩 머신’ 취소',
    );
    const cards = world();
    cards.buildNext = { build: { youth: 'pathway', fans: 'community' } };
    expect(activateLevers(cards, '1.13.0').inbox!.at(-1)!.title).toBe(
      '예약했던 방향 ‘1군 직행 경로 · 지역 밀착’ 취소',
    );
  });

  it('returns the same world when nothing changes', () => {
    const w = world();
    expect(activateLevers(w, '1.15.0')).toBe(w);
    // 1.16.0 worlds (unreleased, never activated twice) and later stay as they are.
    w.buildNext = { build: { youth: 'pathway' } };
    expect(activateLevers(w, '1.16.0')).toBe(w);
    expect(activateLevers(w, '2.0.0')).toBe(w);
  });
});
