import { afterEach, expect, it, vi } from 'vitest';
import type { MatchFrame } from '../../../../packages/contracts/src/types';
import type { StagingReply, StagingRequest } from './stagingProtocol';
import { STAGING_BATCH_MINUTES } from './stagingProtocol';
import { runStaging } from './stagingProgram';
const fake = vi.hoisted(() => ({ next: vi.fn(), closed: vi.fn() }));
vi.mock('../../../../packages/engine/src/staging/frames', () => ({
  stageFrames: function* () {
    try {
      for (let minute = 1; minute <= 5; minute++) {
        fake.next();
        yield { minute } as MatchFrame;
      }
    } finally {
      fake.closed();
    }
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('publishes the first minute, batches the rest and skips delivered frames on resume', async () => {
  vi.useFakeTimers();
  const replies: StagingReply[] = [];
  runStaging({ id: 1, from: 0 } as StagingRequest, (r) => replies.push(r));
  expect(replies).toEqual([]);
  await vi.advanceTimersToNextTimerAsync();
  expect(fake.next).toHaveBeenCalledTimes(1);
  expect(replies).toEqual([{ id: 1, from: 0, frames: [{ minute: 1 }] }]);
  await vi.advanceTimersToNextTimerAsync();
  expect(fake.next).toHaveBeenCalledTimes(1 + STAGING_BATCH_MINUTES);
  expect(replies.at(-1)).toEqual({ id: 1, from: 1, frames: [{ minute: 2 }, { minute: 3 }] });
  await vi.runAllTimersAsync();
  expect(replies.at(-1)).toEqual({ id: 1, done: true });
  expect(
    replies.filter((r) => 'frames' in r).flatMap((r) => ('frames' in r ? r.frames : [])),
  ).toHaveLength(5);
  replies.length = 0;
  runStaging({ id: 2, from: 3 } as StagingRequest, (r) => replies.push(r));
  await vi.runAllTimersAsync();
  expect(replies).toEqual([
    { id: 2, from: 3, frames: [{ minute: 4 }] },
    { id: 2, from: 4, frames: [{ minute: 5 }] },
    { id: 2, done: true },
  ]);
});
it('a stop closes the timer program before another batch', async () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const stop = runStaging({ id: 1, from: 0 } as StagingRequest, send);
  await vi.advanceTimersToNextTimerAsync();
  stop();
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledOnce();
  expect(fake.closed).toHaveBeenCalledOnce();
});
it('reports a staging failure once instead of continuing the timer', async () => {
  vi.useFakeTimers();
  fake.next.mockImplementationOnce(() => {
    throw new Error('failed');
  });
  const send = vi.fn();
  runStaging({ id: 1, from: 0 } as StagingRequest, send);
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledExactlyOnceWith({ id: 1, error: true });
  expect(fake.closed).toHaveBeenCalledOnce();
});
