import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import { modeSwitchBlocked, settingsForMode, switchProgressMode } from './progressMode';

const world = () =>
  ({ id: 'career', year: 1950, calendar: { day: 12 }, settings: defaultSettings() }) as World;
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
  const command = vi.fn(async (command) => {
    publish({ ...gameStore.getState().view!.world, settings: command.settings });
    return { ok: true };
  });
  const pause = vi.fn();
  return {
    command,
    pause,
    client: { command, whenIdle: idle } as unknown as GameClient,
    controller: { pause } as unknown as ProgressionController,
  };
}
describe('progression mode shortcut', () => {
  it('enables the match report on manual entry while preserving other settings', () => {
    const w = world();
    w.settings!.observations = { matchEve: false, windowOpen: true };
    const original = structuredClone(w);
    const settings = settingsForMode(w, 'manual');
    expect(settings).toEqual({
      ...w.settings,
      mode: 'manual',
      observations: { matchEve: true, windowOpen: true },
    });
    expect(w).toEqual(original);
    expect(settingsForMode({ ...w, settings }, 'automatic')).toEqual({
      ...settings,
      mode: 'automatic',
    });
  });
  it('settles admitted work, pauses and switches without advancing the date', async () => {
    const { command, pause, client, controller } = ports();
    await switchProgressMode(client, controller, { id: 'career', mode: 'automatic' });
    expect(pause).toHaveBeenCalledOnce();
    expect(command).toHaveBeenCalledOnce();
    expect(command.mock.calls[0][0].type).toBe('settings');
    expect(gameStore.getState().view!.world.calendar!.day).toBe(12);
  });
  it.each([
    'readonly',
    'error',
    'busy',
    'processing',
    'clockRunning',
    'pendingActions',
    'critical',
    'bankrupt',
  ] as const)('protects %s state', async (key) => {
    const { command, client, controller } = ports();
    if (key === 'critical' || key === 'bankrupt')
      publish({ ...world(), [key]: 'blocked' } as unknown as World);
    else gameStore.setState({ [key]: key === 'pendingActions' ? 1 : true });
    expect(modeSwitchBlocked(gameStore.getState())).toBe(true);
    await expect(
      switchProgressMode(client, controller, { id: 'career', mode: 'automatic' }),
    ).rejects.toThrow();
    expect(command).not.toHaveBeenCalled();
  });
  it('rejects switching during play without pausing the running clock', async () => {
    const p = ports();
    gameStore.setState({ clockRunning: true });
    await expect(
      switchProgressMode(p.client, p.controller, { id: 'career', mode: 'automatic' }),
    ).rejects.toThrow('정지');
    expect(p.pause).not.toHaveBeenCalled();
    expect(p.command).not.toHaveBeenCalled();
  });
  it.each(['world', 'mode'])('rejects a changed %s after waiting', async (change) => {
    const p = ports(async () =>
      publish(
        change === 'world'
          ? { ...world(), id: 'other' }
          : { ...world(), settings: { ...defaultSettings(), mode: 'manual' } },
      ),
    );
    await expect(
      switchProgressMode(p.client, p.controller, { id: 'career', mode: 'automatic' }),
    ).rejects.toThrow();
    expect(p.command).not.toHaveBeenCalled();
  });
  it('surfaces a rejected settings command', async () => {
    const p = ports();
    p.command.mockResolvedValue({ ok: false });
    await expect(
      switchProgressMode(p.client, p.controller, { id: 'career', mode: 'automatic' }),
    ).rejects.toThrow('변경되지');
  });
});
