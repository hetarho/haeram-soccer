import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CELL_CM, cellGap } from './cells';

// The script is outcome-critical (→ARCH-9, MATCH-38): its writer uses only integers, the engine's
// seeded generator and double arithmetic that rounds the same on every platform (+ − × ÷ and
// square root), so no file under script/ calls a transcendental or host-dependent function.
const here = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN =
  /Math\.(hypot|pow|exp|expm1|log|log1p|log2|log10|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|cbrt|random)\b|\*\*/;

describe('script portability (T826)', () => {
  it('no file under script/ calls a host-dependent math function', () => {
    const files = readdirSync(here).filter((name) => /\.ts$/.test(name));
    expect(files).toContain('write.ts');
    const found: string[] = [];
    for (const name of files) {
      const lines = readFileSync(join(here, name), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line
          .replace(/\/\/.*$/, '')
          .replace(/\/\*.*$/, '')
          .replace(/^\s*\*.*$/, '');
        if (FORBIDDEN.test(code) && !code.includes('FORBIDDEN')) found.push(`${name}:${i + 1}`);
      });
    }
    expect(found).toEqual([]);
  });

  it('distances between cells come from one integer table', () => {
    expect(CELL_CM).toHaveLength(40);
    for (let a = 0; a < 40; a++) {
      expect(CELL_CM[a]).toHaveLength(40);
      expect(CELL_CM[a]![a]).toBe(0);
      for (let b = 0; b < 40; b++) {
        expect(Number.isInteger(CELL_CM[a]![b])).toBe(true);
        expect(CELL_CM[a]![b]).toBe(CELL_CM[b]![a]);
        expect(cellGap(a, b)).toBe(CELL_CM[a]![b]);
      }
    }
    // Neighbouring centres in the central lane's own-half bands: 17.5 m apart.
    expect(cellGap(17, 22)).toBe(1750);
    // No other file builds a cell distance of its own.
    const others = readdirSync(here).filter(
      (name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== 'cells.ts',
    );
    for (const name of others)
      expect(readFileSync(join(here, name), 'utf8'), name).not.toMatch(/CELL_CM\s*=|cellDistance/);
  });
});
