/**
 * A measurement's deep patch of the result path's configs (`--patch <json>` in
 * scripts/match-parity.ts): applied to the live configs in the measuring process and its workers
 * before any match is built, never to the source. A setting the configs do not hold throws, so a
 * patch cannot silently miss.
 */
import {
  AGGREGATE_ATTRIBUTION_CONFIG,
  AGGREGATE_CONFIG,
  AGGREGATE_PARTICIPATION_CONFIG,
} from '../../packages/engine/src/aggregate/config';
import { CHANGES_CONFIG } from '../../packages/engine/src/match/changes';
import { STRENGTH_CONFIG } from '../../packages/engine/src/match/config';

/** A deep patch of the result path's configs, keyed by config. */
export interface ConfigPatch {
  aggregate?: object;
  attribution?: object;
  participation?: object;
  changes?: object;
  strength?: object;
}

function merge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in target)) throw new Error(`config patch names a missing setting: ${k}`);
    const t = target[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && t && typeof t === 'object')
      merge(t as Record<string, unknown>, v as Record<string, unknown>);
    else target[k] = v;
  }
}

/** Applies a patch to the live configs; call before any match is built. */
export function applyConfigPatch(patch: ConfigPatch): void {
  const targets: Record<keyof ConfigPatch, object> = {
    aggregate: AGGREGATE_CONFIG,
    attribution: AGGREGATE_ATTRIBUTION_CONFIG,
    participation: AGGREGATE_PARTICIPATION_CONFIG,
    changes: CHANGES_CONFIG,
    strength: STRENGTH_CONFIG,
  };
  for (const [k, v] of Object.entries(patch)) {
    const target = targets[k as keyof ConfigPatch];
    if (!target) throw new Error(`config patch names a config the result path does not read: ${k}`);
    merge(target as Record<string, unknown>, v as Record<string, unknown>);
  }
}
