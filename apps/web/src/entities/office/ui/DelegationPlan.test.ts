import { describe, expect, it } from 'vitest';
import { coverageLine } from './DelegationPlan';

describe("the plan's coverage of a planned loss (→ECON-33)", () => {
  it('reads capital covering less than a tenth of a season as less, never as no cash', () => {
    const plan = (capital: string, covers?: number) => ({ loss: '1000', capital, covers });
    expect(coverageLine(plan('5000', 5), '£1,000')).toContain('5시즌분');
    // Positive capital whose coverage rounds down to zero.
    const little = coverageLine(plan('50', 0), '£1,000');
    expect(little).toContain('미만');
    expect(little).not.toContain('쓸 수 있는 현금 없음');
    expect(coverageLine(plan('0', 0), '£1,000')).toContain('쓸 수 있는 현금 없음');
    expect(coverageLine({ loss: '0', capital: '0' }, '£0')).toContain('계획 적자 없음');
  });
});
