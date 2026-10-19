import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { envelopeEngine } from '../../../../packages/contracts/src/versions';
import { readCheckpoint } from './persistence';
// A genuine rules 3.0.0 envelope frozen by scripts/freeze-legacy-fixture.ts (→SAVE-19). Only its
// header and decoding are asserted: what current code accepts as a world changes with the rules.
const raw = readFileSync(
  new URL('../../../../tests/fixtures/legacy-rules3.haeram-save.json', import.meta.url),
  'utf8',
);
describe('legacy rules 3.0.0 fixture', () => {
  it('keeps a real rules 3.0.0 envelope with a valid checksum', async () => {
    expect(envelopeEngine(raw)).toBe('3.0.0');
    const { envelope } = await readCheckpoint(raw, ['3.0.0']);
    expect(envelope.engine).toBe('3.0.0');
    expect(envelope.generation).toBe(2);
  });
});
