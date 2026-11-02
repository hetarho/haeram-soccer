import { describe, expect, it } from 'vitest';
import { DEVICE_KEY, STRATEGIES_KEY, deviceOwner, ownerOf, removeStrategyLibrary } from './profile';
import { GAMES_KEY } from './games';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('device profile (→ARCH-29)', () => {
  it('keeps one random device owner', () => {
    const storage = memory();
    const owner = deviceOwner(storage);
    expect(owner.kind).toBe('device');
    expect(deviceOwner(storage)).toEqual(owner);
    expect(storage.data.get(DEVICE_KEY)).toBe(owner.id);
    expect(ownerOf(owner)).toEqual(owner);
    expect(ownerOf({ kind: 'browser', id: owner.id })).toBeUndefined();
  });

  it('removes the old strategy library on writer start', () => {
    // Earlier versions kept saved directions on the device (→SAVE-25); the device ID and the
    // game-slot index stay.
    const storage = memory();
    const owner = deviceOwner(storage);
    storage.setItem(
      STRATEGIES_KEY,
      JSON.stringify({ v: 1, owner, items: [{ id: 'a', name: '우리 방식', build: {} }] }),
    );
    storage.setItem(GAMES_KEY, JSON.stringify({ owner, slots: [null, null, null] }));
    removeStrategyLibrary(storage);
    expect(storage.data.has(STRATEGIES_KEY)).toBe(false);
    expect(storage.data.get(DEVICE_KEY)).toBe(owner.id);
    expect(storage.data.has(GAMES_KEY)).toBe(true);
    // Nothing to remove, or storage that refuses, is no failure.
    removeStrategyLibrary(storage);
    expect(() =>
      removeStrategyLibrary({
        removeItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});
