import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  envelopeEngine,
  SaveCompatibilityError,
} from '../../../../packages/contracts/src/versions';
import { decodePayload } from './compression';
import { decode, recognizedLegacy } from './persistence';
import type { Envelope } from './repository';
// A genuine rules 3.0.0 envelope frozen by scripts/freeze-legacy-fixture.ts (→SAVE-19), kept as a
// 3.0.0 input on purpose: it is what an earlier-rules career looks like, whatever today's version.
// Only its header, payload and checksum are asserted: today's unpack no longer reads its counters.
const raw = readFileSync(
  new URL('../../../../tests/fixtures/legacy-rules3.haeram-save.json', import.meta.url),
  'utf8',
);
describe('legacy rules 3.0.0 fixture', () => {
  it('keeps a real rules 3.0.0 envelope with a valid checksum', async () => {
    expect(envelopeEngine(raw)).toBe('3.0.0');
    const envelope = JSON.parse(raw) as Envelope;
    expect(envelope).toMatchObject({ schema: 1, engine: '3.0.0', generation: 2 });
    const bytes = await decodePayload(envelope.codec, envelope.payload);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(envelope.checksum);
    const packed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as {
      format: string;
      world: { id: string; engine: string };
    };
    expect(packed.format).toBe('compact1');
    expect(packed.world).toMatchObject({ id: envelope.worldId, engine: '3.0.0' });
  });
  it('is recognized as an earlier career and refused by game version 0.7.0', async () => {
    expect(await recognizedLegacy(raw)).toBe(true);
    const refusal = decode(raw);
    await expect(refusal).rejects.toBeInstanceOf(SaveCompatibilityError);
    await expect(refusal).rejects.toThrow(
      '이 저장은 규칙 3.0.0 커리어입니다 — 게임 버전 0.7.0 커리어만',
    );
  });
});
