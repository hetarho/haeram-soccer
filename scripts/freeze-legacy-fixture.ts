import { writeFileSync } from 'node:fs';
import { createWorld, advanceRound } from '../packages/engine/src/index';
import { encode } from '../apps/web/src/adapters/persistence';
import { CURRENT_ENGINE_VERSION } from '../packages/contracts/src/versions';
// Freezes a genuine rules 3.0.0 checkpoint envelope so the legacy reset of the rules-4.0.0 line
// (game version 0.7.0) is tested against a real old save (→SAVE-19, →SAVE-18). Only the 3.0.0 code
// could write it; the file stays a frozen 3.0.0 input whatever the current version.
const FIXTURE = 'tests/fixtures/legacy-rules3.haeram-save.json';
async function main() {
  if ((CURRENT_ENGINE_VERSION as string) !== '3.0.0') {
    console.error(
      `Refusing to freeze: rules are ${CURRENT_ENGINE_VERSION}, the fixture is a rules 3.0.0 artefact.`,
    );
    process.exit(1);
  }
  const w = createWorld({
    country: 'ENG',
    name: 'Legacy Rules Three',
    color: '#3a5f8a',
    seed: 'legacy-rules-3',
    level: 'normal',
  });
  for (let round = 0; round < 3; round++) advanceRound(w, undefined, false);
  const raw = await encode(w, 2, 1);
  writeFileSync(FIXTURE, raw);
  console.log(`Wrote ${FIXTURE} (${raw.length} chars, rules ${w.engine})`);
}
main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
