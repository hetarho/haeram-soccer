// Type-only engine imports: the client reads HELPER_CONFIG from here without loading the engine.
import type { MatchPlayback, World } from '../../../../packages/contracts/src/types';
import type {
  FixtureReadCopy,
  RoundJob,
  RoundJobResult,
} from '../../../../packages/engine/src/round-jobs';
import {
  FIXTURE_HELPER_PROTOCOL,
  FixtureReplicaWriter,
  type HelperJob,
  type HelperReply,
} from './fixtureReplica';
export type { HelperJob, HelperReply } from './fixtureReplica';

/**
 * Helper workers for an own match day's other league fixtures (→ARCH-6). The measured core
 * counts use three; other eligible devices use two. Below `minCores` the engine worker computes
 * them itself. A helper failing or answering later than `timeoutMs` ends their use for the session.
 */
export const HELPER_CONFIG = {
  count: 2,
  countByCores: { 6: 3, 8: 3, 12: 3 } as Readonly<Record<number, number>>,
  minCores: 3,
  timeoutMs: 8000,
} as const;

/** The engine worker's end of a helper's channel (a MessagePort in the browser). */
export interface HelperPort {
  postMessage(job: HelperJob): void;
  onmessage: ((event: { data: HelperReply }) => void) | null;
}

export class HelperPool {
  private serial = 0;
  private failed = false;
  private session = crypto.randomUUID();
  private writer = new FixtureReplicaWriter();
  private revisions: number[];
  private world = new WeakSet<World>();
  /** Settles the round in flight with no results: the engine then computes its jobs. */
  private abandon?: () => void;
  constructor(
    private ports: readonly HelperPort[],
    private timeoutMs: number = HELPER_CONFIG.timeoutMs,
    private simulate = async (copy: FixtureReadCopy, jobs: readonly RoundJob[]) => {
      const { simulateRoundJob } = await import('../../../../packages/engine/src/round-jobs');
      return jobs.map((job) => simulateRoundJob(copy, job));
    },
    private engineShare = true,
  ) {
    this.revisions = ports.map(() => 0);
  }
  /** A loaded/founded world starts a new replica session, without retaining the old world. */
  useWorld(world: World) {
    if (this.world.has(world)) return;
    if (this.abandon) {
      this.disable();
      return;
    }
    this.world = new WeakSet([world]);
    this.session = crypto.randomUUID();
    this.writer.reset();
    this.revisions.fill(0);
  }
  get active() {
    return !this.failed && this.ports.length > 0;
  }
  /** Ends helper use: this round and every later one are computed on the engine worker. */
  disable() {
    this.failed = true;
    this.writer.reset();
    this.abandon?.();
  }
  /**
   * Splits jobs into contiguous helper and engine shares and resolves them in job order, or
   * `undefined` when a helper fails or runs out of time. The engine share starts after our match.
   * It never throws into `prepareRound`, which has already begun the day.
   */
  run(
    copy: FixtureReadCopy,
    jobs: readonly RoundJob[],
    worldRevision = 0,
  ): Promise<RoundJobResult[] | undefined> {
    if (!this.active) return Promise.resolve(undefined);
    if (this.abandon) {
      this.disable();
      return Promise.resolve(undefined);
    }
    if (!jobs.length) return Promise.resolve([]);
    const id = ++this.serial,
      session = this.session;
    let encoded: ReturnType<FixtureReplicaWriter['encode']>;
    try {
      encoded = this.writer.encode(copy, id);
    } catch {
      this.disable();
      return Promise.resolve(undefined);
    }
    const helpers = Math.min(
      this.ports.length,
      this.engineShare ? Math.max(1, jobs.length - 1) : jobs.length,
    );
    const participants = Math.min(helpers + (this.engineShare ? 1 : 0), jobs.length);
    const shares = Array.from({ length: helpers }, (_, i) =>
      jobs.slice(
        Math.floor((i * jobs.length) / participants),
        Math.floor(((i + 1) * jobs.length) / participants),
      ),
    );
    return new Promise((resolve) => {
      const answers: (RoundJobResult[] | undefined)[] = new Array(participants);
      let left = participants;
      let settled = false;
      const finish = (results: RoundJobResult[] | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.abandon = undefined;
        for (const port of this.ports) port.onmessage = null;
        resolve(results);
      };
      const timer = setTimeout(() => this.disable(), this.timeoutMs);
      this.abandon = () => finish(undefined);
      try {
        shares.forEach((share, i) => {
          if (settled) return;
          const port = this.ports[i]!;
          port.onmessage = ({ data }) => {
            if (settled || data?.id !== id || data.session !== session || answers[i]) return;
            if (
              data.protocol !== FIXTURE_HELPER_PROTOCOL ||
              data.worldRevision !== worldRevision ||
              data.revision !== id ||
              data.error !== undefined ||
              !Array.isArray(data.results) ||
              data.results.length !== share.length
            ) {
              this.disable();
              return;
            }
            this.revisions[i] = id;
            answers[i] = data.results;
            if (--left === 0) finish(answers.flatMap((answer) => answer!));
          };
          const delta = encoded.base > 0 && this.revisions[i] === encoded.base;
          port.postMessage({
            protocol: FIXTURE_HELPER_PROTOCOL,
            session,
            id,
            worldRevision,
            base: delta ? encoded.base : 0,
            ...(delta ? { patch: encoded.patch! } : { copy: encoded.snapshot() }),
            jobs: share,
          });
        });
        if (participants > helpers && !settled) {
          const local = jobs.slice(Math.floor((helpers * jobs.length) / participants));
          // The microtask starts only after prepareRound has played our match.
          queueMicrotask(() => {
            if (settled) return;
            void this.simulate(copy, local)
              .then((results) => {
                if (settled) return;
                if (results.length !== local.length) return this.disable();
                answers[helpers] = results;
                if (--left === 0) finish(answers.flatMap((answer) => answer!));
              })
              .catch(() => this.disable());
          });
        }
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
  pool?.useWorld(w);
  let results: Promise<RoundJobResult[] | undefined> | undefined;
  if (
    !pool?.active ||
    !steps.prepareRound(w, (copy, jobs) => (results = pool.run(copy, jobs, w.revision)), observe)
  )
    return steps.advanceDays(w, 1, undefined, observe);
  return (results ?? Promise.resolve(undefined)).then((r) => steps.completeRound(w, r));
}
