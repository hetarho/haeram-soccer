/**
 * T943: the owned-children step of T916's recipe. Each stage is owned as soon as it starts. A
 * coordinator signal, the timebox, or any exceptional exit after a stage starts (a later stage's
 * failed start included) cancels and awaits every started stage before this returns or rethrows,
 * so the caller's heavy lock is released only after its children have exited.
 */
export interface OwnedStage<T> {
  done: Promise<T>;
  cancel: () => void;
}
export interface OwnedOutcome<T> {
  /** One settled result per started stage, in start order; stages never started are absent. */
  done: T[];
  timedOut: boolean;
  interrupted: NodeJS.Signals | null;
}
export const OWNED_SIGNALS: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGHUP'];

export async function runOwned<T>(
  starts: readonly (() => OwnedStage<T>)[],
  options: {
    timeoutMs: number;
    signals?: readonly NodeJS.Signals[];
    on?: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => void;
    off?: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => void;
  },
): Promise<OwnedOutcome<T>> {
  const signals = options.signals ?? OWNED_SIGNALS;
  const on = options.on ?? ((signal, listener) => process.on(signal, listener));
  const off = options.off ?? ((signal, listener) => process.off(signal, listener));
  const children: OwnedStage<T>[] = [];
  let interrupted: NodeJS.Signals | null = null;
  let timedOut = false;
  const cancelAll = () => {
    for (const child of children) child.cancel();
  };
  const onSignal = (signal: NodeJS.Signals) => {
    interrupted ??= signal;
    cancelAll();
  };
  for (const signal of signals) on(signal, onSignal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done: T[] | undefined;
  try {
    for (const start of starts) {
      if (interrupted) break;
      children.push(start());
    }
    if (interrupted) cancelAll();
    timer = setTimeout(() => {
      timedOut = true;
      cancelAll();
    }, options.timeoutMs);
    done = await Promise.all(children.map((child) => child.done));
  } finally {
    clearTimeout(timer);
    if (!done) {
      cancelAll();
      await Promise.allSettled(children.map((child) => child.done));
    }
    for (const signal of signals) off(signal, onSignal);
  }
  return { done, timedOut, interrupted };
}
