import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyOverrides,
  MATCH_TUNABLES,
  LOAD_TIME_LEAVES,
  probeReads,
  restoreDefaults,
  tunableDefault,
  tunableLeaves,
  withDefaultStaging,
} from './tunables';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const sources = ['aggregate', 'script', 'staging'].flatMap((dir) =>
  readdirSync(`${ROOT}/${dir}`)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test'))
    .map((f) => ({ f, text: readFileSync(`${ROOT}/${dir}/${f}`, 'utf8') })),
);

afterEach(() => restoreDefaults());

describe('match tunables', () => {
  it('every configuration export from the three families is listed', () => {
    const exported = sources
      .filter(({ f }) => f === 'config.ts')
      .flatMap(({ text }) => [...text.matchAll(/export const (\w+_CONFIG)\b/g)].map((m) => m[1]!));
    expect(Object.keys(MATCH_TUNABLES).sort()).toEqual([...new Set(exported)].sort());
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
    const path = 'AGGREGATE_CONFIG.shots.scale';
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
    });
    expect(outcome.applied).toEqual([]);
    expect(outcome.rejected.map((r) => r.reason)).toEqual(['unknown', 'not-a-number']);
    expect(tunableLeaves().every((l) => l.value === tunableDefault(l.path))).toBe(true);
  });

  it('probe records reads and restores data properties', () => {
    const [a, b] = tunableLeaves();
    const reads = probeReads(() => void valueAt(a!.path));
    expect(reads).toEqual(new Set([a!.path]));
    expect(reads.has(b!.path)).toBe(false);
    const [name, ...rest] = a!.path.split('.');
    let holder = MATCH_TUNABLES[name!] as Record<string, unknown>;
    for (const key of rest.slice(0, -1)) holder = holder[key] as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(holder, rest.at(-1)!)!;
    expect(descriptor.writable).toBe(true);
    expect(descriptor.get).toBeUndefined();
    expect(descriptor.value).toBe(a!.value);
  });

  it('does not mistake staging-override bookkeeping for actual consumption', () => {
    const reads = probeReads(() =>
      withDefaultStaging(() => void valueAt('AGGREGATE_CONFIG.shots.scale')),
    );
    expect(reads).toEqual(new Set(['AGGREGATE_CONFIG.shots.scale']));
  });
});

function valueAt(path: string): unknown {
  const [name, ...rest] = path.split('.');
  let at: unknown = MATCH_TUNABLES[name!];
  for (const key of rest) at = (at as Record<string, unknown> | undefined)?.[key];
  return at;
}
