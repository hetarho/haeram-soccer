import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewRuntime, type Sample } from './client';
import { gameStore, initialClientState } from '../runtime/store';

afterEach(() => {
  vi.unstubAllGlobals();
  gameStore.setState(initialClientState, true);
});
const sample = () => ({ view: { world: { id: 'preview-world' } }, playback: {} }) as Sample;

describe('sample client boundary', () => {
  it('keeps command/save/founding actions and the clock entirely in memory', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const fixture = sample(),
      before = JSON.stringify(fixture),
      notify = vi.fn();
    const { client, controller } = previewRuntime(fixture, notify);
    await client.command({ type: 'next-event' });
    await client.save();
    await client.forget();
    controller.start();
    controller.setPace('x5');
    expect(controller.store.getState()).toMatchObject({ running: true, pace: 'x5' });
    controller.pause();
    expect(controller.store.getState().running).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture)).toBe(before);
    expect(gameStore.getState().view).toBe(fixture.view);
    expect(notify).toHaveBeenCalled();
  });
  it('sends the normal read protocol and includes the isolated sample world', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({ ok: true, requestId: 'read', worldMarket: { world: 'preview-world' } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const { client } = previewRuntime(sample(), vi.fn());
    await client.fullStats({ kind: 'league', groupKey: 'ENG:1:0' });
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({
      type: 'full-stats',
      kind: 'league',
      groupKey: 'ENG:1:0',
    });
    await client.worldMarket({ name: 'George' });
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({
      type: 'world-market',
      query: { name: 'George', world: 'preview-world' },
    });
  });
});
