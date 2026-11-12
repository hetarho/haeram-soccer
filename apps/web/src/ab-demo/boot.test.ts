// ab-demo scaffold: the dev-only demo entry reads its parameter and leaves a plain address behind.
import { describe, expect, it } from 'vitest';
import { addressWithoutDemo, requestedDemo } from './boot';

describe('ab-demo entry', () => {
  it('asks for one of the two demo careers only', () => {
    expect(requestedDemo('?ab-demo=finance')).toBe('finance');
    expect(requestedDemo('?view=x&ab-demo=finance-tight')).toBe('finance-tight');
    expect(requestedDemo('')).toBeUndefined();
    expect(requestedDemo('?ab-demo=')).toBeUndefined();
    expect(requestedDemo('?ab-demo=toString')).toBeUndefined();
  });
  it('drops only the demo parameter from the address', () => {
    expect(addressWithoutDemo('/', '?ab-demo=finance', '')).toBe('/');
    expect(addressWithoutDemo('/club', '?ab-demo=finance&view=academy', '#top')).toBe(
      '/club?view=academy#top',
    );
  });
});
