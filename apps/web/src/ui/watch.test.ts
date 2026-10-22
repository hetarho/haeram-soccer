import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import type { View } from '../runtime/protocol';
import type { ProgressionController } from '../runtime/progression';
import { gameStore, initialClientState } from '../runtime/store';
import { watchNextMatch } from './watch';
const world = (day = 6) =>
  ({
    id: 'career',
    year: 1950,
    playerClub: 'own',
    calendar: { day },
    fixtures: [{ id: 'match', year: 1950, round: 1, kind: 'league', home: 'own', away: 'other' }],
    cups: [],
    europe: [],
  }) as unknown as World;
const publish = (w: World) => gameStore.setState({ view: { world: w } as View });
beforeEach(() => {
  gameStore.setState(
    { ...initialClientState, busy: false, processing: false, readonly: false },
    true,
  );
  publish(world());
});
afterEach(() => gameStore.setState(initialClientState, true));
function ports(idle = async () => {}) {
  const command = vi.fn(async () => ({ ok: true, playback: {} }));
  const beginWatch = vi.fn(),
    endWatch = vi.fn(),
    open = vi.fn();
  return {
    command,
    beginWatch,
    endWatch,
    open,
    client: { command, whenIdle: idle } as unknown as GameClient,
    controller: { beginWatch, endWatch, pause: vi.fn() } as unknown as ProgressionController,
  };
}
describe('match-eve observation entry', () => {
  it.each([0, 4, 7, 8])(
    'never advances from calendar day %s to manufacture an eve',
    async (day) => {
      publish(world(day));
      const p = ports();
      await watchNextMatch(p.client, p.controller, p.open, { fromEve: true });
      expect(p.command).not.toHaveBeenCalled();
      expect(p.beginWatch).not.toHaveBeenCalled();
    },
  );
  it('requires the eve entry even on the correct date', async () => {
    const p = ports();
    await watchNextMatch(p.client, p.controller, p.open);
    expect(p.command).not.toHaveBeenCalled();
  });
  it('admits the eve and opens its returned playback', async () => {
    const p = ports();
    await watchNextMatch(p.client, p.controller, p.open, { fromEve: true });
    expect(p.beginWatch).toHaveBeenCalledWith(true);
    expect(p.command).toHaveBeenCalledWith({ type: 'next-match' }, { background: false });
    expect(p.open).toHaveBeenCalledOnce();
  });
  it('keeps a failed watch stopped for the client recovery UI', async () => {
    const p = ports();
    p.command.mockRejectedValue(new Error('worker failed'));
    await watchNextMatch(p.client, p.controller, p.open, { fromEve: true });
    expect(p.controller.pause).toHaveBeenCalledOnce();
    expect(p.endWatch).toHaveBeenCalledOnce();
    expect(p.open).not.toHaveBeenCalled();
  });
  it.each(['world', 'day', 'readonly', 'critical'])(
    'rechecks %s after admitted work settles',
    async (change) => {
      const p = ports(async () => {
        if (change === 'readonly') gameStore.setState({ readonly: true });
        else
          publish({
            ...world(change === 'day' ? 7 : 6),
            ...(change === 'world' ? { id: 'other' } : {}),
            ...(change === 'critical' ? { critical: 'stop' } : {}),
          });
      });
      await watchNextMatch(p.client, p.controller, p.open, { fromEve: true });
      expect(p.command).not.toHaveBeenCalled();
      expect(p.endWatch).toHaveBeenCalledOnce();
      expect(p.open).not.toHaveBeenCalled();
    },
  );
});
