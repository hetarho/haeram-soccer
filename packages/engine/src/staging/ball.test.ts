import { expect, it } from 'vitest';
import { random } from '../primitives';
import { startFlightTimed, updateBall } from './ball';
import { createStage } from './world';
import { demoFixture } from './squads.testkit';
import { scriptOf } from './script.testkit';

const make = (seed: string) =>
  createStage({
    ...scriptOf(demoFixture(), [{ kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] }]),
    seed,
  });
it('only the named motion stream shapes a quadratic flight with exact endpoints', () => {
  const a = make('motion-test'),
    b = make('motion-test');
  const r = random('motion-test:motion');
  expect(a.motion()).toBe(r());
  // Independent state starts again from precisely the same named stream.
  b.motion();
  const first = startFlightTimed(a, [80, 20], 2, 4);
  const second = startFlightTimed(b, [80, 20], 2, 4);
  expect(first).toEqual(second);
  a.t = first.t0;
  updateBall(a);
  expect(a.ball.pos).toEqual(first.from);
  a.t = (first.t0 + first.t1) / 2;
  updateBall(a);
  expect(a.ball.pos).toEqual([
    (first.from[0] + 2 * first.control[0] + first.to[0]) / 4,
    (first.from[1] + 2 * first.control[1] + first.to[1]) / 4,
  ]);
  expect(a.ball.z).toBeCloseTo(first.apex);
  a.t = first.t1;
  updateBall(a);
  expect(a.ball.pos).toEqual(first.to);
  expect(a.ball.z).toBe(0);
  expect(startFlightTimed(make('other-motion'), [80, 20], 2, 4).control).not.toEqual(first.control);
});
