import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import { pendingWorkPreview } from '../../../../packages/engine/src/pending-work-preview';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import {
  applyOfficeChange,
  officeBulkChange,
  officeProposal,
  officeSettings,
} from './officeChanges';
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
  it.each(['direct', 'delegated'] as const)(
    'applies a reviewed bulk %s choice to observations and business while preserving fresh mode',
    async (value) => {
      const w = world(),
        before = structuredClone(w),
        change = officeBulkChange(w, value)!;
      const proposal = officeProposal(w, change);
      expect(w).toEqual(before);
      const p = ports(async () => publish({ ...w, settings: { ...w.settings!, mode: 'manual' } }));
      await applyOfficeChange(p.client, p.controller, proposal);
      const applied = gameStore.getState().view!.world;
      expect(
        Object.values(applied.settings!.responsibilities).every((item) => item === value),
      ).toBe(true);
      expect(applied.settings!.observations).toEqual({
        matchEve: value === 'direct',
        windowOpen: value === 'direct',
      });
      expect(applied.settings!.mode).toBe('manual');
      expect(p.command).toHaveBeenCalledTimes(1);
      expect(officeBulkChange(applied, value)).toBeUndefined();
    },
  );
  it.each(['direct', 'delegated'] as const)(
    'includes observation-only bulk %s changes when all business settings already match',
    (value) => {
      const w = world();
      w.settings = officeSettings(w, officeBulkChange(w, value)!);
      w.settings.observations = { matchEve: value !== 'direct', windowOpen: value !== 'direct' };
      expect(officeBulkChange(w, value)).toEqual({
        responsibilities: {},
        observations: { matchEve: value === 'direct', windowOpen: value === 'direct' },
      });
    },
  );
  it('rejects a bulk confirmation when a reviewed report choice changes before apply', async () => {
    const w = world(),
      proposal = officeProposal(w, officeBulkChange(w, 'delegated')!),
      p = ports(async () => {
        publish({
          ...w,
          settings: { ...w.settings!, observations: { matchEve: false, windowOpen: false } },
        });
      });
    await expect(applyOfficeChange(p.client, p.controller, proposal)).rejects.toThrow('이미 설정');
    expect(p.command).not.toHaveBeenCalled();
  });
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
