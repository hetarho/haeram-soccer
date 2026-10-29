/**
 * The grid engine's numbers as the match lab tunes them (→LAB-3): every exported `*_CONFIG` object,
 * its finite-number leaves by path, overrides written in place and restored, and a probe of which
 * leaves a match reads. It reaches grid execution, so only the lab worker and tests import it —
 * never the game's UI or worker state (ARCH-4, LAB constraints).
 */
import { BOX_CONFIG } from './box';
import { COORDINATION_CONFIG } from './coordination';
import { DISORDER_CONFIG, FREEDOM_CONFIG, SWAP_CONFIG, TENDENCY_MOVEMENT_CONFIG } from './freedom';
import { CARD_CONFIG } from './discipline';
import { CHANGES_CONFIG } from './changes';
import { LANE_CONFIG, SHADOW_CONFIG } from './lanes';
import { GRID_BALL_CONFIG, GRID_MOVEMENT_CONFIG, IN_STRIDE_CONFIG } from './movement';
import { ADDED_CONFIG } from './engine';
import { STRENGTH_CONFIG } from './state';
import { TENDENCY_CONFIG } from './tendencies';
import { INTENTION_CONFIG } from './intentions';
import { DUEL_CONFIG, SHOT_CONFIG } from './resolve';
import { MATCH_MOTION_CONFIG, PLAYBACK_CONFIG } from './playback';
import { DECISION_CONFIG } from './decide';
import { TAG_CONFIG } from './tags';
import { RESTART_CONFIG } from './restarts';
import { SHAPE_CONFIG } from './shape';

/** Every grid configuration object by its export name. */
export const GRID_TUNABLES: Readonly<Record<string, object>> = {
  BOX_CONFIG,
  COORDINATION_CONFIG,
  FREEDOM_CONFIG,
  DISORDER_CONFIG,
  SWAP_CONFIG,
  TENDENCY_MOVEMENT_CONFIG,
  CARD_CONFIG,
  CHANGES_CONFIG,
  LANE_CONFIG,
  SHADOW_CONFIG,
  GRID_MOVEMENT_CONFIG,
  GRID_BALL_CONFIG,
  IN_STRIDE_CONFIG,
  ADDED_CONFIG,
  STRENGTH_CONFIG,
  TENDENCY_CONFIG,
  INTENTION_CONFIG,
  DUEL_CONFIG,
  SHOT_CONFIG,
  PLAYBACK_CONFIG,
  MATCH_MOTION_CONFIG,
  DECISION_CONFIG,
  TAG_CONFIG,
  RESTART_CONFIG,
  SHAPE_CONFIG,
};

/**
 * Leaves copied into module constants when the grid loads (FULL_TURN, SECONDS_PER_MOTION,
 * MATCH_MOTION_CONFIG.ball): an override would not reach the copy, so the lab shows them read-only.
 * tunables.test.ts scans the grid sources so this list stays complete.
 */
export const LOAD_TIME_LEAVES: readonly string[] = [
  'GRID_MOVEMENT_CONFIG.step',
  'GRID_MOVEMENT_CONFIG.turn',
  'PLAYBACK_CONFIG.flight.maxLoft',
  'PLAYBACK_CONFIG.motionSecondsPerMinute',
];

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
  for (const [name, config] of Object.entries(GRID_TUNABLES)) walk(config as Holder, name);
  return out;
}

let cache: { slots: Slot[]; byPath: Map<string, Slot>; defaults: Map<string, number> } | undefined;
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

/** Every leaf back to its code value. */
export function restoreDefaults() {
  const { slots: all, defaults } = registry();
  for (const s of all) s.holder[s.key] = defaults.get(s.path);
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
  return outcome;
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
        reads.add(s.path);
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
