import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import {
  computationFingerprint,
  dependencies,
  importMemo,
  runtimeImports,
  saveImportMemo,
  sourceGraph,
  typescriptVersion,
} from './source-graph';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'haeram-dependencies-'));
  roots.push(root);
  writeFileSync(join(root, 'main.ts'), "import { value } from './helper'; export { value };\n");
  writeFileSync(join(root, 'helper.ts'), 'export const value = 1;\n');
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data/catalog.json'), '{"value":1}');
  return root;
}
it('follows runtime imports, re-exports and literal dynamic imports, excluding type-only edges', () => {
  expect(
    runtimeImports(`
    import type { A } from './types';
    import { type B } from './also-types';
    export { type C } from './more-types';
    import { value, type D } from './value';
    export * from './exported';
    const later = () => import('./dynamic');
    const common = require('./common');
  `),
  ).toEqual(['./value', './exported', './dynamic', './common']);
});
it('invalidates actual helpers and data, while ignoring unrelated UI/assets/tests', () => {
  const root = fixture();
  const key = () => computationFingerprint(sourceGraph(root), ['main.ts'], ['data']).sha256;
  const first = key();
  writeFileSync(join(root, 'unrelated.tsx'), 'export const View = () => null;');
  writeFileSync(join(root, 'unrelated.test.ts'), 'throw new Error();');
  writeFileSync(join(root, 'image.png'), 'changed art');
  expect(key()).toBe(first);
  writeFileSync(join(root, 'helper.ts'), 'export const value = 2;');
  const changedHelper = key();
  expect(changedHelper).not.toBe(first);
  writeFileSync(join(root, 'data/catalog.json'), '{"value":2}');
  expect(key()).not.toBe(changedHelper);
});
it('includes newly added dynamic dependencies and rejects missing local imports', () => {
  const root = fixture();
  writeFileSync(join(root, 'helper.ts'), "export const later = () => import('./later');");
  expect(() => dependencies(sourceGraph(root), ['main.ts'])).toThrow(
    'Unresolved local runtime import',
  );
  writeFileSync(join(root, 'later.ts'), 'export const later = 3;');
  expect(dependencies(sourceGraph(root), ['main.ts'])).toContain(join(root, 'later.ts'));
});
it('reads the compiler version for keys without loading the compiler', () => {
  expect(typescriptVersion).toBe(ts.version);
});
it('keeps every key identical with an unmemoised, cold or warm import memo', () => {
  const root = fixture();
  const file = join(root, '.cache/runtime-imports-v1.json');
  const key = (graph = sourceGraph(root)) =>
    computationFingerprint(graph, ['main.ts'], ['data']).sha256;
  const plain = key();
  const cold = importMemo(file);
  expect(key(sourceGraph(root, cold))).toBe(plain);
  expect(cold.misses).toBe(2);
  expect(saveImportMemo(cold)).toBe(true);
  expect(saveImportMemo(cold)).toBe(false);
  const warm = importMemo(file);
  expect(warm.entries.size).toBe(2);
  expect(key(sourceGraph(root, warm))).toBe(plain);
  expect(warm.misses).toBe(0);
  expect(saveImportMemo(warm)).toBe(false);
  writeFileSync(join(root, 'later.ts'), 'export const later = 3;');
  writeFileSync(join(root, 'helper.ts'), "export const later = () => import('./later');");
  const edited = importMemo(file);
  const graph = sourceGraph(root, edited);
  expect(key(graph)).not.toBe(plain);
  expect(dependencies(graph, ['main.ts'])).toContain(join(root, 'later.ts'));
  expect(edited.misses).toBe(2);
  expect(key(graph)).toBe(key());
});
it('parses again when the memo is corrupt or from another compiler, and caps its size', () => {
  const root = fixture();
  const file = join(root, 'runtime-imports-v1.json');
  const plain = dependencies(sourceGraph(root), ['main.ts']);
  const first = importMemo(file);
  dependencies(sourceGraph(root, first), ['main.ts']);
  saveImportMemo(first);
  const stored = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, string[]> };
  for (const key of Object.keys(stored.entries)) stored.entries[key] = [];
  writeFileSync(file, JSON.stringify({ ...stored, typescript: '0.0.0' }));
  const otherCompiler = importMemo(file);
  expect(otherCompiler.entries.size).toBe(0);
  expect(dependencies(sourceGraph(root, otherCompiler), ['main.ts'])).toEqual(plain);
  writeFileSync(file, '{"format":');
  const corrupt = importMemo(file);
  expect(corrupt.entries.size).toBe(0);
  expect(dependencies(sourceGraph(root, corrupt), ['main.ts'])).toEqual(plain);
  expect(corrupt.misses).toBe(2);
  writeFileSync(join(root, 'other.ts'), 'export const other = 1;');
  dependencies(sourceGraph(root, corrupt), ['other.ts']);
  saveImportMemo(corrupt);
  const capped = importMemo(file);
  dependencies(sourceGraph(root, capped), ['other.ts']);
  writeFileSync(join(root, 'other.ts'), 'export const other = 2;');
  dependencies(sourceGraph(root, capped), ['other.ts']);
  expect(capped.entries.size).toBe(4);
  saveImportMemo(capped, 3);
  expect(importMemo(file).entries.size).toBe(2);
});
