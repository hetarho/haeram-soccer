import type { World } from '../../packages/contracts/src/types';
import { MATCH_MODEL_RELEASE } from '../../packages/engine/src/match-model-release';
import { fileURLToPath } from 'node:url';
import { cachedJson, callerFile, type CacheOptions } from './json-cache';

const SELF = fileURLToPath(import.meta.url);

/** Generic JSON setup, separate from simulatedWorld so pure tests never import simulation. */
export function cachedWorld<T = World>(id: string, build: () => T, options: CacheOptions = {}): T {
  return cachedJson(id, build, {
    ...options,
    dependencies: options.dependencies ?? [callerFile([SELF])],
    input: { value: options.input, release: MATCH_MODEL_RELEASE },
  });
}
