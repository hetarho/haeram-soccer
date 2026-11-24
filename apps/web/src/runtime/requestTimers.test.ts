import { describe, expect, it } from 'vitest';
import { waitsBehindLonger } from './requestTimers';

describe('waitsBehindLonger', () => {
  const pending = (...entries: [string, number][]) =>
    entries.map(([id, timeout]) => [id, { timeout }] as [string, { timeout: number }]);

  it('keeps a command waiting while an earlier save is still unanswered', () => {
    const queue = pending(['save', 600_000], ['command', 15_000]);
    expect(waitsBehindLonger(queue, 'command')).toBe(true);
  });

  it('keeps a read waiting behind an earlier command allowed as long, which guards the worker', () => {
    // The command reported progress and is still at work; the read behind it is not lost.
    expect(waitsBehindLonger(pending(['command', 120_000], ['read', 120_000]), 'read')).toBe(true);
  });

  it('times a request out on its own once nothing at least as long is ahead of it', () => {
    expect(waitsBehindLonger(pending(['command', 15_000]), 'command')).toBe(false);
    expect(waitsBehindLonger(pending(['read', 15_000], ['command', 120_000]), 'command')).toBe(
      false,
    );
    // A longer request sent after it does not hold it: the worker answers in order.
    expect(waitsBehindLonger(pending(['command', 15_000], ['save', 600_000]), 'command')).toBe(
      false,
    );
    expect(waitsBehindLonger(pending(['save', 600_000]), 'gone')).toBe(false);
  });
});
