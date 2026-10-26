import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedJson, cachedJsonAsync } from './json-cache';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function options() {
  const directory = mkdtempSync(join(tmpdir(), 'haeram-json-cache-'));
  roots.push(directory);
  return { directory, dependencies: ['tests/fixtures/json-cache.ts'] };
}
it('returns independent JSON copies and keys closure inputs explicitly', () => {
  const config = options();
  let builds = 0;
  const build = () => ({ n: ++builds, values: [1] });
  const a = cachedJson('copies', build, { ...config, input: 1 });
  a.values.push(2);
  expect(cachedJson('copies', build, { ...config, input: 1 })).toEqual({ n: 1, values: [1] });
  expect(cachedJson('copies', build, { ...config, input: 2 }).n).toBe(2);
  expect(builds).toBe(2);
});
it('deduplicates asynchronous builders and allows a failed build to retry', async () => {
  const config = options();
  let builds = 0;
  const build = async () => {
    builds++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { values: [1] };
  };
  const [a, b] = await Promise.all([
    cachedJsonAsync('async', build, config),
    cachedJsonAsync('async', build, config),
  ]);
  expect(builds).toBe(1);
  expect(a).toEqual(b);
  expect(a).not.toBe(b);
  let fail = true;
  const retry = async () => {
    if (fail) {
      fail = false;
      throw new Error('builder failed');
    }
    return { ready: true };
  };
  await expect(cachedJsonAsync('retry', retry, config)).rejects.toThrow('builder failed');
  await expect(cachedJsonAsync('retry', retry, config)).resolves.toEqual({ ready: true });
});
it('repairs malformed persisted JSON rather than reusing corrupted setup', async () => {
  const config = options();
  const build = () => ({ valid: true });
  cachedJson('corruption', build, config);
  const folder = readdirSync(config.directory)[0]!;
  const file = readdirSync(join(config.directory, folder)).find((name) => name.endsWith('.json'))!;
  writeFileSync(join(config.directory, folder, file), '{invalid');
  vi.resetModules();
  const { cachedJson: fromDisk } = await import('./json-cache');
  expect(fromDisk('corruption', build, config)).toEqual({ valid: true });
});
