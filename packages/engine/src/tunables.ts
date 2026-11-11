/**
 * The match model's numbers as the match lab tunes them (→LAB-3): every exported `*_CONFIG` object,
 * its finite-number leaves by path, overrides written in place and restored, and a probe of which
 * leaves a match reads. Only the lab workers and tests import it —
 * never the game's UI or worker state (ARCH-4, LAB constraints).
 */
import {
  AGGREGATE_CONFIG,
  AGGREGATE_PARTICIPATION_CONFIG,
  AGGREGATE_ATTRIBUTION_CONFIG,
} from './aggregate/config';
import { refreshAttributionRoles } from './aggregate/players';
import { SCRIPT_CONFIG } from './script/config';
import { STAGING_CONFIG } from './staging/config';

/** The result path, script writer and picture; no earlier detailed-engine numbers. */
export const MATCH_TUNABLES: Readonly<Record<string, object>> = {
  AGGREGATE_CONFIG,
  AGGREGATE_PARTICIPATION_CONFIG,
  AGGREGATE_ATTRIBUTION_CONFIG,
  SCRIPT_CONFIG,
  STAGING_CONFIG,
};

/** Execution reads live numbers; the lab refreshes the result path's copied role tables. */
export const LOAD_TIME_LEAVES: readonly string[] = [];

export interface TunableLeaf {
  path: string;
  value: number;
}

type Holder = Record<string, unknown>;
interface Slot {
  path: string;
  holder: Holder;
  key: string;
}

/** Every finite-number leaf, depth first in source order; a shared object is listed once. */
function slots(): Slot[] {
  const out: Slot[] = [];
  const seen = new Set<object>();
  const walk = (holder: Holder, path: string) => {
    if (seen.has(holder)) return;
    seen.add(holder);
    for (const key of Object.keys(holder)) {
      const value = holder[key];
      const at = `${path}.${key}`;
      if (typeof value === 'number' && Number.isFinite(value)) out.push({ path: at, holder, key });
      else if (value && typeof value === 'object') walk(value as Holder, at);
    }
  };
  for (const [name, config] of Object.entries(MATCH_TUNABLES)) walk(config as Holder, name);
  return out;
}

let cache: { slots: Slot[]; byPath: Map<string, Slot>; defaults: Map<string, number> } | undefined;
let quietReads = false;
function registry() {
  if (!cache) {
    const all = slots();
    cache = {
      slots: all,
      byPath: new Map(all.map((s) => [s.path, s])),
      defaults: new Map(all.map((s) => [s.path, s.holder[s.key] as number])),
    };
  }
  return cache;
}

/** Every tunable leaf with its current value. */
export function tunableLeaves(): TunableLeaf[] {
  return registry().slots.map((s) => ({ path: s.path, value: s.holder[s.key] as number }));
}

/** Each leaf's value when the registry first looked (the code's own numbers). */
export function tunableDefault(path: string): number | undefined {
  return registry().defaults.get(path);
}

/**
 * Attribution and the writer read the shared nominal shape too. A lab picture edit must never
 * change that factual input: keep the code's shape until record and script are both settled,
 * then give the lab's staging values back to its separate presentation step.
 */
export function withDefaultStaging<T>(run: () => T): T {
  const { slots: all, defaults } = registry();
  const staging = all.filter((s) => s.path.startsWith('STAGING_CONFIG.'));
  // Snapshot bookkeeping is not evidence that football or staging consumed a value.
  const wasQuiet = quietReads;
  let values: unknown[];
  try {
    quietReads = true;
    values = staging.map((s) => s.holder[s.key]);
  } finally {
    quietReads = wasQuiet;
  }
  try {
    for (const s of staging) s.holder[s.key] = defaults.get(s.path);
    return run();
  } finally {
    staging.forEach((s, i) => {
      s.holder[s.key] = values[i];
    });
  }
}

/** Every leaf back to its code value. */
export function restoreDefaults() {
  const { slots: all, defaults } = registry();
  let attributionChanged = false;
  for (const s of all) {
    if (
      s.path.startsWith('AGGREGATE_ATTRIBUTION_CONFIG.') &&
      s.holder[s.key] !== defaults.get(s.path)
    )
      attributionChanged = true;
    s.holder[s.key] = defaults.get(s.path);
  }
  if (attributionChanged) refreshAttributionRoles();
}

export interface OverrideOutcome {
  applied: string[];
  rejected: { path: string; reason: 'unknown' | 'not-a-number' | 'load-time' }[];
}

/**
 * Restores every default, then writes each listed leaf. An unknown path, a non-finite value or a
 * load-time leaf is rejected and leaves nothing else changed.
 */
export function applyOverrides(overrides: Readonly<Record<string, unknown>>): OverrideOutcome {
  const { byPath } = registry();
  restoreDefaults();
  const outcome: OverrideOutcome = { applied: [], rejected: [] };
  for (const [path, value] of Object.entries(overrides)) {
    const slot = byPath.get(path);
    if (!slot) outcome.rejected.push({ path, reason: 'unknown' });
    else if (typeof value !== 'number' || !Number.isFinite(value))
      outcome.rejected.push({ path, reason: 'not-a-number' });
    else if (LOAD_TIME_LEAVES.includes(path)) outcome.rejected.push({ path, reason: 'load-time' });
    else {
      slot.holder[slot.key] = value;
      outcome.applied.push(path);
    }
  }
  if (outcome.applied.some((p) => p.startsWith('AGGREGATE_ATTRIBUTION_CONFIG.')))
    refreshAttributionRoles();
  return outcome;
}

/** One lab operation owns its numbers only until it returns or throws. */
export function withOverrides<T>(overrides: Readonly<Record<string, unknown>>, run: () => T) {
  try {
    const outcome = applyOverrides(overrides);
    return outcome.rejected.length
      ? { ok: false as const, rejected: outcome.rejected }
      : { ok: true as const, value: run() };
  } finally {
    restoreDefaults();
  }
}

/**
 * The leaves read while `run` executes: each leaf is an accessor recording its path for the run,
 * then plain data again with the value it held.
 */
export function probeReads(run: () => void): Set<string> {
  const { slots: all } = registry();
  const reads = new Set<string>();
  const values = new Map(all.map((s) => [s.path, s.holder[s.key]]));
  for (const s of all)
    Object.defineProperty(s.holder, s.key, {
      configurable: true,
      enumerable: true,
      get() {
        if (!quietReads) reads.add(s.path);
        return values.get(s.path);
      },
      set(next) {
        values.set(s.path, next);
      },
    });
  try {
    run();
  } finally {
    for (const s of all)
      Object.defineProperty(s.holder, s.key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: values.get(s.path),
      });
  }
  return reads;
}
