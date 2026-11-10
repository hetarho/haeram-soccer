// Test-only fake Canvas 2D context: every property is a recording function, any assignment is
// accepted and recorded (synthetic, ARCH-21).
export interface RecordedCall {
  name: string;
  args: unknown[];
}
export interface RecordedSet {
  name: string;
  value: unknown;
}

export function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
  sets: RecordedSet[];
} {
  const calls: RecordedCall[] = [];
  const sets: RecordedSet[] = [];
  const proxy = new Proxy(
    {},
    {
      get: (_target, name) =>
        typeof name === 'string'
          ? (...args: unknown[]) => {
              calls.push({ name, args });
            }
          : undefined,
      set: (_target, name, value: unknown) => {
        sets.push({ name: String(name), value });
        return true;
      },
    },
  );
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls, sets };
}
