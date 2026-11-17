import { describe, expect, it } from 'vitest';
import { runOwned, type OwnedStage } from './generation-repair-owned';

/** A synthetic stage that settles only when cancelled or released, recording both. */
function stage(log: string[], name: string) {
  let settle!: (value: string) => void;
  const done = new Promise<string>((resolve) => (settle = resolve));
  const owned: OwnedStage<string> & { release: () => void } = {
    done,
    cancel: () => {
      log.push(`cancel:${name}`);
      setTimeout(() => {
        log.push(`exit:${name}`);
        settle(`cancelled:${name}`);
      }, 5);
    },
    release: () => settle(`passed:${name}`),
  };
  return owned;
}
const signals = () => {
  const listeners = new Map<NodeJS.Signals, (signal: NodeJS.Signals) => void>();
  return {
    listeners,
    on: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) =>
      void listeners.set(signal, listener),
    off: (signal: NodeJS.Signals) => void listeners.delete(signal),
  };
};

describe('T943 owned children', () => {
  it('cancels and awaits a started child when a later child fails to start', async () => {
    const log: string[] = [];
    const hooks = signals();
    await expect(
      runOwned(
        [
          () => stage(log, 'first'),
          () => {
            throw new Error('EEXIST');
          },
        ],
        { timeoutMs: 60_000, ...hooks },
      ),
    ).rejects.toThrow('EEXIST');
    // The rejection arrives only after the started child exited; its listeners are gone.
    expect(log).toEqual(['cancel:first', 'exit:first']);
    expect(hooks.listeners.size).toBe(0);
  });

  it('cancels every started child on a coordinator signal and reports it', async () => {
    const log: string[] = [];
    const hooks = signals();
    const run = runOwned([() => stage(log, 'a'), () => stage(log, 'b')], {
      timeoutMs: 60_000,
      ...hooks,
    });
    hooks.listeners.get('SIGTERM')!('SIGTERM');
    const outcome = await run;
    expect(outcome).toEqual({
      done: ['cancelled:a', 'cancelled:b'],
      timedOut: false,
      interrupted: 'SIGTERM',
    });
    expect(hooks.listeners.size).toBe(0);
  });

  it('leaves timed-out children cancelled, never passed', async () => {
    const log: string[] = [];
    const outcome = await runOwned([() => stage(log, 'slow')], { timeoutMs: 10, ...signals() });
    expect(outcome).toEqual({ done: ['cancelled:slow'], timedOut: true, interrupted: null });
  });

  it('returns each finished child in start order without cancelling it', async () => {
    const log: string[] = [];
    const stages = [stage(log, 'x'), stage(log, 'y')];
    const run = runOwned(
      stages.map((s) => () => s),
      { timeoutMs: 60_000, ...signals() },
    );
    for (const s of stages) s.release();
    expect(await run).toEqual({
      done: ['passed:x', 'passed:y'],
      timedOut: false,
      interrupted: null,
    });
    expect(log).toEqual([]);
  });
});
