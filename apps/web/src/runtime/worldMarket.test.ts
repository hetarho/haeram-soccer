import { describe, expect, it, vi } from 'vitest';
import { GameClient } from './client';
import type { Reply, View } from './protocol';
import type { WorldMarketPage, WorldMarketTarget } from '../../../../packages/contracts/src/types';
import { initialClientState } from './store';

const page: WorldMarketPage = {
  world: 'one',
  revision: 3,
  total: 100,
  page: 0,
  pageSize: 7,
  items: [],
};
const target: WorldMarketTarget = {
  world: 'one',
  kind: 'club',
  clubId: 'seller',
  playerId: 'person',
};
/** Isolate request/reply admission; no worker, host, codec, storage or world generation. */
function clientWithRpc(
  rpc: (body: unknown) => Promise<Reply> = async () => ({ ok: true, worldMarket: page }) as Reply,
) {
  const client = Object.assign(Object.create(GameClient.prototype), {
    state: { ...initialClientState, view: { world: { id: 'one' } } as View },
    rpc: vi.fn(rpc),
  }) as GameClient;
  return client;
}

describe('world market client reads', () => {
  it('names the active world, uses the displayed-day read gate and leaves command/busy state alone', async () => {
    const rpc = vi.fn(async () => ({ ok: true, worldMarket: page }) as Reply);
    const client = clientWithRpc(rpc);
    let release!: () => void;
    const ready = new Promise<void>((resolve) => (release = resolve));
    const settled = vi.fn();
    client.readGate = () => ({ ready, settled });
    const state = client.state;
    const reading = client.worldMarket({ page: 0, pageSize: 7, sort: 'age' });
    await Promise.resolve();
    expect(rpc).not.toHaveBeenCalled();
    release();
    expect(await reading).toEqual(page);
    expect(rpc).toHaveBeenCalledWith({
      type: 'world-market',
      query: { world: 'one', page: 0, pageSize: 7, sort: 'age' },
    });
    expect(settled).toHaveBeenCalledOnce();
    expect(client.state).toBe(state);
  });
  it('rejects replies arriving after world replacement or labelled for another world', async () => {
    const client = clientWithRpc(async () => {
      client.state.view = { world: { id: 'two' } } as View;
      return { ok: true, worldMarket: page } as Reply;
    });
    await expect(client.worldMarket()).rejects.toThrow('다른 커리어');
    await expect(
      clientWithRpc(
        async () => ({ ok: true, worldMarket: { ...page, world: 'wrong' } }) as Reply,
      ).worldMarket(),
    ).rejects.toThrow('다른 커리어');
  });
  it('retains errors and releases the read gate on failure', async () => {
    const client = clientWithRpc(async () => ({ ok: false, error: 'retry query' }) as Reply);
    const settled = vi.fn();
    client.readGate = () => ({ settled });
    await expect(client.worldMarket()).rejects.toThrow('retry query');
    expect(settled).toHaveBeenCalledOnce();
  });
  it('guards detail targets and late detail responses by world', async () => {
    const rpc = vi.fn(async () => ({ ok: true, worldMarketDetail: { world: 'wrong' } }) as Reply);
    const client = clientWithRpc(rpc);
    await expect(client.worldMarketDetail({ ...target, world: 'two' })).rejects.toThrow(
      '다른 커리어',
    );
    expect(rpc).not.toHaveBeenCalled();
    await expect(client.worldMarketDetail(target, '123', true)).rejects.toThrow('다른 커리어');
    expect(rpc).toHaveBeenCalledWith({
      type: 'world-market-detail',
      target,
      fee: '123',
      loan: true,
    });
  });
});
