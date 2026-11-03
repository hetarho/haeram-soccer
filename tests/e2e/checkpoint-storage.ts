import type { Page } from '@playwright/test';

/** Access persisted browser checkpoints without reaching into application state. */
export const idbGet = (page: Page, store: 'games' | 'checkpoints', key: string) =>
  page.evaluate(
    ({ store, key }) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('haeram-soccor', 2);
        open.onupgradeneeded = () => {
          for (const name of ['games', 'checkpoints'])
            if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name);
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction(store, 'readonly'),
            get = tx.objectStore(store).get(key);
          tx.oncomplete = () => {
            db.close();
            resolve(typeof get.result === 'string' ? get.result : null);
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { store, key },
  );

export const idbPut = (page: Page, store: 'games' | 'checkpoints', key: string, value: string) =>
  page.evaluate(
    ({ store, key, value }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('haeram-soccor', 2);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(value, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { store, key, value },
  );

/** Seed on the static same-origin page, with no running app or asynchronous startup race. */
export async function seedCheckpoints(
  page: Page,
  seed: { active: string; manifest: string; previous?: string },
) {
  await page.goto('/404.html');
  await page.evaluate(
    ({ active, manifest, previous }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('haeram-soccor', 2);
        open.onupgradeneeded = () => {
          for (const name of ['games', 'checkpoints'])
            if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name);
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('checkpoints', 'readwrite'),
            store = tx.objectStore('checkpoints');
          store.put(active, 'active');
          if (previous === undefined) store.delete('previous');
          else store.put(previous, 'previous');
          tx.oncomplete = () => {
            db.close();
            localStorage.setItem('haeram-soccor:manifest', manifest);
            resolve();
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    seed,
  );
}
export async function seedRawCheckpoint(page: Page, raw: string, previous?: string) {
  const { worldId, generation, parentGeneration } = JSON.parse(raw);
  await seedCheckpoints(page, {
    active: raw,
    previous,
    manifest: JSON.stringify({ worldId, generation, parentGeneration }),
  });
}
