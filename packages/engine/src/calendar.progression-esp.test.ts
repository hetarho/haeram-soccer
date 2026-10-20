import { describe, it } from 'vitest';
import { recordsSameFacts } from './calendar.testkit';

// One country per file so the two long parity runs go side by side.
describe('persistent season calendar', () => {
  it.each([['ESP', 'one-order']] as const)(
    'every progression mode records the same facts (%s %s)',
    recordsSameFacts,
  );
});
