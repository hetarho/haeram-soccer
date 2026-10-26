import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
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
  expect(activation.matchModel).toBeUndefined();
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
