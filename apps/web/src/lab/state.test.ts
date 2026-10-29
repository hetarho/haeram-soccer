import { describe, expect, it } from 'vitest';
import { LAB_CONFIG } from '../../../../packages/engine/src/lab/sides';
import type { RunSummary } from './summary';
import {
  compare,
  defaultLabState,
  dropRun,
  exportOverrides,
  importOverrides,
  KEPT_RUNS,
  keepRun,
  LAB_RANGES,
  LAB_STORAGE_KEY,
  loadLabState,
  saveLabState,
  setOverride,
  type KeptRun,
  type LabStorage,
} from './state';

const memory = (): LabStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};
const throwing: LabStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

let n = 0;
const seed = () => `s${n++}`;
const side = { seed: 'a', tactic: 'press' as const, average: 70, spread: 4, ovrs: [70, 71] };
const run = (id: string): KeptRun => ({
  id,
  at: 1,
  count: 20,
  runSeed: 'r',
  sides: [side, { ...side, tactic: 'counter' }],
  overrides: { 'SHOT_CONFIG.saveShare': 0.5 },
  summary: { matches: 20 } as RunSummary,
});
const leaves = [
  { path: 'SHOT_CONFIG.saveShare', value: 0.3, loadTime: false },
  { path: 'GRID_MOVEMENT_CONFIG.turn', value: 2, loadTime: true },
];

describe('lab state', () => {
  it('uses the engine ranges', () => {
    expect(LAB_RANGES.average).toEqual(LAB_CONFIG.averageRange);
    expect(LAB_RANGES.spread).toEqual(LAB_CONFIG.spreadRange);
    expect(LAB_RANGES.ovr).toEqual(LAB_CONFIG.ovrRange);
  });

  it('persist round trip', () => {
    const store = memory();
    const state = keepRun(
      {
        ...defaultLabState(seed),
        sides: [
          { ...side, edited: true },
          { ...side, seed: 'b' },
        ],
        overrides: { 'SHOT_CONFIG.saveShare': 0.4 },
        run: { count: 300, runSeed: 'x' },
      },
      run('one'),
    );
    const pinned = { ...state, baseline: 'one' };
    expect(saveLabState(pinned, store)).toBe(true);
    expect([...store.data.keys()]).toEqual([LAB_STORAGE_KEY]);
    expect(loadLabState(store)).toEqual(pinned);
    // Unreadable, foreign-version or denied storage gives the defaults; the page keeps working.
    store.data.set(LAB_STORAGE_KEY, '{');
    expect(loadLabState(store).kept).toEqual([]);
    store.data.set(LAB_STORAGE_KEY, JSON.stringify({ version: 99, kept: [run('x')] }));
    expect(loadLabState(store).kept).toEqual([]);
    expect(loadLabState(throwing).run.count).toBe(100);
    expect(saveLabState(pinned, throwing)).toBe(false);
    expect(saveLabState(pinned, undefined)).toBe(false);
  });

  it('watch seed persists', () => {
    const store = memory();
    const state = { ...defaultLabState(seed), watch: { seed: 'match-7' } };
    expect(saveLabState(state, store)).toBe(true);
    expect(loadLabState(store).watch).toEqual({ seed: 'match-7' });
    // A state stored before 관전 existed, or with an empty seed, draws a fresh one.
    const older = JSON.parse(store.data.get(LAB_STORAGE_KEY)!) as Record<string, unknown>;
    delete older.watch;
    store.data.set(LAB_STORAGE_KEY, JSON.stringify(older));
    const loaded = loadLabState(store);
    expect(loaded.watch.seed).toMatch(/\S/);
    expect(loaded.run).toEqual(state.run);
    store.data.set(LAB_STORAGE_KEY, JSON.stringify({ ...older, watch: { seed: '' } }));
    expect(loadLabState(store).watch.seed).not.toBe('');
  });

  it('kept runs cap at 10', () => {
    let state = defaultLabState(seed);
    for (let i = 0; i < KEPT_RUNS + 2; i++) state = keepRun(state, run(`r${i}`));
    expect(state.kept.map((k) => k.id)).toEqual(
      Array.from({ length: KEPT_RUNS }, (_, i) => `r${KEPT_RUNS + 1 - i}`),
    );
    // A pinned run that drops out takes the baseline with it.
    state = { ...state, baseline: 'r2' };
    state = keepRun(state, run('r12'));
    expect(state.baseline).toBeUndefined();
    state = dropRun({ ...state, baseline: 'r12' }, 'r12');
    expect(state.kept).toHaveLength(KEPT_RUNS - 1);
    expect(state.baseline).toBeUndefined();
  });

  it('import skips unknown paths', () => {
    const result = importOverrides(
      JSON.stringify({
        'SHOT_CONFIG.saveShare': 0.45,
        'NOPE.x': 1,
        'GRID_MOVEMENT_CONFIG.turn': 3,
      }),
      leaves,
    );
    expect(result).toEqual({
      ok: true,
      overrides: { 'SHOT_CONFIG.saveShare': 0.45 },
      skipped: [
        { path: 'NOPE.x', reason: 'unknown' },
        { path: 'GRID_MOVEMENT_CONFIG.turn', reason: 'load-time' },
      ],
    });
    const text = importOverrides('{"SHOT_CONFIG.saveShare":"0.4"}', leaves);
    expect(text.ok && text.skipped).toEqual([
      { path: 'SHOT_CONFIG.saveShare', reason: 'not-a-number' },
    ]);
    expect(importOverrides('[1]', leaves).ok).toBe(false);
    expect(importOverrides('nope', leaves).ok).toBe(false);
    // Exported values import back unchanged; a default value is no override.
    const overrides = setOverride({}, leaves[0]!, 0.6);
    expect(setOverride(overrides, leaves[0]!, 0.3)).toEqual({});
    const back = importOverrides(exportOverrides(overrides), leaves);
    expect(back.ok && back.overrides).toEqual(overrides);
  });

  it('difference marking', () => {
    const e = (value: number, lo: number, hi: number) => ({
      value,
      interval: [lo, hi] as [number, number],
    });
    expect(compare(e(3, 2.8, 3.2), e(2.5, 2.3, 2.7))).toEqual({
      baseline: 2.5,
      difference: 0.5,
      marked: true,
    });
    expect(compare(e(3, 2.6, 3.4), e(2.5, 2.3, 2.7))?.marked).toBe(false);
    // A JSON round trip turns a missing interval end into null: never marked.
    const stored = JSON.parse(JSON.stringify(e(1, Number.NaN, Number.NaN)));
    expect(compare(e(3, 3, 3), stored)?.marked).toBe(false);
    expect(compare(undefined, e(1, 1, 1))).toBeUndefined();
  });
});
