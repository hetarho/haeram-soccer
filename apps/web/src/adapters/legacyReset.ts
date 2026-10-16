import { ACTIVE_SAVE_KEYS, GameIndexStore, type ParkedStore } from './games';
import type { StoragePort } from './repository';
import {
  envelopeEngine,
  LEGACY_ENGINE_VERSIONS,
} from '../../../../packages/contracts/src/versions';
const recognizedLegacy = async (raw: string) =>
  LEGACY_ENGINE_VERSIONS.includes(envelopeEngine(raw) ?? '') &&
  (await import('./persistence')).recognizedLegacy(raw);
const CLEANUP = 'haeram-soccor:legacy-cleanup';

/** Called only with the writer lock. Each mutation rechecks ownership and its source bytes. */
export async function resetLegacy(
  storage: StoragePort,
  parked: ParkedStore | undefined,
  canWrite: () => boolean,
) {
  if (!canWrite()) return;
  const index = new GameIndexStore(storage);
  const cleanup = async () => {
    const raw = storage.getItem(CLEANUP);
    if (!raw || !parked) return;
    let ids: unknown;
    try {
      ids = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return;
    for (const id of ids as string[]) {
      const value = await parked.get(id);
      if (value && (await recognizedLegacy(value)) && canWrite()) {
        const fresh = index.read();
        const slot = fresh.slots.findIndex((entry) => entry?.id === id);
        // Complete a journal left before the index write. A protected active pair wins.
        if (slot >= 0) {
          if (fresh.active === slot) continue;
          fresh.slots[slot] = null;
          index.write(fresh);
        }
        if (canWrite() && (await parked.get(id)) === value) await parked.remove(id);
      }
    }
    if (canWrite() && storage.getItem(CLEANUP) === raw) storage.removeItem(CLEANUP);
  };
  await cleanup();
  // Clear index references before envelopes: interruption can leave harmless orphan bytes, never
  // an active index pointing at a deleted career. Retrying completes an interrupted reset.
  for (let slot = 0; slot < 3; slot++) {
    const current = index.read(),
      entry = current.slots[slot];
    if (!entry) continue;
    const raw =
      current.active === slot
        ? ACTIVE_SAVE_KEYS.slice(1)
            .map((key) => storage.getItem(key))
            .filter((v): v is string => !!v)
        : parked
          ? [await parked.get(entry.id)].filter((v): v is string => !!v)
          : [];
    // A mixed active pair cannot establish that its game as a whole is legacy.
    if (!raw.length || !(await Promise.all(raw.map(recognizedLegacy))).every(Boolean)) continue;
    if (!canWrite()) return;
    const fresh = index.read();
    if (fresh.slots[slot]?.id !== entry.id || fresh.active !== current.active) continue;
    fresh.slots[slot] = null;
    if (fresh.active === slot) fresh.active = null;
    if (parked) storage.setItem(CLEANUP, JSON.stringify([entry.id]));
    index.write(fresh);
    await cleanup();
  }
  // Manifest is removed only if its selected envelope is recognized. Protected selected saves
  // keep their manifest even when their old predecessor is independently removed.
  const manifestKey = ACTIVE_SAVE_KEYS[0];
  const manifest = storage.getItem(manifestKey);
  if (manifest) {
    let selected: { slot?: number } | undefined;
    try {
      selected = JSON.parse(manifest);
    } catch {
      /* preserve unknown manifests */
    }
    if (selected) {
      const key =
        selected.slot === 0
          ? ACTIVE_SAVE_KEYS[1]
          : selected.slot === 1
            ? ACTIVE_SAVE_KEYS[2]
            : undefined;
      const raw = key ? storage.getItem(key) : null;
      if (
        raw &&
        (await recognizedLegacy(raw)) &&
        canWrite() &&
        storage.getItem(manifestKey) === manifest &&
        storage.getItem(key!) === raw
      )
        storage.removeItem(manifestKey);
    }
  }
  for (const key of ACTIVE_SAVE_KEYS.slice(1)) {
    const raw = storage.getItem(key);
    if (raw && (await recognizedLegacy(raw)) && canWrite() && storage.getItem(key) === raw)
      storage.removeItem(key);
  }
}
