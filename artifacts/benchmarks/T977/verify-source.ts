import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { measurementIdentity } from '../../../scripts/lib/measurement-identity';

const [manifest] = process.argv.slice(2);
assert(manifest);
const source = JSON.parse(readFileSync(manifest, 'utf8')) as {
  dependencyFingerprints: ReturnType<typeof measurementIdentity>[];
  environment: { node: string; pnpm: string };
};
assert.equal(process.version, source.environment.node);
assert.equal(execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(), source.environment.pnpm);
assert(source.dependencyFingerprints.length > 0);
for (const expected of source.dependencyFingerprints) {
  assert.deepEqual(measurementIdentity(expected.entry), expected);
}
