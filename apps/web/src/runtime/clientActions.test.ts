import { describe, expect, it, vi } from 'vitest';
import { GameClient } from './client';
import { gameActionsBlocked, initialClientState } from './store';
import type { Reply } from './protocol';

/** Isolate public admission from worker, saves and engine execution. */
function clientWithQueue(result = Promise.resolve({ ok: true } as Reply)) {
  const enqueue = vi.fn(() => result);
  const notify = vi.fn();
  const client = Object.assign(Object.create(GameClient.prototype), {
    state: {
      ...initialClientState,
      busy: false,
      processing: false,
      activity: 'idle',
      readonly: false,
    },
    automaticPending: 0,
    cancelled: true,
    enqueue,
    notify,
  }) as GameClient;
  return { client, enqueue, notify };
}

describe('calendar edit protection', () => {
  it('stays locked between day calculations and until the final operation settles', () => {
    const { client } = clientWithQueue();
    expect(gameActionsBlocked(client.state)).toBe(false);
    client.setClockRunning(true);
    for (const processing of [false, true, false, true]) {
      client.state.processing = processing;
      expect(gameActionsBlocked(client.state)).toBe(true);
    }
    client.setClockRunning(false);
    expect(gameActionsBlocked(client.state)).toBe(true);
    client.state.processing = false;
    expect(gameActionsBlocked(client.state)).toBe(false);
    client.state.pendingActions = 1;
    expect(gameActionsBlocked(client.state)).toBe(true);
  });

  it('does not admit or queue an owner change during play, preserving cancellation and errors', async () => {
    const { client, enqueue } = clientWithQueue();
    client.setClockRunning(true);
    client.state.error = 'existing recovery error';
    expect(await client.command({ type: 'support' })).toBeUndefined();
    expect(enqueue).not.toHaveBeenCalled();
    expect(client.state.pendingActions).toBeUndefined();
    expect(client.state.error).toBe('existing recovery error');
    expect((client as unknown as { cancelled: boolean }).cancelled).toBe(true);
  });

  it('admits automatic ticks and notification reads while the clock runs', async () => {
    const { client, enqueue } = clientWithQueue();
    client.setClockRunning(true);
    await client.command({ type: 'advance-days', days: 1 }, { automatic: true, background: true });
    await client.command({ type: 'read-inbox', id: 'notice' });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(client.state.pendingActions).toBe(0);
    expect(client.state.clockRunning).toBe(true);
  });

  it('rejects changes after stop while an admitted automatic step is still pending', async () => {
    let finish!: (reply: Reply) => void;
    const pending = new Promise<Reply>((resolve) => (finish = resolve));
    const { client, enqueue } = clientWithQueue(pending);
    client.setClockRunning(true);
    const tick = client.command({ type: 'advance-days', days: 1 }, { automatic: true });
    client.setClockRunning(false);
    expect(await client.command({ type: 'support' })).toBeUndefined();
    expect(enqueue).toHaveBeenCalledOnce();
    finish({ ok: true } as Reply);
    await tick;
    await client.command({ type: 'support' });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('publishes clock transitions once without repeated notifications between days', () => {
    const { client, notify } = clientWithQueue();
    client.setClockRunning(true);
    client.setClockRunning(true);
    client.setClockRunning(false);
    client.setClockRunning(false);
    expect(notify.mock.calls.map(([state]) => state.clockRunning)).toEqual([true, false]);
  });
  it('keeps save import available for recovery errors while retaining clock and ownership locks', () => {
    const { client } = clientWithQueue();
    client.state.error = 'damaged save';
    expect(gameActionsBlocked(client.state)).toBe(true);
    expect(gameActionsBlocked(client.state, { recovery: true })).toBe(false);
    client.setClockRunning(true);
    expect(gameActionsBlocked(client.state, { recovery: true })).toBe(true);
    client.setClockRunning(false);
    client.state.readonly = true;
    expect(gameActionsBlocked(client.state, { recovery: true })).toBe(true);
  });
  it('allows previews during calendar work but protects drafts while an owner change is pending', () => {
    const { client } = clientWithQueue();
    client.setClockRunning(true);
    client.state.processing = true;
    expect(gameActionsBlocked(client.state, { preview: true })).toBe(false);
    client.state.pendingActions = 1;
    expect(gameActionsBlocked(client.state, { preview: true })).toBe(true);
  });

  it.each(['readonly', 'busy', 'processing', 'error'] as const)(
    'retains %s protection after stopping',
    (key) => {
      const { client } = clientWithQueue();
      Object.assign(client.state, { [key]: key === 'error' ? 'retry' : true });
      expect(gameActionsBlocked(client.state)).toBe(true);
    },
  );
});
