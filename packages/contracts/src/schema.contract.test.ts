import { expect, it } from 'vitest';
import { canonical } from './index';
it('round trips exact monetary strings without losing integer precision', () => {
  const facts = {
    currency: 'ITL',
    amount: '10000000000000000001',
    events: [{ id: 'e1', year: 1901 }],
  };
  expect(JSON.parse(canonical(facts))).toEqual(facts);
});
