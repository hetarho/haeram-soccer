import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { generateLabSide } from '../lab/sides';
import { createLabWorld, playLabMatch } from '../lab/match';
import { SHOT_CONFIG } from './resolve';
import {
  applyOverrides,
  GRID_TUNABLES,
  LOAD_TIME_LEAVES,
  probeReads,
  restoreDefaults,
  tunableDefault,
  tunableLeaves,
} from './tunables';

const GRID = fileURLToPath(new URL('.', import.meta.url));
const sources = readdirSync(GRID)
  .filter((f) => f.endsWith('.ts') && !f.includes('.test') && !f.includes('.testkit'))
  .map((f) => ({ f, text: readFileSync(GRID + f, 'utf8') }));

afterEach(() => restoreDefaults());

describe('grid tunables', () => {
  it('every grid config is listed', () => {
    const exported = sources.flatMap(({ text }) =>
      [...text.matchAll(/export const (\w+_CONFIG)\b/g)].map((m) => m[1]!),
    );
    expect(Object.keys(GRID_TUNABLES).sort()).toEqual([...new Set(exported)].sort());
    const leaves = tunableLeaves();
    expect(new Set(leaves.map((l) => l.path)).size).toBe(leaves.length);
    expect(leaves.length).toBeGreaterThan(100);
    expect(leaves.every((l) => Number.isFinite(l.value))).toBe(true);
  });

  it('lists every leaf copied into a module constant at load', () => {
    // Top-level initializers (outside functions) reading a config leaf copy it once at import.
    const found = new Set<string>();
    for (const { f, text } of sources) {
      const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
      const visit = (n: ts.Node, inFn: boolean): void => {
        const fn = inFn || ts.isFunctionLike(n);
        if (!fn && ts.isPropertyAccessExpression(n) && !ts.isPropertyAccessExpression(n.parent)) {
          const path = n.getText().replace(/\s/g, '');
          if (/^[A-Z_]+_CONFIG\./.test(path) && typeof valueAt(path) === 'number') found.add(path);
        }
        ts.forEachChild(n, (c) => visit(c, fn));
      };
      for (const st of sf.statements)
        if (ts.isVariableStatement(st))
          st.declarationList.declarations.forEach(
            (d) => d.initializer && visit(d.initializer, false),
          );
    }
    expect([...found].sort()).toEqual([...LOAD_TIME_LEAVES].sort());
  });

  it('apply/restore round trip', () => {
    const path =
      'SHOT_CONFIG.' +
      Object.keys(SHOT_CONFIG).find((k) => typeof (SHOT_CONFIG as never)[k] === 'number');
    const base = tunableDefault(path)!;
    const outcome = applyOverrides({ [path]: base + 1 });
    expect(outcome).toEqual({ applied: [path], rejected: [] });
    expect(valueAt(path)).toBe(base + 1);
    // A new set of overrides starts from the defaults again.
    applyOverrides({});
    expect(valueAt(path)).toBe(base);
    applyOverrides({ [path]: base + 2 });
    restoreDefaults();
    expect(tunableLeaves().every((l) => l.value === tunableDefault(l.path))).toBe(true);
  });

  it('rejects unknown paths', () => {
    const [first] = tunableLeaves();
    const outcome = applyOverrides({
      'NOPE_CONFIG.x': 1,
      [first!.path]: Number.NaN,
      [LOAD_TIME_LEAVES[0]!]: 3,
    });
    expect(outcome.applied).toEqual([]);
    expect(outcome.rejected.map((r) => r.reason)).toEqual(['unknown', 'not-a-number', 'load-time']);
    expect(tunableLeaves().every((l) => l.value === tunableDefault(l.path))).toBe(true);
  });

  it('probe records reads and restores data properties', () => {
    const [a, b] = tunableLeaves();
    const reads = probeReads(() => void valueAt(a!.path));
    expect(reads).toEqual(new Set([a!.path]));
    expect(reads.has(b!.path)).toBe(false);
    const [name, ...rest] = a!.path.split('.');
    let holder = GRID_TUNABLES[name!] as Record<string, unknown>;
    for (const key of rest.slice(0, -1)) holder = holder[key] as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(holder, rest.at(-1)!)!;
    expect(descriptor.writable).toBe(true);
    expect(descriptor.get).toBeUndefined();
    expect(descriptor.value).toBe(a!.value);
  });

  it('override changes play, restore reproduces it', { timeout: 120_000 }, () => {
    const lab = createLabWorld();
    const sides = [
      generateLabSide({ side: 0, seed: 'tune', tactic: 'balanced', average: 72, spread: 4 }),
      generateLabSide({ side: 1, seed: 'tune', tactic: 'counter', average: 72, spread: 4 }),
    ] as const;
    const digest = () => {
      const r = playLabMatch(lab, sides, 'tune', 0).record;
      return JSON.stringify([r.score, r.metrics]);
    };
    const before = digest();
    let reads = new Set<string>();
    const probed = ((reads = probeReads(() => void digest())), digest());
    expect(probed).toBe(before);
    expect(reads.size).toBeGreaterThan(20);
    // Shots never taken: the most direct lever on what a match records.
    const lever = [...reads].find(
      (p) => p.startsWith('DECISION_CONFIG.') || p.startsWith('SHOT_CONFIG.'),
    )!;
    applyOverrides({ [lever]: tunableDefault(lever)! * 3 + 1 });
    expect(digest()).not.toBe(before);
    restoreDefaults();
    expect(digest()).toBe(before);
  });
});

function valueAt(path: string): unknown {
  const [name, ...rest] = path.split('.');
  let at: unknown = GRID_TUNABLES[name!];
  for (const key of rest) at = (at as Record<string, unknown> | undefined)?.[key];
  return at;
}
