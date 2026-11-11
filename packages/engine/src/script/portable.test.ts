import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { CELL_CENTIMETRES } from './cells';

describe('portable script arithmetic', () => {
  it('uses no host transcendental functions or unseeded randomness anywhere under script', () => {
    const banned = new Set([
      'hypot',
      'pow',
      'exp',
      'expm1',
      'cbrt',
      'log',
      'log1p',
      'log2',
      'log10',
      'sin',
      'cos',
      'tan',
      'asin',
      'acos',
      'atan',
      'atan2',
      'sinh',
      'cosh',
      'tanh',
      'asinh',
      'acosh',
      'atanh',
      'random',
    ]);
    const root = new URL('.', import.meta.url),
      problems: string[] = [];
    const files = (dir: URL): URL[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        return entry.isDirectory() ? files(url) : [url];
      });
    for (const url of files(root)) {
      const name = url.pathname;
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      const source = ts.createSourceFile(
        name,
        readFileSync(url, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isPropertyAccessExpression(node) &&
          node.expression.getText(source) === 'Math' &&
          banned.has(node.name.text)
        )
          problems.push(`${name}:${node.name.text}`);
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken
        )
          problems.push(`${name}:exponent`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(problems).toEqual([]);
  });
  it('distances between cells come from one integer table', () => {
    expect(CELL_CENTIMETRES).toHaveLength(40);
    expect(CELL_CENTIMETRES[2]![7]).toBe(825);
    for (let a = 0; a < 40; a++)
      for (let b = 0; b < 40; b++) {
        expect(Number.isSafeInteger(CELL_CENTIMETRES[a]![b])).toBe(true);
        expect(CELL_CENTIMETRES[a]![b]).toBe(CELL_CENTIMETRES[b]![a]);
        if (a === b) expect(CELL_CENTIMETRES[a]![b]).toBe(0);
      }
    const cells = readFileSync(join(process.cwd(), 'packages/engine/src/script/cells.ts'), 'utf8');
    expect(cells).toContain('CELL_CENTIMETRES[a]![b]');
  });
});
