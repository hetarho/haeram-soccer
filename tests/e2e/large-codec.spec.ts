import { test, expect } from '@playwright/test';
import { canonical, validateWorld } from '../../packages/contracts/src/index';
import { LOAD_CATALOG } from '../../packages/catalogs/src/index';
import { decode } from '../../apps/web/src/adapters/persistence';
import { largeCodecWorld } from '../fixtures/large-codec';
import type { CodecResult } from '../../apps/web/src/runtime/protocol';
test('large portable codec writes, loads and exports under production CSP', async ({
  page,
  request,
}) => {
  test.skip(!process.env.PREVIEW_BUILD, 'Production worker/CSP gate');
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('codec-'))
          (window as typeof window & { codecTestURL?: string }).codecTestURL = String(url);
      }
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const html = await request.get('/');
  const csp = html.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-eval');
  const world = validateWorld(largeCodecWorld(), LOAD_CATALOG);
  const result = await page.evaluate(
    (world) =>
      new Promise<CodecResult>((resolve, reject) => {
        const url = (window as typeof window & { codecTestURL?: string }).codecTestURL;
        if (!url) return reject(new Error('Production codec worker was not observed'));
        const worker = new Worker(url, { type: 'module' }),
          channel = new MessageChannel();
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error('Codec fixture timed out'));
        }, 180000);
        worker.onerror = (event) => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.message));
        };
        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          channel.port1.close();
          resolve(event.data);
        };
        worker.postMessage({ type: 'port', port: channel.port2 }, [channel.port2]);
        channel.port1.postMessage({
          id: 'synthetic-large-codec',
          world,
          generation: 2,
          parentGeneration: 1,
        });
      }),
    world,
  );
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.envelope.codec).toBe('brotli-bmp127');
  expect(canonical((await decode(result.raw)).world)).toBe(canonical(world));
  await page.evaluate(({ raw, envelope }) => {
    localStorage.setItem('haeram-soccor:slot:a', raw);
    localStorage.setItem(
      'haeram-soccor:manifest',
      JSON.stringify({
        slot: 0,
        worldId: envelope.worldId,
        generation: envelope.generation,
        parentGeneration: envelope.parentGeneration,
      }),
    );
  }, result);
  await page.goto('/journal');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await downloaded;
  const { readFileSync } = await import('node:fs');
  expect(canonical((await decode(readFileSync((await download.path())!, 'utf8'))).world)).toBe(
    canonical(world),
  );
  expect(errors).toEqual([]);
});
