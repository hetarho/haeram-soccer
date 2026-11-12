/** Explicitly regenerate prepared browser setup after a relevant fixture/contract change. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { validateWorld } from '../packages/contracts/src/schema';
import { message as sourceMessage } from '../packages/contracts/src/messages';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { advanceDays } from '../packages/engine/src/season';
import { daysUntilNextMatch } from '../packages/engine/src/calendar';
import { MATCH_MODEL_RELEASE } from '../packages/engine/src/match-model-release';
import { advanceToNextMatch } from '../packages/engine/src/testing';
import {
  buildManagerActivationWorld,
  buildManagerJourneyWorld,
} from '../tests/fixtures/manager-career-builders';
import type { PreparedWorld } from '../tests/fixtures/prepared-world';
import { computationFingerprint, sourceGraph } from './lib/source-graph';

if (!process.argv.includes('--write')) throw new Error('Regeneration requires --write');
const source = {
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  computation: computationFingerprint(
    sourceGraph(process.cwd()),
    ['scripts/prepare-manager-fixtures.ts', 'tests/fixtures/manager-career-builders.ts'],
    ['packages/catalogs/data', 'package.json', 'pnpm-lock.yaml'],
  ).sha256,
};
mkdirSync('tests/fixtures/prepared', { recursive: true });
/** A small lived setup, not a full season: the first own match is tomorrow and has a goal clip. */
function buildScriptedJourneyWorld() {
  for (let seed = 0; seed < 8; seed++) {
    const world = careerWorld(
      { country: 'ENG', year: 2024, seed: `scripted-journey-${seed}` },
      MATCH_MODEL_RELEASE,
    );
    world.settings!.mode = 'manual';
    world.settings!.observations.matchEve = true;
    advanceDays(world, daysUntilNextMatch(world)! - 1, undefined, false);
    const probe = advanceToNextMatch(structuredClone(world));
    if (probe?.script && probe.record.score.home + probe.record.score.away > 0) return world;
  }
  throw new Error(sourceMessage('copy.fixture.a74e657053'));
}
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
for (const [name, build] of [
  ['manager-journey', buildManagerJourneyWorld],
  ['manager-activation', buildManagerActivationWorld],
  ['scripted-journey', buildScriptedJourneyWorld],
] as const) {
  if (only && only !== name) continue;
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
