/**
 * T689 measurement preload (no engine source change): applies the JSON behaviour patch named by
 * `T689_PATCH_FILE` to the live engine configs before any match is built. Forked workers inherit
 * execArgv and env, so every worker plays the same candidate; a setting missing from the configs
 * throws (`applyBehaviour`).
 *
 *   env T689_PATCH_FILE=artifacts/benchmarks/scoring-261104/candidates/room.json \
 *     pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts scripts/grid-bands.ts --report ...
 */
import { readFileSync } from 'node:fs';
import { applyBehaviour } from './t328-counter-roles-variants';

const file = process.env.T689_PATCH_FILE;
if (file) {
  const raw = readFileSync(file, 'utf8');
  applyBehaviour(JSON.parse(raw) as Parameters<typeof applyBehaviour>[0]);
  if (!process.argv.includes('--worker'))
    console.log(`T689 candidate patch applied from ${file}: ${raw.trim()}`);
}
