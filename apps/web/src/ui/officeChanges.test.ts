import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import { pendingWorkPreview } from '../../../../packages/engine/src/pending-work-preview';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { applyOfficeChange, officeProposal, officeSettings } from './officeChanges';
vi.mock('../../../../packages/engine/src/pending-work-preview', () => ({
  pendingWorkPreview: vi.fn(() => []),
}));
const world = () => ({ id: 'office', settings: defaultSettings() }) as World;
const publish = (w: World) => gameStore.setState({ view: { world: w } as View });
beforeEach(() => {
  vi.mocked(pendingWorkPreview).mockReturnValue([]);
  gameStore.setState(
    { ...initialClientState, readonly: false, busy: false, processing: false },
    true,
  );
  publish(world());
});
afterEach(() => gameStore.setState(initialClientState, true));
function ports(idle = async () => {}) {
  const command = vi.fn(async (action) => {
    publish({ ...gameStore.getState().view!.world, settings: action.settings });
    return { ok: true };
  });
  const controller = { pause: vi.fn() } as unknown as ProgressionController;
  return { command, controller, client: { command, whenIdle: idle } as unknown as GameClient };
}
describe('reviewed office changes', () => {
  it('prepares without mutating, then preserves unrelated fresh settings on confirmation', async () => {
    const w = world(),
      before = structuredClone(w);
    const proposal = officeProposal(w, { responsibilities: { recruitment: 'delegated' } });
    expect(w).toEqual(before);
    const p = ports(async () =>
      publish({
        ...w,
        settings: {
          ...w.settings!,
          mode: 'manual',
          observations: { matchEve: false, windowOpen: true },
        },
      }),
    );
    await applyOfficeChange(p.client, p.controller, proposal);
    expect(gameStore.getState().view!.world.settings).toEqual({
      ...officeSettings(w, proposal.change),
      mode: 'manual',
      observations: { matchEve: false, windowOpen: true },
    });
  });
  it.each(['world', 'authority', 'pending', 'readonly', 'error', 'critical'])(
    'rejects stale or protected %s after waiting',
    async (change) => {
      const proposal = officeProposal(world(), { responsibilities: { recruitment: 'delegated' } });
      const p = ports(async () => {
        if (change === 'world') publish({ ...world(), id: 'other' });
        if (change === 'authority')
          publish({ ...world(), settings: officeSettings(world(), proposal.change) });
        if (change === 'pending')
          vi.mocked(pendingWorkPreview).mockReturnValue([
            { key: 'recruitment', to: 'delegated', count: 1, refs: ['new'] },
          ]);
        if (change === 'readonly') gameStore.setState({ readonly: true });
        if (change === 'error') gameStore.setState({ error: 'failed' });
        if (change === 'critical') publish({ ...world(), critical: 'stop' });
      });
      await expect(applyOfficeChange(p.client, p.controller, proposal)).rejects.toThrow();
      expect(p.command).not.toHaveBeenCalled();
    },
  );
  it('surfaces failure for retry and changes only the selected observation', async () => {
    const proposal = officeProposal(world(), { observations: { matchEve: false } }),
      p = ports();
    p.command.mockResolvedValueOnce({ ok: false });
    await expect(applyOfficeChange(p.client, p.controller, proposal)).rejects.toThrow('적용하지');
    await applyOfficeChange(p.client, p.controller, proposal);
    expect(gameStore.getState().view!.world.settings).toEqual({
      ...defaultSettings(),
      observations: { matchEve: false, windowOpen: false },
    });
  });
});
