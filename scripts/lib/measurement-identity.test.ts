import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measurementIdentity } from './measurement-identity';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
it('invalidates runner, codec, engine, catalog and settings, preserving unrelated edits', () => {
  const root = mkdtempSync(join(tmpdir(), 'measurement-identity-'));
  roots.push(root);
  const put = (file: string, text: string) => writeFileSync(join(root, file), text);
  put('runner.ts', "import './codec'; import './engine';");
  put('codec.ts', 'export const codec = 1;');
  put('engine.ts', 'export const engine = 1;');
  put('catalog.json', '{}');
  put('settings.json', '{}');
  const key = () =>
    measurementIdentity('runner.ts', root, { inputs: ['catalog.json', 'settings.json'] }).sha256;
  const first = key();
  for (const file of ['view.tsx', 'asset.svg', 'engine.test.ts']) put(file, 'unrelated');
  expect(key()).toBe(first);
  for (const file of ['codec.ts', 'engine.ts', 'catalog.json', 'settings.json', 'runner.ts']) {
    const before = key();
    put(file, file.endsWith('.json') ? '{"changed":true}' : 'export const changed = 2;');
    expect(key(), file).not.toBe(before);
  }
});
it('keeps detailed references across aggregate edits and includes reference runner edits', () => {
  const root = mkdtempSync(join(tmpdir(), 'reference-identity-'));
  roots.push(root);
  mkdirSync(join(root, 'packages/engine/src/aggregate'), { recursive: true });
  const aggregate = join(root, 'packages/engine/src/aggregate/config.ts');
  const runner = join(root, 'runner.ts');
  const body = "import './packages/engine/src/aggregate/config'; export const reference = 1;";
  writeFileSync(runner, body);
  writeFileSync(aggregate, 'export const config = 1;');
  const key = (referenceOnly: boolean) =>
    measurementIdentity('runner.ts', root, { inputs: [], referenceOnly }).sha256;
  const reference = key(true),
    full = key(false);
  writeFileSync(aggregate, 'export const config = 2;');
  expect(key(true)).toBe(reference);
  expect(key(false)).not.toBe(full);
  writeFileSync(runner, body + '\n// changed reference procedure');
  expect(key(true)).not.toBe(reference);
});
