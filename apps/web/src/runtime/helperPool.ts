// Type-only engine imports: the client reads HELPER_CONFIG from here without loading the engine.
import type { MatchPlayback, World } from '../../../../packages/contracts/src/types';
import type {
  FixtureReadCopy,
  RoundJob,
  RoundJobResult,
} from '../../../../packages/engine/src/round-jobs';

/**
 * Helper workers for an own match day's other league fixtures (→ARCH-6). Two suffice: our match
 * is the critical path, and four measured no faster. Below `minCores` the engine worker computes
 * them itself. A helper failing or answering later than `timeoutMs` ends their use for the session.
 */
export const HELPER_CONFIG = { count: 2, minCores: 4, timeoutMs: 8000 } as const;

/** One helper's share of a round: the read copy as one JSON string and its jobs in fixture order. */
export interface HelperJob {
  id: number;
  copy: string;
  jobs: RoundJob[];
}
/** A share's answer, its results in the share's order, or why it could not compute them. */
export interface HelperReply {
  id: number;
  results?: RoundJobResult[];
  error?: string;
}
/** The engine worker's end of a helper's channel (a MessagePort in the browser). */
export interface HelperPort {
  postMessage(job: HelperJob): void;
  onmessage: ((event: { data: HelperReply }) => void) | null;
}

export class HelperPool {
  private serial = 0;
  private failed = false;
  /** Settles the round in flight with no results: the engine then computes its jobs. */
  private abandon?: () => void;
  constructor(
    private ports: readonly HelperPort[],
    private timeoutMs: number = HELPER_CONFIG.timeoutMs,
  ) {}
  get active() {
    return !this.failed && this.ports.length > 0;
  }
  /** Ends helper use: this round and every later one are computed on the engine worker. */
  disable() {
    this.failed = true;
    this.abandon?.();
  }
  /**
   * Splits the jobs across the helpers in contiguous shares and resolves their results in job
   * order, or `undefined` when the pool is off or any helper fails or runs out of time. It never
   * throws: it runs inside `prepareRound`, which has already begun the day.
   */
  run(copy: FixtureReadCopy, jobs: readonly RoundJob[]): Promise<RoundJobResult[] | undefined> {
    if (!this.active) return Promise.resolve(undefined);
    if (!jobs.length) return Promise.resolve([]);
    let text: string;
    try {
      text = JSON.stringify(copy);
    } catch {
      this.disable();
      return Promise.resolve(undefined);
    }
    const id = ++this.serial;
    const helpers = Math.min(this.ports.length, jobs.length);
    const shares = Array.from({ length: helpers }, (_, i) =>
      jobs.slice(
        Math.floor((i * jobs.length) / helpers),
        Math.floor(((i + 1) * jobs.length) / helpers),
      ),
    );
    return new Promise((resolve) => {
      const answers: (RoundJobResult[] | undefined)[] = new Array(helpers);
      let left = helpers;
      const finish = (results: RoundJobResult[] | undefined) => {
        clearTimeout(timer);
        this.abandon = undefined;
        for (const port of this.ports) port.onmessage = null;
        resolve(results);
      };
      const timer = setTimeout(() => this.disable(), this.timeoutMs);
      this.abandon = () => finish(undefined);
      try {
        shares.forEach((share, i) => {
          const port = this.ports[i]!;
          port.onmessage = ({ data }) => {
            if (data?.id !== id || answers[i]) return;
            if (data.error !== undefined || data.results?.length !== share.length) {
              this.disable();
              return;
            }
            answers[i] = data.results;
            if (--left === 0) finish(answers.flatMap((answer) => answer!));
          };
          port.postMessage({ id, copy: text, jobs: share });
        });
      } catch {
        // A port that cannot take the share (closed, uncloneable) fails the pool like a helper.
        this.disable();
      }
    });
  }
}

/** The engine's day steps the host plays a day with (injected so the pool stays engine-free). */
export interface DaySteps {
  prepareRound(
    w: World,
    start: (copy: FixtureReadCopy, jobs: readonly RoundJob[]) => void,
    observe?: boolean,
  ): boolean;
  completeRound(
    w: World,
    results: readonly RoundJobResult[] | undefined,
  ): MatchPlayback | undefined;
  advanceDays(
    w: World,
    days: number,
    settlement?: undefined,
    observe?: boolean,
  ): MatchPlayback | undefined;
}
/**
 * The next day, as `advanceDays(w, 1)` plays it. On a league match day with our fixture the
 * round's other fixtures go to the helpers while our match plays here, and the day completes once
 * they answer, so the step is a promise; every other day, or without helpers, steps at once.
 */
export function playDay(
  pool: HelperPool | undefined,
  w: World,
  observe: boolean,
  steps: DaySteps,
): MatchPlayback | undefined | Promise<MatchPlayback | undefined> {
  let results: Promise<RoundJobResult[] | undefined> | undefined;
  if (
    !pool?.active ||
    !steps.prepareRound(w, (copy, jobs) => (results = pool.run(copy, jobs)), observe)
  )
    return steps.advanceDays(w, 1, undefined, observe);
  return (results ?? Promise.resolve(undefined)).then((r) => steps.completeRound(w, r));
}
