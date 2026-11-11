import { expect, it } from 'vitest';
import { canonical } from '../../packages/contracts/src/index';
import { diagnosticCanonical } from './digest';

it('keeps every finite JSON value and canonical object ordering', () => {
  const value = { z: [1.25, -8, null, 'NaN'], a: { absent: undefined, present: true } };
  expect(diagnosticCanonical(value)).toBe(canonical(value));
  expect(diagnosticCanonical({ b: Infinity, a: NaN })).toBe(
    diagnosticCanonical({ a: NaN, b: Infinity }),
  );
});

it('does not silently turn NaN or either infinity into null or source prose', () => {
  const values = [null, 0, NaN, Infinity, -Infinity, 'NaN', 'Infinity', '-Infinity'];
  expect(new Set(values.map(diagnosticCanonical)).size).toBe(values.length);
  expect(diagnosticCanonical([NaN, Infinity])).not.toBe(diagnosticCanonical([Infinity, NaN]));
});
