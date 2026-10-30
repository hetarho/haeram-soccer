import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
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
    route.fulfill({ contentType: 'text/javascript', body: probe }),
  );
  await page.goto('/__movement_probe.html');
  const results = [];
  for (const mode of ['native', 'missing', 'compile-error', 'execution-error'] as const) {
    const result = await page.evaluate(
      (mode: MovementProbeMode) =>
        new Promise<{
          digest?: string;
          capable: boolean;
          compilations: number;
          steps: number;
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
    if (result.capable) {
      if (mode === 'native') {
        expect(result.compilations).toBe(1);
        expect(result.steps).toBeGreaterThan(1);
      }
      if (mode === 'missing') expect(result.compilations).toBe(0);
      if (mode === 'compile-error') {
        expect(result.compilations).toBe(1);
        expect(result.steps).toBe(0);
      }
      if (mode === 'execution-error') {
        expect(result.compilations).toBe(1);
        expect(result.steps).toBe(2);
      }
    }
    results.push(result);
  }
  expect(new Set(results.map((r) => r.digest)).size).toBe(1);
});
