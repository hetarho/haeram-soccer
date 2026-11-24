/**
 * When a request to the engine worker may be taken as unanswered. The worker answers its requests
 * in the order they were sent (→ARCH-6), so one sent behind a request allowed at least as long — a
 * save, an import, a generation, a command reporting its progress — waits for it however healthy
 * the worker is; meanwhile that request's own timeout guards the worker (→SAVE-3, →SAVE-8).
 */
export interface TimedRequest {
  /** How long the request may go without a reply before the worker counts as failed. */
  timeout: number;
}

/**
 * Whether the request `id` still waits behind an earlier request with a timeout at least as long.
 * `pending` lists the requests awaiting a reply in the order they were sent.
 */
export function waitsBehindLonger(pending: Iterable<[string, TimedRequest]>, id: string): boolean {
  let longest = 0;
  for (const [key, request] of pending) {
    if (key === id) return longest >= request.timeout && longest > 0;
    longest = Math.max(longest, request.timeout);
  }
  return false;
}
