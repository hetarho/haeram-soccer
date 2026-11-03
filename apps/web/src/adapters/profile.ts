import type { StoragePort } from './repository';

// Plain guards keep the save schema and its validator out of the entry bundle (→ARCH-28).
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/**
 * Owner-scoped data (→ARCH-29). Today the owner is this browser profile, holding a random device
 * ID and the game-slot index; once sign-in exists an account adapter adopts these records and
 * merges them by ID and update time, so every record carries its owner, a stable ID and when it
 * last changed.
 */
export interface Owner {
  kind: 'device' | 'account';
  id: string;
}
export const DEVICE_KEY = 'haeram-soccor:device';
export function ownerOf(value: unknown): Owner | undefined {
  const owner = value as Partial<Owner> | null;
  return owner &&
    typeof owner === 'object' &&
    (owner.kind === 'device' || owner.kind === 'account') &&
    text(owner.id, 100)
    ? { kind: owner.kind, id: owner.id }
    : undefined;
}

/** This browser's owner record, created once with a random ID. */
export function deviceOwner(storage: StoragePort): Owner {
  let id = storage.getItem(DEVICE_KEY);
  if (!id || id.length > 100) {
    id = crypto.randomUUID();
    try {
      storage.setItem(DEVICE_KEY, id);
    } catch {
      /* Without storage the ID lasts for this session only. */
    }
  }
  return { kind: 'device', id };
}
