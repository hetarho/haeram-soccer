import { describe, expect, it } from 'vitest';
import { DEVICE_KEY, deviceOwner, ownerOf } from './profile';

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
});
