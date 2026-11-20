import { expect, it, vi } from 'vitest';
import { Host } from './host';
import { req, startedWorld } from './host.testkit';
import type { Reply } from './protocol';

vi.mock('../../../../packages/engine/src/next-event', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../packages/engine/src/next-event')>();
  return {
    ...actual,
    *nextEventDays() {
      for (let day = 0; day < 29; day++) yield;
    },
  };
});

it('keeps a long manual step alive without publishing a view before the stop', async () => {
  const updates: Reply[] = [];
  const host = new Host((reply) => updates.push(reply));
  host.world = startedWorld('manual-progress-watchdog');
  const reply = await host.handle(
    req('manual', host.world.revision, { type: 'command', command: { type: 'next-event' } }),
  );

  expect(reply.ok, reply.error).toBe(true);
  expect(reply.view).toBeDefined();
  expect(updates).toEqual([
    { requestId: 'manual', ok: true, progress: 0 },
    { requestId: 'manual', ok: true, progress: 0 },
  ]);
});
