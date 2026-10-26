/** Explicitly regenerate prepared browser setup after a relevant fixture/contract change. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { validateWorld } from '../packages/contracts/src/schema';
import {
  buildManagerActivationWorld,
  buildManagerJourneyWorld,
} from '../tests/fixtures/manager-career-builders';
import type { PreparedWorld } from '../tests/fixtures/prepared-world';
import { computationFingerprint, sourceGraph } from './lib/source-graph';

if (!process.argv.includes('--write')) throw new Error('Regeneration requires --write');
const source = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  computation: computationFingerprint(
    sourceGraph(process.cwd()),
    ['scripts/prepare-manager-fixtures.ts', 'tests/fixtures/manager-career-builders.ts'],
    ['packages/catalogs/data', 'package.json', 'pnpm-lock.yaml'],
  ).sha256,
};
mkdirSync('tests/fixtures/prepared', { recursive: true });
for (const [name, build] of [
  ['manager-journey', buildManagerJourneyWorld],
  ['manager-activation', buildManagerActivationWorld],
] as const) {
  console.log(`Preparing ${name} once for all browser projects and viewports`);
  const json = JSON.stringify(validateWorld(build()));
  const fixture: PreparedWorld = {
    format: 1,
    synthetic: true,
    name,
    source,
    sha256: createHash('sha256').update(json).digest('hex'),
    gzip: gzipSync(json, { level: 9 }).toString('base64'),
  };
  writeFileSync(`tests/fixtures/prepared/${name}.json`, JSON.stringify(fixture, null, 2) + '\n');
  console.log(
    `${name}: ${json.length} uncompressed characters, ${fixture.gzip.length} base64 characters`,
  );
}
