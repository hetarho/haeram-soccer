import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { isSource, sourceFiles } from '../../../../scripts/lib/source-graph';

/**
 * The detailed engine's folder holds only what plays a touch-by-touch match (→ARCH-3, ARCH-33,
 * T842): everything else reads the shared match leaves in `match/`, so `grid/` can be deleted
 * without touching the game. `match.ts`' earlier-model dispatch is the one production reader.
 */
const GRID = 'packages/engine/src/grid/';
const DISPATCH = 'packages/engine/src/match.ts';
const SCOPES = ['packages', 'apps/web/src', 'scripts', 'tests'];

/** Every module a file names: static imports and exports, type-only ones too, and literal `import()`. */
function specifiers(text: string, file: string): string[] {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      out.push(node.moduleSpecifier.text);
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      out.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return out;
}

/** Whether a relative module named from `file` lies in the grid's folder. */
const inGrid = (root: string, file: string, name: string) =>
  name.startsWith('.') && `${relative(root, resolve(dirname(file), name))}/`.startsWith(GRID);

/** Source files outside `grid/` that import from it, as repository paths. */
function gridImporters(root: string): string[] {
  return sourceFiles(root, SCOPES)
    .filter((file) => isSource(file) && !file.endsWith('.json'))
    .map((file) => relative(root, file))
    .filter((path) => !path.startsWith(GRID) && !path.includes('node_modules/'))
    .filter((path) =>
      specifiers(readFileSync(resolve(root, path), 'utf8'), path).some((name) =>
        inGrid(root, resolve(root, path), name),
      ),
    )
    .sort();
}

it('reads a module in grid/ from a relative name and from nothing else', () => {
  const root = process.cwd();
  const at = (path: string) => resolve(root, path);
  expect(inGrid(root, at('packages/engine/src/match.ts'), './grid/engine')).toBe(true);
  expect(inGrid(root, at('packages/engine/src/aggregate/a.ts'), '../grid/pitch')).toBe(true);
  expect(inGrid(root, at('packages/engine/src/aggregate/a.ts'), '../match/pitch')).toBe(false);
  expect(inGrid(root, at('scripts/a.ts'), '../packages/engine/src/grid')).toBe(true);
  expect(inGrid(root, at('scripts/a.ts'), '../packages/engine/src/grid-throughput')).toBe(false);
  expect(
    specifiers(
      "import type { A } from './a';\nexport { B } from '../b';\nconst c = import('./c');",
      'x.ts',
    ),
  ).toEqual(['./a', '../b', './c']);
});

it('nothing outside grid/ but match.ts imports from it', () => {
  const root = process.cwd();
  const importers = gridImporters(root);
  // The scripts that ran, tuned or compared the grid left in T844; T845 removes the dispatch.
  expect(importers).toEqual([DISPATCH]);
});
