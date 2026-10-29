/**
 * The match lab page's own state (→LAB-6/7): sides, value overrides, run settings and kept runs,
 * kept in this browser under one versioned key. Pure helpers beside it; types only from the engine
 * side, so the page stays free of engine runtime code (ARCH-4).
 */
import type { Tactic } from '../../../../packages/contracts/src/types';
import type { Estimate, RunSummary } from './summary';

export const LAB_STORAGE_KEY = 'haeram.lab.v1';
const VERSION = 1;

/** The page's copy of the engine's `LAB_CONFIG` ranges (sides.ts is not a read leaf). */
export const LAB_RANGES = {
  average: [40, 90] as const,
  spread: [0, 15] as const,
  ovr: [20, 92] as const,
};
export const LAB_TACTICS: readonly Tactic[] = ['balanced', 'possession', 'counter', 'press'];
export const RUN_COUNTS = [1, 20, 100, 300, 600] as const;
export const DEFAULT_RUN_COUNT = 100;
export const KEPT_RUNS = 10;
/** Every formation has eleven slots; the bench follows them. */
export const STARTERS = 11;

export interface SideSettings {
  seed: string;
  tactic: Tactic;
  average: number;
  spread: number;
  /** The side's OVRs once generated (starters in slot order, then the bench). */
  ovrs?: number[];
  /** A player's OVR was set on its own since the last generation. */
  edited?: boolean;
}

export interface KeptRun {
  id: string;
  /** Finish time, epoch ms. */
  at: number;
  count: number;
  runSeed: string;
  sides: [Required<Omit<SideSettings, 'edited'>>, Required<Omit<SideSettings, 'edited'>>];
  overrides: Record<string, number>;
  summary: RunSummary;
}

export interface LabState {
  sides: [SideSettings, SideSettings];
  overrides: Record<string, number>;
  run: { count: number; runSeed: string };
  /** 관전's seed (→LAB-9): 다시 보기 keeps it, 새 경기 draws another. */
  watch: { seed: string };
  kept: KeptRun[];
  baseline?: string;
}

/** A short random seed; the lab's seeds only need to differ, not to be secret. */
export const newSeed = () => Math.random().toString(36).slice(2, 8);

const clampInt = (v: number, [lo, hi]: readonly [number, number]) =>
  Math.min(hi, Math.max(lo, Math.round(v)));

export function defaultLabState(seed: () => string = newSeed): LabState {
  const side = (): SideSettings => ({ seed: seed(), tactic: 'balanced', average: 75, spread: 5 });
  return {
    sides: [side(), side()],
    overrides: {},
    run: { count: DEFAULT_RUN_COUNT, runSeed: seed() },
    watch: { seed: seed() },
    kept: [],
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumbers = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));

function readSide(v: unknown, fallback: SideSettings): SideSettings {
  if (!isRecord(v)) return fallback;
  const tactic = LAB_TACTICS.includes(v.tactic as Tactic) ? (v.tactic as Tactic) : fallback.tactic;
  return {
    seed: typeof v.seed === 'string' && v.seed ? v.seed : fallback.seed,
    tactic,
    average:
      typeof v.average === 'number' ? clampInt(v.average, LAB_RANGES.average) : fallback.average,
    spread: typeof v.spread === 'number' ? clampInt(v.spread, LAB_RANGES.spread) : fallback.spread,
    ...(isNumbers(v.ovrs) && { ovrs: v.ovrs.map((o) => clampInt(o, LAB_RANGES.ovr)) }),
    ...(v.edited === true && { edited: true }),
  };
}

function readOverrides(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  return Object.fromEntries(
    Object.entries(v).filter(
      (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]),
    ),
  );
}

function readKept(v: unknown): KeptRun | undefined {
  if (!isRecord(v) || !Array.isArray(v.sides) || v.sides.length !== 2) return undefined;
  if (typeof v.id !== 'string' || typeof v.at !== 'number' || typeof v.count !== 'number')
    return undefined;
  if (typeof v.runSeed !== 'string' || !isRecord(v.summary)) return undefined;
  const sides = v.sides.map((s) => (isRecord(s) && isNumbers(s.ovrs) ? s : undefined));
  if (!sides[0] || !sides[1]) return undefined;
  return {
    id: v.id,
    at: v.at,
    count: v.count,
    runSeed: v.runSeed,
    sides: sides as KeptRun['sides'],
    overrides: readOverrides(v.overrides),
    summary: v.summary as unknown as RunSummary,
  };
}

/** The stored state, or the defaults where it is missing, unreadable or of another version. */
export function parseLabState(text: string | null, fallback: LabState = defaultLabState()) {
  if (!text) return fallback;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (!isRecord(raw) || raw.version !== VERSION) return fallback;
  const sides = Array.isArray(raw.sides) ? raw.sides : [];
  const run = isRecord(raw.run) ? raw.run : {};
  const watch = isRecord(raw.watch) ? raw.watch : {};
  const kept = Array.isArray(raw.kept)
    ? raw.kept
        .map(readKept)
        .filter((k): k is KeptRun => !!k)
        .slice(0, KEPT_RUNS)
    : [];
  const baseline =
    typeof raw.baseline === 'string' && kept.some((k) => k.id === raw.baseline)
      ? raw.baseline
      : undefined;
  return {
    sides: [readSide(sides[0], fallback.sides[0]), readSide(sides[1], fallback.sides[1])],
    overrides: readOverrides(raw.overrides),
    run: {
      count: RUN_COUNTS.includes(run.count as 1) ? (run.count as number) : fallback.run.count,
      runSeed: typeof run.runSeed === 'string' && run.runSeed ? run.runSeed : fallback.run.runSeed,
    },
    watch: {
      seed: typeof watch.seed === 'string' && watch.seed ? watch.seed : fallback.watch.seed,
    },
    kept,
    ...(baseline && { baseline }),
  } satisfies LabState;
}

export const serializeLabState = (state: LabState) =>
  JSON.stringify({ version: VERSION, ...state });

/** What the page needs of `localStorage`; absent or throwing storage leaves the page working. */
export type LabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): LabStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadLabState(store: LabStorage | undefined = storage()): LabState {
  try {
    return parseLabState(store?.getItem(LAB_STORAGE_KEY) ?? null);
  } catch {
    return defaultLabState();
  }
}

/** Whether the state was written. */
export function saveLabState(state: LabState, store: LabStorage | undefined = storage()) {
  try {
    if (!store) return false;
    store.setItem(LAB_STORAGE_KEY, serializeLabState(state));
    return true;
  } catch {
    return false;
  }
}

export function clearLabState(store: LabStorage | undefined = storage()) {
  try {
    store?.removeItem(LAB_STORAGE_KEY);
  } catch {
    // Nothing kept to clear.
  }
}

/** A finished run first, the oldest beyond `KEPT_RUNS` dropped; the baseline goes with its run. */
export function keepRun(state: LabState, run: KeptRun): LabState {
  const kept = [run, ...state.kept.filter((k) => k.id !== run.id)].slice(0, KEPT_RUNS);
  const baseline = kept.some((k) => k.id === state.baseline) ? state.baseline : undefined;
  return { ...state, kept, baseline };
}

export function dropRun(state: LabState, id: string): LabState {
  return {
    ...state,
    kept: state.kept.filter((k) => k.id !== id),
    baseline: state.baseline === id ? undefined : state.baseline,
  };
}

/** The starters' mean OVR. */
export const starterAverage = (ovrs: readonly number[]) => {
  const starters = ovrs.slice(0, STARTERS);
  return starters.length ? starters.reduce((a, b) => a + b, 0) / starters.length : Number.NaN;
};

/** A catalog leaf as the page reads it from tunables.json. */
export interface TunableLeaf {
  path: string;
  value: number;
  loadTime: boolean;
}

/** The value set at `path`; one equal to its default is no override. */
export function setOverride(
  overrides: Record<string, number>,
  leaf: TunableLeaf,
  value: number,
): Record<string, number> {
  const rest = { ...overrides };
  delete rest[leaf.path];
  return value === leaf.value || !Number.isFinite(value) ? rest : { ...rest, [leaf.path]: value };
}

/** The changed values as JSON, path → value, in path order. */
export const exportOverrides = (overrides: Record<string, number>) =>
  JSON.stringify(
    Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b))),
    null,
    2,
  );

export interface SkippedPath {
  path: string;
  reason: 'unknown' | 'not-a-number' | 'load-time';
}

export type ImportResult =
  | { ok: true; overrides: Record<string, number>; skipped: SkippedPath[] }
  | { ok: false; message: string };

/**
 * Overrides from pasted JSON (path → value): unknown paths, non-numbers and load-time values are
 * reported and skipped; values equal to their default drop out.
 */
export function importOverrides(text: string, leaves: readonly TunableLeaf[]): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSON으로 읽을 수 없습니다' };
  }
  if (!isRecord(raw)) return { ok: false, message: '경로 → 값 객체가 아닙니다' };
  const byPath = new Map(leaves.map((l) => [l.path, l]));
  let overrides: Record<string, number> = {};
  const skipped: SkippedPath[] = [];
  for (const [path, value] of Object.entries(raw)) {
    const leaf = byPath.get(path);
    if (!leaf) skipped.push({ path, reason: 'unknown' });
    else if (typeof value !== 'number' || !Number.isFinite(value))
      skipped.push({ path, reason: 'not-a-number' });
    else if (leaf.loadTime) skipped.push({ path, reason: 'load-time' });
    else overrides = setOverride(overrides, leaf, value);
  }
  return { ok: true, overrides, skipped };
}

export interface Comparison {
  baseline: number;
  difference: number;
  /** The two runs' intervals miss each other: a difference beyond both runs' noise (→LAB-6). */
  marked: boolean;
}

/**
 * The current estimate against the baseline's. Kept runs come back from JSON, where a missing
 * interval end (NaN) reads null, so a non-finite end never marks.
 */
export function compare(current?: Estimate, baseline?: Estimate): Comparison | undefined {
  if (!current || !baseline) return undefined;
  const ok = (e: Estimate) => Number.isFinite(e.value) && e.interval.every(Number.isFinite);
  if (!Number.isFinite(current.value) || !Number.isFinite(baseline.value)) return undefined;
  return {
    baseline: baseline.value,
    difference: current.value - baseline.value,
    marked:
      ok(current) &&
      ok(baseline) &&
      (current.interval[1] < baseline.interval[0] || baseline.interval[1] < current.interval[0]),
  };
}
