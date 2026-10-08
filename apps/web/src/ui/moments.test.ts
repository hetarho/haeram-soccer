import { expect, it } from 'vitest';
import { createWorld, simulateMatch, nextOwnFixture } from '../../../../packages/engine/src/index';
import { recordedGoals, sampleAtMinute } from './moments';
it('orders recorded goals, keeps penalty decisions distinct and maps actual samples', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Moments',
    color: '#24664f',
    seed: 'moments',
    difficulty: 2,
  });
  const { record, frames } = simulateMatch(w, nextOwnFixture(w)!, true, true);
  record.highlights = [
    { minute: 70, side: 1, player: 'Away', action: '골' },
    { minute: 10, side: 0, player: 'Home', action: '골' },
    { minute: 120, side: 0, player: 'Penalties', action: '승부차기 홈 승리' },
  ];
  expect(recordedGoals(record).map((g) => [g.minute, g.home, g.away])).toEqual([
    [10, 1, 0],
    [70, 1, 1],
  ]);
  const samples = frames.flatMap((frame, i) => (frame.motion || [frame]).map(() => ({ frame: i })));
  expect(frames[samples[sampleAtMinute(frames, samples, 45)].frame].minute).toBe(45);
  expect(sampleAtMinute([], [], 45)).toBe(0);
  record.highlights = [];
  expect(recordedGoals(record)).toEqual([]);
});
