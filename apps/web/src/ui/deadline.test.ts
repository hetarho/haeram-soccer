import { expect, it, vi } from 'vitest';
import { atDeadline } from './deadline';

function clock() {
  let time = 0,
    id = 0;
  const pending = new Map<number, () => void>();
  const delays: number[] = [];
  return {
    now: () => time,
    setTimeout: (callback: () => void, delay: number) => {
      delays.push(delay);
      pending.set(++id, callback);
      return id;
    },
    clearTimeout: (timer: number) => {
      pending.delete(timer);
    },
    fire: (at: number) => {
      time = at;
      const [timer, callback] = [...pending][0]!;
      pending.delete(timer);
      callback();
    },
    pending,
    delays,
  };
}

it('re-arms an early callback until the fractional deadline, then runs once', () => {
  const c = clock(),
    action = vi.fn();
  atDeadline(3000.5, action, c);
  c.fire(3000.4);
  expect(action).not.toHaveBeenCalled();
  expect(c.delays).toEqual([3001, 1]);
  c.fire(3000.5);
  expect(action).toHaveBeenCalledTimes(1);
  expect(c.pending.size).toBe(0);
});

it('cancels the re-armed callback when its caller leaves', () => {
  const c = clock(),
    action = vi.fn();
  const cancel = atDeadline(3000.5, action, c);
  c.fire(3000.4);
  expect(c.pending.size).toBe(1);
  cancel();
  expect(c.pending.size).toBe(0);
  expect(action).not.toHaveBeenCalled();
});
