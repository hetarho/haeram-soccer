import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { MATCH_MODEL_REVISIONS } from '../../packages/contracts/src/match-model';
import { decodePreparedWorld, preparedWorld, type PreparedWorld } from './prepared-world';

it('validates prepared careers and returns independent copies without replaying matches', () => {
  const a = preparedWorld('manager-journey');
  const b = preparedWorld('manager-journey');
  expect(a.managerHistory!.tenures.length).toBeGreaterThan(20);
  expect(a.ownMatches.length).toBeGreaterThan(0);
  expect(a).not.toBe(b);
  a.cash = '1';
  expect(b.cash).not.toBe('1');
  const activation = preparedWorld('manager-activation');
  expect(activation.managerHistory).toBeUndefined();
  // Saved by the game before this one: the revision before today's (→SAVE-23).
  expect(activation.matchModel!.revision).toBe(MATCH_MODEL_REVISIONS.at(-2));
  expect(activation.ownMatches.every((m) => m.model === MATCH_MODEL_REVISIONS.at(-2))).toBe(true);
});
it('rejects altered and schema-invalid prepared data', () => {
  const fixture: PreparedWorld = {
    format: 1,
    synthetic: true,
    name: 'invalid',
    source: { commit: 'test', dirty: false, computation: 'test' },
    sha256: 'changed',
    gzip: gzipSync('{}').toString('base64'),
  };
  expect(() => decodePreparedWorld(fixture)).toThrow('checksum');
  fixture.sha256 = createHash('sha256').update('{}').digest('hex');
  expect(() => decodePreparedWorld(fixture)).toThrow();
});
