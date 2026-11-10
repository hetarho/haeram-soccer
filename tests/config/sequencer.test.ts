import { describe, expect, it } from 'vitest';
import { BaseSequencer, type TestSpecification, type Vitest } from 'vitest/node';
import { LongestFirstSequencer } from './sequencer';

const ROOT = '/repo';

/** A run whose cache recorded `durations` (ms) and file `sizes` (bytes), keyed `project:file`. */
function context(durations: Record<string, number>, sizes: Record<string, number> = {}) {
  return {
    config: { root: ROOT },
    cache: {
      getFileTestResults: (key: string) =>
        key in durations ? { duration: durations[key], failed: false } : undefined,
      getFileStats: (key: string) => (key in sizes ? { size: sizes[key] } : undefined),
    },
  } as unknown as Vitest;
}

function spec(key: string) {
  const [project, file] = key.split(':');
  return {
    project: { name: project, config: { sequence: { groupOrder: 0 }, isolate: true } },
    moduleId: `${ROOT}/${file}`,
  } as unknown as TestSpecification;
}

async function order(
  keys: string[],
  durations: Record<string, number>,
  coldCosts: Record<string, number>,
  sizes: Record<string, number> = {},
) {
  const sorted = await new LongestFirstSequencer(context(durations, sizes), coldCosts).sort(
    keys.map(spec),
  );
  return sorted.map((file) => `${file.project.name}:${file.moduleId.slice(ROOT.length + 1)}`);
}

describe('longest-first sequencer', () => {
  it('ranks a recorded duration above a larger file without one', async () => {
    const sizes = { 'unit:big.test.ts': 90000, 'unit:small.test.ts': 10 };
    const keys = ['unit:big.test.ts', 'unit:small.test.ts'];
    expect(
      (await new BaseSequencer(context({}, sizes)).sort(keys.map(spec))).map((s) => s.moduleId),
    ).toEqual([`${ROOT}/big.test.ts`, `${ROOT}/small.test.ts`]);
    expect(await order(keys, { 'unit:small.test.ts': 5000 }, {}, sizes)).toEqual([
      'unit:small.test.ts',
      'unit:big.test.ts',
    ]);
  });

  it('ranks a cold cost without history by the larger of both, across projects', async () => {
    expect(
      await order(
        [
          'contract:c.contract.test.ts',
          'unit:u.test.ts',
          'integration:a.test.ts',
          'integration:b.test.ts',
        ],
        { 'integration:b.test.ts': 10000, 'unit:u.test.ts': 5000 },
        { 'a.test.ts': 30, 'u.test.ts': 40, 'gone.test.ts': 999 },
        { 'contract:c.contract.test.ts': 90000 },
      ),
    ).toEqual([
      'unit:u.test.ts',
      'integration:a.test.ts',
      'integration:b.test.ts',
      'contract:c.contract.test.ts',
    ]);
  });

  it("keeps vitest's order on ties and for files with neither", async () => {
    const durations = { 'unit:x.test.ts': 7000, 'unit:y.test.ts': 7000 };
    const sizes = { 'unit:p.test.ts': 50, 'unit:q.test.ts': 500, 'contract:r.contract.test.ts': 1 };
    const unknown = ['unit:p.test.ts', 'contract:r.contract.test.ts', 'unit:q.test.ts'];
    const base = (await new BaseSequencer(context({}, sizes)).sort(unknown.map(spec))).map(
      (file) => `${file.project.name}:${file.moduleId.slice(ROOT.length + 1)}`,
    );
    expect(
      await order(['unit:x.test.ts', 'unit:y.test.ts', ...unknown], durations, {}, sizes),
    ).toEqual(['unit:x.test.ts', 'unit:y.test.ts', ...base]);
    expect(
      await order(['unit:y.test.ts', 'unit:x.test.ts', ...unknown], durations, {}, sizes),
    ).toEqual(['unit:y.test.ts', 'unit:x.test.ts', ...base]);
    expect(base).toEqual(['contract:r.contract.test.ts', 'unit:q.test.ts', 'unit:p.test.ts']);
  });

  it("shards with vitest's own split, so every shard keeps its files", () => {
    expect(LongestFirstSequencer.prototype.shard).toBe(BaseSequencer.prototype.shard);
  });
});
