import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runtimeImports } from '../../../../scripts/lib/source-graph';

// The staging is a leaf (→ARCH-4, ARCH-33): it takes plain inputs and imports no world generation,
// season or match orchestration, so the UI and the stager's worker can read it without them.
const here = dirname(fileURLToPath(import.meta.url));
const engine = resolve(here, '..');
const contracts = resolve(engine, '../../contracts');
const ALLOWED_FILES = [resolve(engine, 'grid/pitch.ts'), resolve(engine, 'primitives.ts')];

const isTest = (name: string) => /\.(test|testkit)\.[cm]?tsx?$/.test(name);

const resolveLocal = (from: string, name: string): string => {
  const base = resolve(dirname(from), name);
  for (const file of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
    if (existsSync(file) && statSync(file).isFile()) return file;
  throw new Error(`unresolved import ${name} in ${from}`);
};

const inside = (file: string, dir: string) => file === dir || file.startsWith(dir + sep);

describe('staging leaf', () => {
  it('the staging imports no world, season or match orchestration', () => {
    const files = readdirSync(here)
      .filter((name) => /\.[cm]?tsx?$/.test(name) && !isTest(name))
      .map((name) => join(here, name));
    expect(files.map((file) => relative(here, file))).toContain('shape.ts');
    const outside: string[] = [];
    for (const file of files)
      for (const name of runtimeImports(readFileSync(file, 'utf8'), file)) {
        if (!name.startsWith('.')) {
          outside.push(`${relative(engine, file)} → ${name}`);
          continue;
        }
        const target = resolveLocal(file, name);
        if (inside(target, here) || ALLOWED_FILES.includes(target) || inside(target, contracts))
          continue;
        outside.push(`${relative(engine, file)} → ${relative(engine, target)}`);
      }
    expect(outside).toEqual([]);
  });

  // The script writer takes plain inputs too (→ARCH-33, T825): from `grid/` only the pitch, the
  // record's counters and the rules, and no season, world or match orchestration.
  it('the script imports no grid engine, season, world or match orchestration', () => {
    const script = resolve(engine, 'script');
    const grid = resolve(engine, 'grid');
    const allowedGrid = ['pitch.ts', 'record.ts', 'rules.ts'].map((name) => resolve(grid, name));
    const forbidden = ['season.ts', 'world.ts', 'match.ts'].map((name) => resolve(engine, name));
    const files = readdirSync(script)
      .filter((name) => /\.[cm]?tsx?$/.test(name) && !isTest(name))
      .map((name) => join(script, name));
    expect(files.map((file) => relative(script, file)).sort()).toEqual(['build.ts', 'detail.ts']);
    const outside: string[] = [];
    for (const file of files)
      for (const name of runtimeImports(readFileSync(file, 'utf8'), file)) {
        if (!name.startsWith('.')) {
          outside.push(`${relative(engine, file)} → ${name}`);
          continue;
        }
        const target = resolveLocal(file, name);
        if ((inside(target, grid) && !allowedGrid.includes(target)) || forbidden.includes(target))
          outside.push(`${relative(engine, file)} → ${relative(engine, target)}`);
      }
    expect(outside).toEqual([]);
  });
});
