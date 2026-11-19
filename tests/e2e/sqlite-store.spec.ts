import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

/**
 * The game database pool in a real worker on the app's origin (→ARCH-11): the adapter, bundled
 * here with the pinned SQLite build served beside it, creates, writes, reopens and deletes a game
 * file in OPFS. T1006 opens games through the engine worker; until then this is the browser check.
 */
const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const SQLITE = '/__sqlite-store/sqlite/index.mjs';

const workerSource = `
import { sqlRecordStore } from ${JSON.stringify(root('apps/web/src/adapters/sqlRecordStore.ts'))};
import {
  openGamePool, gameDriver, gameFileName, listFiles, deleteFile, exportFile,
} from ${JSON.stringify(root('apps/web/src/adapters/sqliteWasm.ts'))};
const file = gameFileName('e2e-store');
try {
  const pool = await openGamePool();
  let store = sqlRecordStore(gameDriver(pool, file));
  store.write({ put: [{ table: 'person', key: 'p1', seq: 0, cold: false, data: '{"n":1}' }], delete: [] });
  store.close();
  store = sqlRecordStore(gameDriver(pool, file));
  const reopened = store.get('person', 'p1')?.data;
  store.close();
  const listed = listFiles(pool).includes(file);
  const bytes = exportFile(pool, file).length;
  const deleted = deleteFile(pool, file);
  postMessage({ reopened, listed, bytes, deleted, after: listFiles(pool).includes(file) });
} catch (error) {
  postMessage({ error: String(error) });
}
`;

test('a game file is created, written, reopened and deleted in the OPFS pool', async ({ page }) => {
  const bundle = await build({
    stdin: { contents: workerSource, resolveDir: root('.'), loader: 'ts' },
    bundle: true,
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'served-sqlite',
        setup(b) {
          b.onResolve({ filter: /^@sqlite\.org\/sqlite-wasm$/ }, () => ({
            path: SQLITE,
            external: true,
          }));
        },
      },
    ],
  });
  const dist = (name: string) =>
    readFileSync(root(`node_modules/@sqlite.org/sqlite-wasm/dist/${name}`));
  await page.route('**/__sqlite-store/worker.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0]!.text }),
  );
  await page.route('**/__sqlite-store/sqlite/index.mjs', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: dist('index.mjs') }),
  );
  await page.route('**/__sqlite-store/sqlite/sqlite3.wasm', (route) =>
    route.fulfill({ contentType: 'application/wasm', body: dist('sqlite3.wasm') }),
  );
  await page.goto('/');
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const worker = new Worker('/__sqlite-store/worker.js', { type: 'module' });
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => resolve({ error: event.message });
      }),
  );
  expect(result).toEqual({
    reopened: '{"n":1}',
    listed: true,
    bytes: expect.any(Number),
    deleted: true,
    after: false,
  });
});
