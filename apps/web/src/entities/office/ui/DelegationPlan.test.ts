import { describe, expect, it } from 'vitest';
import { message } from '../../../../../../packages/contracts/src/messages';

describe('the live cash-floor summary (→ECON-33)', () => {
  it('names the projection, required floor and available money', () => {
    const text = message('delegation.floor.summary', {
      projected: '£10,000',
      floor: '£2,000',
      spendable: '£8,000',
    });
    for (const amount of ['£10,000', '£2,000', '£8,000']) expect(text).toContain(amount);
  });
});
