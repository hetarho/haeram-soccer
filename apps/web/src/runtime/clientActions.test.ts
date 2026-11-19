import { describe, expect, it, vi } from 'vitest';
import { GameClient } from './client';
import { createGameStore, gameActionsBlocked, initialClientState } from './store';
import type { Reply, StoppedReads, View } from './protocol';

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
    clockEpoch: 0,
    cancelled: true,
    enqueue,
    notify,
  }) as GameClient;
  return { client, enqueue, notify };
}

describe('calendar edit protection', () => {
  it('drops slow fields during play and refuses stale stopped-read replies', async () => {
    const { client } = clientWithQueue();
    const view = {
      world: {
        id: 'world',
        revision: 1,
        disciplineNames: { p: { name: 'P', club: 'C' } },
        inbox: [],
      },
      coaches: {},
      managers: [],
      transfers: [],
      office: {},
    } as unknown as View;
    client.state.view = view;
    const store = createGameStore();
    client.setClockRunning(true);
    store.publish(client.state);
    expect(store.getState().view).toMatchObject({ world: { id: 'world' } });
    expect(store.getState().view!.managers).toBeUndefined();
    expect(store.getState().view!.world.disciplineNames).toBeUndefined();
    store.publish({
      ...client.state,
      view: {
        ...client.state.view!,
        world: { ...client.state.view!.world, approvalWaits: { request: 8 } },
      },
    });
    expect(store.getState().view!.world.approvalWaits).toEqual({ request: 8 });
    client.setClockRunning(false);
    let answer!: (value: StoppedReads) => void;
    client.stoppedReads = () =>
      new Promise((resolve) => {
        answer = resolve;
      });
    const reads = {
      world: 'world',
      revision: 1,
      coaches: {},
      managers: [],
      transfers: [],
      office: {},
      disciplineNames: {},
    } as unknown as StoppedReads;
    const stale = client.refreshStoppedReads();
    client.state.view = {
      ...client.state.view!,
      world: { ...client.state.view!.world, revision: 2 },
    };
    answer(reads);
    await stale;
    expect(client.state.view!.managers).toBeUndefined();
    const replacement = client.refreshStoppedReads();
    client.state.view = {
      ...client.state.view!,
      world: { ...client.state.view!.world, id: 'replacement' },
    };
    answer({ ...reads, revision: 2 });
    await replacement;
    expect(client.state.view!.managers).toBeUndefined();
    client.state.view = {
      ...client.state.view!,
      world: { ...client.state.view!.world, id: 'world' },
    };
    const current = client.refreshStoppedReads();
    answer({ ...reads, revision: 2 });
    await current;
    expect(client.state.view!.managers).toEqual([]);
    const restarted = client.refreshStoppedReads();
    client.setClockRunning(true);
    client.setClockRunning(false);
    answer({ ...reads, revision: 2 });
    await restarted;
    expect(client.state.view!.managers).toBeUndefined();
  });
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
    expect(await client.command({ type: 'sign-sponsor', slot: 'local', offer: 0 })).toBeUndefined();
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
    expect(await client.command({ type: 'sign-sponsor', slot: 'local', offer: 0 })).toBeUndefined();
    expect(enqueue).toHaveBeenCalledOnce();
    finish({ ok: true } as Reply);
    await tick;
    await client.command({ type: 'sign-sponsor', slot: 'local', offer: 0 });
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
