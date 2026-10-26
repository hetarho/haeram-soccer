import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computationFingerprint, dependencies, runtimeImports, sourceGraph } from './source-graph';

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
