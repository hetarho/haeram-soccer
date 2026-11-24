import { beforeEach, expect, it, vi } from 'vitest';
import { Host } from './host';
import { req, startedWorld } from './host.testkit';

/** Each mocked day advances the host's clock by its cost in milliseconds. */
const day = vi.hoisted(() => ({ clock: 0, costs: [] as number[] }));
vi.mock('../../../../packages/engine/src/next-event', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../packages/engine/src/next-event')>();
  return {
    ...actual,
    *nextEventDays() {
      for (const cost of day.costs) {
        day.clock += cost;
        yield;
      }
    },
  };
});
beforeEach(() => {
  day.clock = 0;
});

async function manualStep(costs: number[]) {
  day.costs = costs;
  const beats: number[] = [];
  const host = new Host(
    (reply) => {
      expect(reply).toEqual({ requestId: 'manual', ok: true, progress: 0 });
      beats.push(day.clock);
    },
    { now: () => day.clock },
  );
  host.world = startedWorld('manual-progress-watchdog');
  const reply = await host.handle(
    req('manual', host.world.revision, { type: 'command', command: { type: 'next-event' } }),
  );
  expect(reply.ok, reply.error).toBe(true);
  expect(reply.view).toBeDefined();
  return beats;
}

it('keeps a long manual step alive without publishing a view before the stop', async () => {
  expect(await manualStep(Array<number>(29).fill(1))).toEqual([14, 28]);
});

it('reports a heavy season close within a second of the days before it', async () => {
  // The day costs of records-room-journey's step from its last match to the 1931/32 match eve
  // (Node, 261124): seven quiet days, the close, then the summer to the first fixture's eve.
  // Every 14 days alone left the client's watchdog 4.5 s of silence here, several times that on CI.
  const costs = [10, 10, 10, 10, 10, 10, 10, 2100, 1100, 2, 240, 2, 700, 259];
  expect(await manualStep(costs)).toEqual([2170, 3270, 4473]);
});
