import { describe, expect, it } from 'vitest';
import { median, trimmed, verdict } from './stats';

describe('paired bench statistics', () => {
  it('takes the middle value or the mean of the middle two', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('trims an eighth at each end from 8 values on and nothing below', () => {
    expect(trimmed([1, 2, 3, 4, 5, 6, 7])).toBe(4);
    expect(trimmed([100, 2, 3, 4, 5, 6, 7, -100])).toBe(4.5);
    expect(trimmed([...Array(15).fill(0), 1000])).toBe(0);
  });

  it('calls faster, slower or no difference from the interval', () => {
    const near = (centre: number) => Array.from({ length: 16 }, (_, i) => centre + (i % 4) * 0.002);
    expect(verdict(near(-0.05)).call).toBe('faster');
    expect(verdict(near(0.05)).call).toBe('slower');
    const spread = Array.from({ length: 16 }, (_, i) => (i % 2 ? 1 : -1) * 0.01 * (1 + (i % 3)));
    expect(verdict(spread).call).toBe('no difference');
  });

  it('gives the same interval for the same numbers', () => {
    const logs = [0.01, -0.02, 0.005, -0.01, 0.02, -0.003, 0.0, 0.012];
    expect(verdict(logs)).toEqual(verdict(logs));
  });
});
