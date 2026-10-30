import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { MovementProbeMode } from '../fixtures/movement-worker-probe';

const probe = buildSync({
  entryPoints: [fileURLToPath(new URL('../fixtures/movement-worker-probe.ts', import.meta.url))],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  write: false,
  logLevel: 'error',
}).outputFiles[0]!.text;
const csp = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(
  readFileSync(new URL('../../apps/web/public/_headers', import.meta.url), 'utf8'),
)![1]!;
test('the movement backend preserves observed facts and positions through every fallback', async ({
  page,
}) => {
  await page.route('**/__movement_probe.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Movement parity probe</title>',
    }),
  );
  await page.route('**/__movement_probe.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      headers: { 'Content-Security-Policy': csp },
      body: probe,
    }),
  );
  await page.goto('/__movement_probe.html');
  const results = [];
  for (const mode of ['native', 'missing-wasm', 'allocation-error', 'execution-error'] as const) {
    const result = await page.evaluate(
      (mode: MovementProbeMode) =>
        new Promise<{
          digest?: string;
          allocations: number;
          reads: number;
          error?: string;
        }>((resolve, reject) => {
          const worker = new Worker('/__movement_probe.mjs', { type: 'module' });
          worker.onmessage = (event) => {
            worker.terminate();
            resolve(event.data);
          };
          worker.onerror = (event) => {
            worker.terminate();
            reject(new Error(event.message));
          };
          worker.postMessage({ mode });
        }),
      mode,
    );
    expect(result.error, mode).toBeUndefined();
    expect(result.digest, mode).toMatch(/^[a-f0-9]{64}$/);
    expect(result.allocations, mode).toBe(1);
    if (mode === 'native' || mode === 'missing-wasm') expect(result.reads, mode).toBeGreaterThan(3);
    if (mode === 'allocation-error') expect(result.reads).toBe(0);
    if (mode === 'execution-error') expect(result.reads).toBe(3);
    results.push(result);
  }
  expect(new Set(results.map((r) => r.digest)).size).toBe(1);
});
