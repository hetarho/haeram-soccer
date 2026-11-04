interface Clock {
  now(): number;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
}
const CLOCK: Clock = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (timer) => window.clearTimeout(timer),
};

/** Runs once at a monotonic deadline; returns its cancellation. */
export function atDeadline(at: number, action: () => void, clock: Clock = CLOCK) {
  let timer: number | undefined,
    active = true;
  const check = () => {
    if (!active) return;
    const remaining = at - clock.now();
    if (remaining > 0) timer = clock.setTimeout(check, Math.ceil(remaining));
    else {
      active = false;
      action();
    }
  };
  check();
  return () => {
    active = false;
    if (timer !== undefined) clock.clearTimeout(timer);
  };
}
